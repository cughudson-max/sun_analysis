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
    const [layers, setLayers] = useState<{ index: number; name: string; visible: boolean; locked: boolean; parentLayerId: string; id: string; children?: any[] }[]>([]);
    const layerStateRef = useRef<Record<string, { visible: boolean; locked: boolean }>>({});

    // Recursive helper to build tree
    const buildLayerTree = (layers: any[]) => {
        const layerMap = new Map<string, any>();
        const rootLayers: any[] = [];

        // First pass: create nodes and map them
        layers.forEach(layer => {
            const layerIndex = layer.index !== undefined ? layer.index : layer.layerIndex;
            const isVisible = layer.visible !== false;
            const name = layer.name || `Layer ${layerIndex}`;
            const id = layer.id;
            const parentId = layer.parentLayerId;
            
            // Initialize state for flat lookup
            const key = `layer_${layerIndex}`;
            if (!layerStateRef.current[key]) {
                layerStateRef.current[key] = { visible: isVisible, locked: false };
            }

            layerMap.set(id, {
                index: layerIndex,
                name,
                visible: isVisible,
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

    const updateLayerStateRecursive = (layerIndex: number, newState: Partial<{ visible: boolean; locked: boolean }>, allLayers: any[]) => {
        // Recursive helper to find and update node
        const updateNode = (nodes: any[]): any[] => {
            return nodes.map(node => {
                if (node.index === layerIndex) {
                    // Update current node
                    const updatedNode = { ...node, ...newState };
                    
                    // Propagate to all children recursively
                    const propagateToChildren = (children: any[]): any[] => {
                        return children.map(child => ({
                            ...child,
                            ...newState,
                            children: child.children ? propagateToChildren(child.children) : []
                        }));
                    };

                    // Update children if they exist
                    if (node.children && node.children.length > 0) {
                        updatedNode.children = propagateToChildren(node.children);
                    }
                    
                    // Update refs for all affected nodes (self + children)
                    const updateRefs = (n: any) => {
                        const key = `layer_${n.index}`;
                        const prev = layerStateRef.current[key] || { visible: true, locked: false };
                        layerStateRef.current[key] = { ...prev, ...newState };
                        
                        // Update scene objects
                        if (sceneRef.current) {
                            sceneRef.current.traverse(child => {
                                if (child.userData?.attributes?.layerIndex === n.index) {
                                    if ('visible' in newState) child.visible = newState.visible!;
                                    if ('locked' in newState) child.userData.isLocked = newState.locked!;
                                }
                            });
                        }

                        if (n.children) n.children.forEach(updateRefs);
                    };
                    updateRefs(updatedNode);

                    return updatedNode;
                }
                
                if (node.children && node.children.length > 0) {
                    return { ...node, children: updateNode(node.children) };
                }
                
                return node;
            });
        };
        
        return updateNode(allLayers);
    };

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
                // Clear existing state before building new one
                layerStateRef.current = {};
                const tree = buildLayerTree(builtinLayers);
                setLayers(tree);

                object.traverse(child => {
                    if (child.userData?.attributes?.layerIndex !== undefined) {
                        const layerIndex = child.userData.attributes.layerIndex;
                        const key = `layer_${layerIndex}`;
                        const state = layerStateRef.current[key];
                        if (state) {
                            child.visible = state.visible;
                            child.userData.isLocked = state.locked;
                        } else {
                            child.visible = true;
                            child.userData.isLocked = false;
                        }
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
                    const nextState: Record<string, { visible: boolean; locked: boolean }> = {};
                    const nextLayers: { index: number; name: string; visible: boolean; locked: boolean }[] = [];
                    foundLayers.forEach(index => {
                        const key = `layer_${index}`;
                        const name = `Layer ${index}`;
                        nextState[key] = { visible: true, locked: false };
                        nextLayers.push({ index, name, visible: true, locked: false });
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
        setLayers(prev => updateLayerStateRecursive(index, { visible }, prev));
    };

    const setLayerLocked = (index: number, locked: boolean) => {
        setLayers(prev => updateLayerStateRecursive(index, { locked }, prev));
    };

    return {
        isLoading,
        loadingProgress,
        handleFileChange,
        layers,
        setLayerVisibility,
        setLayerLocked
    };
}
