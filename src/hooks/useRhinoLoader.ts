import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { zoomToBox } from '../utils/camera-utils';
import type { DisplayMode } from './useSettings';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UNIT_NAMES: Record<number, string> = {
    0: 'None',
    1: 'Angstroms',
    2: 'Millimeters',
    3: 'Centimeters',
    4: 'Meters',
    5: 'Kilometers',
    6: 'Microinches',
    7: 'Mils',
    8: 'Inches',
    9: 'Feet',
    10: 'Miles'
};

export function useRhinoLoader(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    controlsRef: React.MutableRefObject<any>,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    dirLightRef: React.MutableRefObject<THREE.DirectionalLight | null>,
    updateGround: () => void,
    updateHighlights: () => void,
    clearMeasurements: () => void,
    mergeGeometry: boolean,
    loadMultiFile: boolean,
    displayMode: DisplayMode,
    updateShadowFrustum: () => void,
    selectedObjectsRef: React.MutableRefObject<Set<string>>
) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [modelUnit, setModelUnit] = useState<string>('');
    const unitSetRef = useRef(false);
    const [layers, setLayers] = useState<{ index: number; name: string; isVisible: boolean; locked: boolean; parentLayerId: string; id: string; children?: any[] }[]>([]);
    const layerStateRef = useRef<Record<string, { isVisible: boolean; locked: boolean }>>({});
    const rhinoLoaderCtorRef = useRef<any>(null);
    const pendingLoadsRef = useRef(0);
    const loadProgressRef = useRef<Map<number, number>>(new Map());
    const loadIdRef = useRef(0);

    const recomputeOverallProgress = () => {
        const values = Array.from(loadProgressRef.current.values());
        if (values.length === 0) return 0;
        const sum = values.reduce((acc, v) => acc + v, 0);
        return Math.round(sum / values.length);
    };

    // Recursive helper to build tree
    const buildLayerTree = (layers: any[]) => {
        const layerMap = new Map<string, any>();
        const rootLayers: any[] = [];

        // First pass: create nodes and map them
        layers.forEach(layer => {
            const layerIndex = layer.index !== undefined ? layer.index : layer.layerIndex;
            const isVisible = layer.isVisible !== false && layer.visible !== false;
            const name = layer.name || `Layer ${layerIndex}`;
            const id = layer.id;
            const parentId = layer.parentLayerId;
            
            // Initialize state for flat lookup
            const key = `layer_${layerIndex}`;
            if (!layerStateRef.current[key]) {
                layerStateRef.current[key] = { isVisible, locked: false };
            }

            layerMap.set(id, {
                index: layerIndex,
                name,
                isVisible,
                locked: false,
                id,
                parentLayerId: parentId,
                children: []
            });
        });

        // Second pass: build tree structure
        layerMap.forEach(node => {
            const parentId = node.parentLayerId;
            if (parentId && parentId !== '00000000-0000-0000-0000-000000000000') {
                const parent = layerMap.get(parentId);
                if (parent) {
                    parent.children.push(node);
                } else {
                    rootLayers.push(node); // Fallback if parent not found
                }
            } else {
                rootLayers.push(node);
            }
        });

        return rootLayers;
    };

    const updateLayerStateRecursive = (layerId: string, newState: Partial<{ isVisible: boolean; locked: boolean }>, allLayers: any[]) => {
        const affectedIndices = new Set<number>();
        
        // 1. Update Tree and collect indices
        const updateNode = (nodes: any[], shouldUpdate: boolean): any[] => {
            return nodes.map(node => {
                const isTarget = node.id === layerId;
                const willUpdate = shouldUpdate || isTarget;
                
                if (willUpdate) {
                    if (typeof node.index === 'number' && !Number.isNaN(node.index)) {
                        affectedIndices.add(node.index);
                        const key = `layer_${node.index}`;
                        const prev = layerStateRef.current[key] || { isVisible: true, locked: false };
                        layerStateRef.current[key] = { ...prev, ...newState };
                    }
                    
                    const updatedNode = { ...node, ...newState };
                    if (node.children && node.children.length > 0) {
                        updatedNode.children = updateNode(node.children, true);
                    }
                    return updatedNode;
                }
                
                // Not target, not descendant of target (yet)
                if (node.children && node.children.length > 0) {
                    return { ...node, children: updateNode(node.children, false) };
                }
                
                return node;
            });
        };
        
        const newLayers = updateNode(allLayers, false);
        
        // 2. Update Scene (Single Traversal)
        if (sceneRef.current && affectedIndices.size > 0) {
            sceneRef.current.traverse(child => {
                if (child.userData?.attributes?.layerIndex !== undefined) {
                    if (affectedIndices.has(child.userData.attributes.layerIndex)) {
                        if ('isVisible' in newState) child.visible = newState.isVisible!;
                        if ('locked' in newState) child.userData.isLocked = newState.locked!;
                    }
                }
            });
        }
        
        return newLayers;
    };

    // Suppress 3DMLoader warnings globally while this hook is active
    useEffect(() => {
        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('ObjectType_Annotation')) {
                return;
            }
            originalWarn.apply(console, args);
        };
        return () => {
            console.warn = originalWarn;
        };
    }, []);

    const getMaterialKey = (material: THREE.Material) => {
        const mat: any = material as any;
        const type = material.type;
        const colorHex = mat?.color?.getHex ? mat.color.getHex() : undefined;
        const opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
        const transparent = !!mat.transparent;
        const side = typeof mat.side === 'number' ? mat.side : THREE.FrontSide;
        return `${type}|${colorHex ?? 'n'}|${opacity}|${transparent ? 1 : 0}|${side}`;
    };

    const getGeometryKey = (geometry: THREE.BufferGeometry) => {
        const attrNames = Object.keys(geometry.attributes).sort().join(',');
        const indexed = geometry.index ? 1 : 0;
        return `${indexed}|${attrNames}`;
    };

    const ensureEdgeLine = (mesh: THREE.Mesh, isEdgeVisible: boolean) => {
        const existing = mesh.children.find(c => c.name === 'SurfaceEdge');
        if (existing) {
            existing.visible = isEdgeVisible;
            return;
        }
        const edges = new THREE.EdgesGeometry(mesh.geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
        line.name = 'SurfaceEdge';
        line.visible = isEdgeVisible;
        mesh.add(line);
    };

    const mergeStaticMeshes = (root: THREE.Object3D, isEdgeVisible: boolean) => {
        root.updateMatrixWorld(true);
        const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

        const groups = new Map<string, { layerIndex: number; material: THREE.Material; geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();

        root.traverse((child: THREE.Object3D) => {
            if (!(child instanceof THREE.Mesh)) return;
            if (!child.userData?.isModelMesh) return;
            if (!child.geometry || !(child.geometry instanceof THREE.BufferGeometry)) return;
            if (Array.isArray(child.material)) return;

            const attrs = child.userData?.attributes;
            const layerIndex = typeof attrs?.layerIndex === 'number' ? attrs.layerIndex : undefined;
            if (layerIndex === undefined) return;

            const geomKey = getGeometryKey(child.geometry);
            const matKey = getMaterialKey(child.material as THREE.Material);
            const key = `${layerIndex}|${matKey}|${geomKey}`;

            const relative = new THREE.Matrix4().multiplyMatrices(rootInverse, child.matrixWorld);
            let geom = child.geometry.clone();
            if (geom.index) geom = geom.toNonIndexed();
            geom.applyMatrix4(relative);
            if (!geom.getAttribute('normal')) {
                geom.computeVertexNormals();
            }

            const existing = groups.get(key);
            if (existing) {
                existing.geometries.push(geom);
                existing.meshes.push(child);
            } else {
                groups.set(key, { layerIndex, material: child.material as THREE.Material, geometries: [geom], meshes: [child] });
            }
        });

        const mergedMeshes: THREE.Mesh[] = [];
        const toRemove = new Set<THREE.Mesh>();

        for (const entry of groups.values()) {
            if (entry.geometries.length < 2) continue;
            const merged = mergeGeometries(entry.geometries, false);
            if (!merged) continue;

            merged.computeBoundingSphere();
            merged.computeBoundingBox();

            const material = entry.material.clone();
            const mesh = new THREE.Mesh(merged, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.isModelMesh = true;
            mesh.userData.attributes = { ...(entry.meshes[0].userData?.attributes || {}), layerIndex: entry.layerIndex };
            mesh.userData.isLocked = entry.meshes[0].userData?.isLocked ?? false;
            mesh.visible = entry.meshes[0].visible;
            ensureEdgeLine(mesh, isEdgeVisible);

            mergedMeshes.push(mesh);
            entry.meshes.forEach(m => toRemove.add(m));
        }

        if (mergedMeshes.length === 0) return;

        root.add(...mergedMeshes);

        toRemove.forEach(mesh => {
            mesh.parent?.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            const mat = mesh.material;
            if (Array.isArray(mat)) mat.forEach(m => m.dispose());
            else if (mat) mat.dispose();
            mesh.traverse(child => {
                if (child instanceof THREE.LineSegments) {
                    if (child.geometry) child.geometry.dispose();
                    const m = child.material;
                    if (Array.isArray(m)) m.forEach(mm => mm.dispose());
                    else if (m) m.dispose();
                }
            });
        });
    };

    const load3dmFile = async (url: string) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const loadId = ++loadIdRef.current;
        pendingLoadsRef.current += 1;
        loadProgressRef.current.set(loadId, 0);
        setIsLoading(true);
        setLoadingProgress(recomputeOverallProgress());

        if (!rhinoLoaderCtorRef.current) {
            const mod = await import('three/examples/jsm/loaders/3DMLoader.js');
            rhinoLoaderCtorRef.current = mod.Rhino3dmLoader;
        }
        const loader = new rhinoLoaderCtorRef.current();
        //loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/');

        loader.load(url, (object: THREE.Object3D) => {
            loadProgressRef.current.set(loadId, 100);
            pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1);
            const overall = recomputeOverallProgress();
            if (pendingLoadsRef.current === 0) {
                loadProgressRef.current.clear();
                setIsLoading(false);
                setLoadingProgress(100);
            } else {
                setIsLoading(true);
                setLoadingProgress(overall);
            }

            if (!unitSetRef.current) {
                // Try to get settings from userData (standard 3DMLoader) or doc (custom)
                const settings = object.userData.settings;
                const doc = object.userData.doc;

                if (settings || doc) {
                    try {
                        let unitValue = 0;

                        // 1. Try to get unit from settings object (which might be a plain object or rhino object)
                        if (settings) {
                            if (typeof settings.modelUnitSystem === 'function') {
                                unitValue = settings.modelUnitSystem();
                            } else if (settings.modelUnitSystem !== undefined) {
                                const val = settings.modelUnitSystem;
                                unitValue = (val && typeof val === 'object' && 'value' in val) ? val.value : val;
                            }
                        }
                        
                        // 2. Fallback to doc if unit not found yet and doc exists
                        if (unitValue === 0 && doc) {
                             if (typeof doc.modelUnitSystem === 'function') {
                                unitValue = doc.modelUnitSystem();
                             }
                             // Note: doc.settings() might have failed earlier if we are here, but we can try
                        }

                        const unitName = UNIT_NAMES[unitValue] || 'Unknown';

                        setModelUnit(unitName);
                        unitSetRef.current = true;
                    } catch (e) {
                        console.warn('Failed to extract model unit', e);
                    }
                } else {
                    console.warn('No settings or doc found in userData');
                }
            }
            
            object.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) {
                   child.castShadow = true;
                   child.receiveShadow = true;
                   child.userData.isModelMesh = true;

                   const attrs = child.userData?.attributes;
                   if (attrs && child.geometry) {
                       const geom: any = child.geometry;
                       if (!geom.userData) geom.userData = {};
                       const layerIndex = attrs.layerIndex;
                       if (layerIndex !== undefined) {
                           const prev = geom.userData.layerIndex;
                           if (prev === undefined) {
                               geom.userData.layerIndex = layerIndex;
                           } else if (Array.isArray(prev)) {
                               if (!prev.includes(layerIndex)) prev.push(layerIndex);
                           } else if (prev !== layerIndex) {
                               geom.userData.layerIndex = [prev, layerIndex];
                           }
                       }
                       if (geom.userData.attributes === undefined) {
                           geom.userData.attributes = { ...attrs };
                       } else if (geom.userData.attributes && typeof geom.userData.attributes === 'object') {
                           geom.userData.attributes = { ...geom.userData.attributes, ...attrs };
                       }
                       if (geom.userData.meshUuid === undefined) {
                           geom.userData.meshUuid = child.uuid;
                       }
                   }
                   
                   if (!child.material) {
                     child.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
                   }

                   const materials = Array.isArray(child.material) ? child.material : [child.material];
                   const clonedMaterials = materials.map(m => m.clone());
                   child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
                   
                   let drawColor = null;
                   
                   if (child.userData?.attributes?.drawColor) {
                       drawColor = child.userData.attributes.drawColor;
                   } 
                   else if (child.userData?.drawColor) {
                       drawColor = child.userData.drawColor;
                   }
                   else if (child.parent && child.parent.type !== 'Scene' && child.parent.userData?.attributes?.drawColor) {
                       drawColor = child.parent.userData.attributes.drawColor;
                   }

                   clonedMaterials.forEach(mat => {
                       if (mat.color) {
                           if (drawColor) {
                               if (typeof drawColor === 'object' && 'r' in drawColor) {
                                   if (drawColor.r === 0 && drawColor.g === 0 && drawColor.b === 0) {
                                       mat.color.setHex(0xffffff);
                                   } else {
                                       mat.color.setRGB(drawColor.r / 255.0, drawColor.g / 255.0, drawColor.b / 255.0);
                                   }
                               } else if (typeof drawColor === 'number') {
                                   if (drawColor === 0) {
                                       mat.color.setHex(0xffffff);
                                   } else {
                                       mat.color.setHex(drawColor);
                                   }
                               }
                           } else {
                               if (mat.color.getHex() === 0x000000) {
                                  mat.color.setHex(0xffffff);
                               }
                           }
                       }
                   });
                }
            });

            const isEdgeVisible = displayMode !== 'shade';
            if (mergeGeometry) {
                mergeStaticMeshes(object, isEdgeVisible);
            }

            object.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh && child.userData?.isModelMesh) {
                    ensureEdgeLine(child, isEdgeVisible);
                }
            });
            
            sceneRef.current?.add(object);
            
            // Fix: Remove layerIndex from root object to prevent "Hide All" bug
            if (object.userData && object.userData.attributes && object.userData.attributes.layerIndex !== undefined) {
                delete object.userData.attributes.layerIndex;
            }

            const builtinLayers = object.userData.layers;
            if (builtinLayers && Array.isArray(builtinLayers)) {
                // Clear existing state before building new one
                layerStateRef.current = {};
                const tree = buildLayerTree(builtinLayers);
                setLayers(tree);

                object.traverse((child: THREE.Object3D) => {
                    if (child.userData?.attributes?.layerIndex !== undefined) {
                        const layerIndex = child.userData.attributes.layerIndex;
                        const key = `layer_${layerIndex}`;
                        const state = layerStateRef.current[key];
                        if (state) {
                            child.visible = state.isVisible;
                            child.userData.isLocked = state.locked;
                        } else {
                            child.visible = true;
                            child.userData.isLocked = false;
                        }
                    }
                });
            } else {
                const foundLayers = new Set<number>();
                object.traverse((child: THREE.Object3D) => {
                    if (child.userData?.attributes?.layerIndex !== undefined) {
                        foundLayers.add(child.userData.attributes.layerIndex);
                    }
                });

                if (foundLayers.size > 0) {
                    const nextState: Record<string, { isVisible: boolean; locked: boolean }> = {};
                    const nextLayers: { index: number; name: string; isVisible: boolean; locked: boolean; parentLayerId: string; id: string; children?: any[] }[] = [];
                    foundLayers.forEach(index => {
                        const key = `layer_${index}`;
                        const name = `Layer ${index}`;
                        nextState[key] = { isVisible: true, locked: false };
                        nextLayers.push({ 
                            index, 
                            name, 
                            isVisible: true, 
                            locked: false,
                            id: `layer_id_${index}`,
                            parentLayerId: '00000000-0000-0000-0000-000000000000'
                        });
                    });
                    layerStateRef.current = nextState;
                    setLayers(nextLayers);
                }
            }

            if (dirLightRef.current?.castShadow) {
                updateGround();
                updateShadowFrustum();
            }
            
            const box = new THREE.Box3().setFromObject(object);
            if (cameraRef.current && controlsRef.current) {
                zoomToBox(box, cameraRef.current, controlsRef.current, orthoFrustumHeightRef);
            }

        }, (xhr: ProgressEvent<EventTarget>) => {
            if (xhr.lengthComputable) {
                const percentComplete = (xhr.loaded / xhr.total) * 100;
                loadProgressRef.current.set(loadId, percentComplete);
                setIsLoading(true);
                setLoadingProgress(recomputeOverallProgress());
            }
        }, (error: unknown) => {
            console.error(error);
            loadProgressRef.current.delete(loadId);
            pendingLoadsRef.current = Math.max(0, pendingLoadsRef.current - 1);
            const overall = recomputeOverallProgress();
            if (pendingLoadsRef.current === 0) {
                loadProgressRef.current.clear();
                setIsLoading(false);
                setLoadingProgress(0);
            } else {
                setIsLoading(true);
                setLoadingProgress(overall);
            }
        });
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const fileList = event.target.files;
        const files = fileList ? Array.from(fileList) : [];
        if (files.length === 0) return;
        event.target.value = '';

        const willAppend = loadMultiFile;
        const filesToLoad = willAppend ? files : files.slice(0, 1);

        if (!willAppend) {
            clearMeasurements();
            setModelUnit('');
            unitSetRef.current = false;
        }

        if (!willAppend && sceneRef.current) {
            const toRemove: THREE.Object3D[] = [];
            sceneRef.current.children.forEach(child => {
                if (child instanceof THREE.Light) return;
                if (child instanceof THREE.GridHelper) return;
                if (child instanceof THREE.AxesHelper) return;
                if (child.name === 'selection-box') return;
                if (child.name === 'Ground') return;
                if (child.name === 'Measurements') return;
                if (child.name === 'HighlightPoint') return;
                if (child.type === 'Camera') return;

                toRemove.push(child);
            });

            toRemove.forEach(child => sceneRef.current?.remove(child));
            selectedObjectsRef.current.clear();
            updateHighlights();
        }

        filesToLoad.forEach(file => {
            const url = URL.createObjectURL(file);
            void load3dmFile(url);
        });
    };


    const setLayerVisibility = (id: string, isVisible: boolean) => {
        setLayers(prev => updateLayerStateRecursive(id, { isVisible }, prev));
    };

    const setLayerLocked = (id: string, locked: boolean) => {
        setLayers(prev => updateLayerStateRecursive(id, { locked }, prev));
    };

    return {
        isLoading,
        loadingProgress,
        handleFileChange,
        load3dmFile,
        layers,
        setLayerVisibility,
        setLayerLocked,
        modelUnit
    };
}
