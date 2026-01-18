import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { isInMeasurements, createDistanceSprite } from '../utils/three-helpers';

export function useMeasurement(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>
) {
    const [isMeasureActive, setIsMeasureActive] = useState(false);
    const measureModeRef = useRef(false);
    
    const measurementGroupRef = useRef<THREE.Group | null>(null);
    const measurementStartRef = useRef<THREE.Vector3 | null>(null);
    const measurementTempMarkerRef = useRef<THREE.Mesh | null>(null);
    const tempLineRef = useRef<THREE.Line | null>(null);
    const highlightPointRef = useRef<THREE.Mesh | null>(null);
    
    const measurePointGeometryRef = useRef<THREE.SphereGeometry | null>(null);
    const measureLineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
    const measurePointMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
    const geometryCacheRef = useRef<Map<string, THREE.BufferGeometry>>(new Map());
    
    const undoStackRef = useRef<THREE.Group[]>([]);
    const redoStackRef = useRef<THREE.Group[]>([]);

    useEffect(() => {
        if (!sceneRef.current) return;
        const scene = sceneRef.current;

        const measurementGroup = new THREE.Group();
        measurementGroup.name = 'Measurements';
        scene.add(measurementGroup);
        measurementGroupRef.current = measurementGroup;
        
        measurePointGeometryRef.current = new THREE.SphereGeometry(0.02, 16, 16);
        measureLineMaterialRef.current = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, depthWrite: false });
        measurePointMaterialRef.current = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false, depthWrite: false });

        const highlightGeo = new THREE.SphereGeometry(0.075, 16, 16);
        const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
        const highlightPoint = new THREE.Mesh(highlightGeo, highlightMat);
        highlightPoint.name = 'HighlightPoint';
        highlightPoint.visible = false;
        highlightPoint.renderOrder = 10002;
        scene.add(highlightPoint);
        highlightPointRef.current = highlightPoint;

        return () => {
             scene.remove(measurementGroup);
             scene.remove(highlightPoint);
        };
    }, [sceneRef.current]);

    const enterMeasureMode = () => {
        measureModeRef.current = true;
        setIsMeasureActive(true);
        document.body.classList.add('cursor-crosshair');
        if (highlightPointRef.current) highlightPointRef.current.visible = false;
    };

    const exitMeasureMode = () => {
        measureModeRef.current = false;
        setIsMeasureActive(false);
        measurementStartRef.current = null;
        if (measurementTempMarkerRef.current) measurementTempMarkerRef.current.visible = false;
        if (highlightPointRef.current) highlightPointRef.current.visible = false;
        if (tempLineRef.current && measurementGroupRef.current) {
            measurementGroupRef.current.remove(tempLineRef.current);
            tempLineRef.current.geometry.dispose();
            tempLineRef.current = null;
        }
        document.body.classList.remove('cursor-crosshair');

        // Remove focus from button to avoid lingering focus state
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const exitMeasureModeDeferred = () => {
        setTimeout(() => {
            exitMeasureMode();
        }, 0);
    };

    const clearMeasurements = () => {
        const group = measurementGroupRef.current;
        if (!group) return;

        group.traverse((obj) => {
            if (obj instanceof THREE.Sprite) {
                const mat = obj.material;
                if (mat.map) mat.map.dispose();
                mat.dispose();
            } else if (obj instanceof THREE.Line) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            } else if (obj instanceof THREE.Mesh) {
                if (obj.geometry !== measurePointGeometryRef.current) obj.geometry.dispose();
                const mat = obj.material;
                if (Array.isArray(mat)) mat.forEach(m => m.dispose());
                else if (mat !== measurePointMaterialRef.current) mat.dispose();
            }
        });

        while (group.children.length) group.remove(group.children[0]);

        measurementStartRef.current = null;
        if (measurementTempMarkerRef.current) {
            measurementTempMarkerRef.current.parent?.remove(measurementTempMarkerRef.current);
            measurementTempMarkerRef.current = null;
        }
        if (tempLineRef.current) {
            tempLineRef.current = null;
        }
        
        undoStackRef.current = [];
        redoStackRef.current = [];
    };

    const undoMeasurement = () => {
        const stack = undoStackRef.current;
        if (stack.length === 0) return;
        
        const last = stack.pop();
        if (last && measurementGroupRef.current) {
            measurementGroupRef.current.remove(last);
            redoStackRef.current.push(last);
        }
    };

    const redoMeasurement = () => {
        const stack = redoStackRef.current;
        if (stack.length === 0) return;
        
        const last = stack.pop();
        if (last && measurementGroupRef.current) {
            measurementGroupRef.current.add(last);
            undoStackRef.current.push(last);
        }
    };

    const addMeasurement = (start: THREE.Vector3, end: THREE.Vector3) => {
        const group = measurementGroupRef.current;
        if (!group || !measurePointGeometryRef.current || !measurePointMaterialRef.current || !measureLineMaterialRef.current) return;

        const measurement = new THREE.Group();
        measurement.name = 'MeasurementGroup';

        const startPoint = new THREE.Mesh(measurePointGeometryRef.current, measurePointMaterialRef.current);
        startPoint.name = 'MeasurementPoint';
        startPoint.position.copy(start);
        startPoint.renderOrder = 9999;

        const endPoint = new THREE.Mesh(measurePointGeometryRef.current, measurePointMaterialRef.current);
        endPoint.name = 'MeasurementPoint';
        endPoint.position.copy(end);
        endPoint.renderOrder = 9999;

        const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(lineGeom, measureLineMaterialRef.current);
        line.name = 'MeasurementLine';
        line.renderOrder = 9998;

        const distance = start.distanceTo(end);
        const label = createDistanceSprite(distance.toFixed(3));
        const mid = start.clone().add(end).multiplyScalar(0.5);
        label.position.copy(mid);

        label.renderOrder = 10000;

        measurement.add(line);
        measurement.add(startPoint);
        measurement.add(endPoint);
        measurement.add(label);
        
        group.add(measurement);

        undoStackRef.current.push(measurement);
        redoStackRef.current = [];
        
        exitMeasureModeDeferred();
    };

    const getCachedGeometry = (mesh: THREE.Mesh) => {
        const geom = mesh.geometry;
        if (!(geom instanceof THREE.BufferGeometry)) return null;
        const key = geom.uuid;
        const cache = geometryCacheRef.current;
        if (!cache.has(key)) {
            const cloned = geom.clone();
            cloned.computeBoundingSphere();
            cache.set(key, cloned);
        }
        return cache.get(key) || null;
    };

    const getSnappedPoint = (clientX: number, clientY: number, raycaster: THREE.Raycaster, mouse: THREE.Vector2): THREE.Vector3 | null => {
        const currentCamera = cameraRef.current;
        const scene = sceneRef.current;
        if (!currentCamera || !scene) return null;
  
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
  
        raycaster.setFromCamera(mouse, currentCamera);
  
        const intersects = raycaster.intersectObjects(scene.children, true);
        const hit = intersects.find((h) => {
            if (!(h.object instanceof THREE.Mesh)) return false;
            if (h.object.name === 'Ground') return false;
            if (h.object.name === 'HighlightLine') return false;
            if (h.object.name === 'MeasurementPoint') return false;
            if (h.object.name === 'MeasurementLine') return false;
            if (h.object.name === 'MeasurementLabel') return false;
            if (h.object.name === 'MeasurementTemp') return false;
            if (h.object.name === 'HighlightPoint') return false;
            if (isInMeasurements(h.object)) return false;
            return true;
        });
        if (!hit) return null;
  
        const picked = hit.point.clone();
  
        if (hit.face && hit.object instanceof THREE.Mesh) {
            const mesh = hit.object;
            const cachedGeom = getCachedGeometry(mesh);
            if (cachedGeom && cachedGeom.attributes.position) {
                const posAttr = cachedGeom.attributes.position as THREE.BufferAttribute;
                const a = hit.face.a;
                const b = hit.face.b;
                const c = hit.face.c;
                const vA = new THREE.Vector3().fromBufferAttribute(posAttr, a).applyMatrix4(mesh.matrixWorld);
                const vB = new THREE.Vector3().fromBufferAttribute(posAttr, b).applyMatrix4(mesh.matrixWorld);
                const vC = new THREE.Vector3().fromBufferAttribute(posAttr, c).applyMatrix4(mesh.matrixWorld);
  
                const sphereRadius = cachedGeom.boundingSphere ? cachedGeom.boundingSphere.radius : 1;
                const worldScale = new THREE.Vector3();
                mesh.getWorldScale(worldScale);
                const snapDist = sphereRadius * Math.max(worldScale.x, worldScale.y, worldScale.z) * 0.05; 
  
                const dA = picked.distanceTo(vA);
                const dB = picked.distanceTo(vB);
                const dC = picked.distanceTo(vC);
                let snapped = picked;
                let minD = dA;
                snapped = vA;
                if (dB < minD) {
                    minD = dB;
                    snapped = vB;
                }
                if (dC < minD) {
                    minD = dC;
                    snapped = vC;
                }
                if (minD <= snapDist) return snapped;
            }
        }
        return picked;
    };

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const onPointerMove = (event: PointerEvent) => {
            if (!measureModeRef.current) return;

            const snapped = getSnappedPoint(event.clientX, event.clientY, raycaster, mouse);

            if (snapped && highlightPointRef.current) {
                highlightPointRef.current.position.copy(snapped);
                highlightPointRef.current.visible = true;
            } else if (highlightPointRef.current) {
                highlightPointRef.current.visible = false;
            }

            if (measurementStartRef.current && measurementGroupRef.current && measureLineMaterialRef.current) {
                if (!snapped) {
                    if (tempLineRef.current && measurementGroupRef.current) {
                        measurementGroupRef.current.remove(tempLineRef.current);
                        tempLineRef.current.geometry.dispose();
                        tempLineRef.current = null;
                    }
                    return;
                }

                if (!tempLineRef.current) {
                    const geom = new THREE.BufferGeometry().setFromPoints([
                        measurementStartRef.current,
                        snapped
                    ]);
                    const line = new THREE.Line(geom, measureLineMaterialRef.current);
                    line.name = 'MeasurementTempLine';
                    line.renderOrder = 9998;
                    measurementGroupRef.current.add(line);
                    tempLineRef.current = line;
                } else {
                    const geom = tempLineRef.current.geometry as THREE.BufferGeometry;
                    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
                    posAttr.setXYZ(0, measurementStartRef.current.x, measurementStartRef.current.y, measurementStartRef.current.z);
                    posAttr.setXYZ(1, snapped.x, snapped.y, snapped.z);
                    posAttr.needsUpdate = true;
                    geom.computeBoundingSphere();
                }
            } else if (tempLineRef.current && measurementGroupRef.current) {
                measurementGroupRef.current.remove(tempLineRef.current);
                tempLineRef.current.geometry.dispose();
                tempLineRef.current = null;
            }
        };

        const onClick = (event: MouseEvent) => {
             if (!measureModeRef.current) return;
             event.stopImmediatePropagation();
             
             const picked = getSnappedPoint(event.clientX, event.clientY, raycaster, mouse);
             if (!picked) return;
       
             if (!measurementStartRef.current) {
                 measurementStartRef.current = picked.clone();
                 if (!measurementTempMarkerRef.current && measurePointGeometryRef.current) {
                     const tempMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, depthWrite: false });
                     const temp = new THREE.Mesh(measurePointGeometryRef.current, tempMat);
                     temp.name = 'MeasurementTemp';
                     temp.renderOrder = 10001;
                     measurementTempMarkerRef.current = temp;
                     measurementGroupRef.current?.add(temp);
                 }
                 if (measurementTempMarkerRef.current) {
                     measurementTempMarkerRef.current.position.copy(picked);
                     measurementTempMarkerRef.current.visible = true;
                 }
                 return;
             }
       
             const start = measurementStartRef.current.clone();
             const end = picked.clone();
             addMeasurement(start, end);
       
             measurementStartRef.current = null;
             if (measurementTempMarkerRef.current) {
                 measurementTempMarkerRef.current.visible = false;
             }
             if (tempLineRef.current && measurementGroupRef.current) {
                 measurementGroupRef.current.remove(tempLineRef.current);
                 tempLineRef.current.geometry.dispose();
                 tempLineRef.current = null;
             }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && measureModeRef.current) {
                exitMeasureMode();
            }
        };

        renderer.domElement.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('click', onClick);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
             renderer.domElement.removeEventListener('pointermove', onPointerMove);
             renderer.domElement.removeEventListener('click', onClick);
             window.removeEventListener('keydown', handleKeyDown);
        };
    }, [rendererRef.current]);

    return {
        isMeasureActive,
        measureModeRef,
        enterMeasureMode,
        exitMeasureMode,
        undoMeasurement,
        redoMeasurement,
        clearMeasurements,
        measurementGroupRef,
        highlightPointRef,
        measurementTempMarkerRef
    };
}
