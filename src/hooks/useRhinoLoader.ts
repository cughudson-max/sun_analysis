import { useState, useRef } from 'react';
import * as THREE from 'three';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { zoomToBox } from '../utils/camera-utils';
import type { DisplayMode } from './useSettings';

export function useRhinoLoader(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    controlsRef: React.MutableRefObject<any>,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    dirLightRef: React.MutableRefObject<THREE.DirectionalLight | null>,
    updateGround: () => void,
    updateHighlights: () => void,
    clearMeasurements: () => void,
    displayMode: DisplayMode,
    updateSunPosition: () => void,
    selectedObjectsRef: React.MutableRefObject<Set<string>>
) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [layers, setLayers] = useState<{ index: number; name: string; visible: boolean }[]>([]);
    const layerStateRef = useRef<Record<string, boolean>>({});

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        clearMeasurements();
        
        if (sceneRef.current) {
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

        const loader = new Rhino3dmLoader();
        loader.setLibraryPath('/');
        
        const url = URL.createObjectURL(file);
        setIsLoading(true);
        setLoadingProgress(0);
        
        loader.load(url, (object) => {
            setIsLoading(false);
            setLoadingProgress(100);
            
            object.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                   child.castShadow = true;
                   child.receiveShadow = true;
                   child.userData.isModelMesh = true;

                   const edges = new THREE.EdgesGeometry(child.geometry);
                   const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                   line.name = 'SurfaceEdge';
                   line.visible = displayMode !== 'shade';
                   child.add(line);
                   
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
            
            sceneRef.current?.add(object);

            const builtinLayers = object.userData.layers;
            if (builtinLayers && Array.isArray(builtinLayers)) {
                const nextState: Record<string, boolean> = {};
                const nextLayers: { index: number; name: string; visible: boolean }[] = [];
                builtinLayers.forEach((layer: any) => {
                    const layerIndex = layer.index !== undefined ? layer.index : layer.layerIndex;
                    const isVisible = layer.visible !== false;
                    const name = layer.name || `Layer ${layerIndex}`;
                    const key = `layer_${layerIndex}`;
                    nextState[key] = isVisible;
                    nextLayers.push({ index: layerIndex, name, visible: isVisible });
                });
                layerStateRef.current = nextState;
                setLayers(nextLayers);

                object.traverse(child => {
                    if (child.userData?.attributes?.layerIndex !== undefined) {
                        const layerIndex = child.userData.attributes.layerIndex;
                        const key = `layer_${layerIndex}`;
                        const visible = layerStateRef.current[key] ?? true;
                        child.visible = visible;
                    }
                });
            } else {
                const foundLayers = new Set<number>();
                object.traverse(child => {
                    if (child.userData?.attributes?.layerIndex !== undefined) {
                        foundLayers.add(child.userData.attributes.layerIndex);
                    }
                });

                if (foundLayers.size > 0) {
                    const nextState: Record<string, boolean> = {};
                    const nextLayers: { index: number; name: string; visible: boolean }[] = [];
                    foundLayers.forEach(index => {
                        const key = `layer_${index}`;
                        const name = `Layer ${index}`;
                        nextState[key] = true;
                        nextLayers.push({ index, name, visible: true });
                    });
                    layerStateRef.current = nextState;
                    setLayers(nextLayers);
                }
            }

            if (dirLightRef.current?.castShadow) {
                updateGround();
            }
            
            const box = new THREE.Box3().setFromObject(object);
            if (cameraRef.current && controlsRef.current) {
                zoomToBox(box, cameraRef.current, controlsRef.current, orthoFrustumHeightRef, dirLightRef.current || undefined, updateSunPosition);
            }

        }, (xhr) => {
            if (xhr.lengthComputable) {
                const percentComplete = (xhr.loaded / xhr.total) * 100;
                setLoadingProgress(Math.round(percentComplete));
            }
        }, (error) => {
            console.error(error);
            setIsLoading(false);
        });
    };

    const setLayerVisibility = (index: number, visible: boolean) => {
        const key = `layer_${index}`;
        const current = { ...layerStateRef.current, [key]: visible };
        layerStateRef.current = current;

        if (sceneRef.current) {
            sceneRef.current.traverse(child => {
                if (child.userData?.attributes?.layerIndex === index) {
                    child.visible = visible;
                }
            });
        }

        setLayers(prev =>
            prev.map(layer =>
                layer.index === index ? { ...layer, visible } : layer
            )
        );
    };

    return {
        isLoading,
        loadingProgress,
        handleFileChange,
        layers,
        setLayerVisibility
    };
}
