import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { zoomToBox } from '../utils/camera-utils';
import type { DisplayMode } from './useSettings';

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
    displayMode: DisplayMode,
    updateSunPosition: () => void,
    selectedObjectsRef: React.MutableRefObject<Set<string>>
) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [modelUnit, setModelUnit] = useState<string>('');
    const unitSetRef = useRef(false);
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
        const affectedIndices = new Set<number>();
        
        // 1. Update Tree and collect indices
        const updateNode = (nodes: any[], shouldUpdate: boolean): any[] => {
            return nodes.map(node => {
                const isTarget = node.index === layerIndex;
                const willUpdate = shouldUpdate || isTarget;
                
                if (willUpdate) {
                    affectedIndices.add(node.index);
                    // Update refs
                    const key = `layer_${node.index}`;
                    const prev = layerStateRef.current[key] || { visible: true, locked: false };
                    layerStateRef.current[key] = { ...prev, ...newState };
                    
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
                        if ('visible' in newState) child.visible = newState.visible!;
                        if ('locked' in newState) child.userData.isLocked = newState.locked!;
                    }
                }
            });
        }
        
        return newLayers;
    };

    const updateLayerStateByIndices = (
        layerIndices: Set<number>,
        newState: Partial<{ visible: boolean; locked: boolean }>,
        allLayers: any[]
    ) => {
        if (layerIndices.size === 0) return allLayers;

        const affectedIndices = new Set<number>();

        const updateNode = (nodes: any[]): any[] => {
            return nodes.map(node => {
                const shouldUpdate = layerIndices.has(node.index);

                const nextChildren =
                    node.children && node.children.length > 0 ? updateNode(node.children) : node.children;

                if (!shouldUpdate && nextChildren === node.children) {
                    return node;
                }

                if (shouldUpdate) {
                    affectedIndices.add(node.index);
                    const key = `layer_${node.index}`;
                    const prev = layerStateRef.current[key] || { visible: true, locked: false };
                    layerStateRef.current[key] = { ...prev, ...newState };
                }

                const updatedNode = shouldUpdate ? { ...node, ...newState } : { ...node };

                if (nextChildren !== node.children) {
                    updatedNode.children = nextChildren;
                }

                return updatedNode;
            });
        };

        const newLayers = updateNode(allLayers);

        if (sceneRef.current && affectedIndices.size > 0) {
            sceneRef.current.traverse(child => {
                if (child.userData?.attributes?.layerIndex !== undefined) {
                    if (affectedIndices.has(child.userData.attributes.layerIndex)) {
                        if ('visible' in newState) child.visible = newState.visible!;
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

    const load3dmFile = (url: string) => {
        const scene = sceneRef.current;
        if (!scene) return;

        setIsLoading(true);
        setLoadingProgress(0);

        const loader = new Rhino3dmLoader();
        loader.setLibraryPath('https://cdn.jsdelivr.net/npm/rhino3dm@8.4.0/');

        loader.load(url, (object) => {
            setIsLoading(false);
            setLoadingProgress(100);

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
                    const nextLayers: { index: number; name: string; visible: boolean; locked: boolean; parentLayerId: string; id: string; children?: any[] }[] = [];
                    foundLayers.forEach(index => {
                        const key = `layer_${index}`;
                        const name = `Layer ${index}`;
                        nextState[key] = { visible: true, locked: false };
                        nextLayers.push({ 
                            index, 
                            name, 
                            visible: true, 
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

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        
        clearMeasurements();
        setModelUnit('');
        unitSetRef.current = false;
        
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

        const url = URL.createObjectURL(file);
        load3dmFile(url);
    };


    const setLayerVisibility = (index: number, visible: boolean) => {
        setLayers(prev => updateLayerStateRecursive(index, { visible }, prev));
    };

    const setLayerLocked = (index: number, locked: boolean) => {
        setLayers(prev => updateLayerStateRecursive(index, { locked }, prev));
    };

    const setLayerVisibilityByIndices = (indices: number[], visible: boolean) => {
        setLayers(prev => updateLayerStateByIndices(new Set(indices), { visible }, prev));
    };

    const setLayerLockedByIndices = (indices: number[], locked: boolean) => {
        setLayers(prev => updateLayerStateByIndices(new Set(indices), { locked }, prev));
    };

    return {
        isLoading,
        loadingProgress,
        handleFileChange,
        load3dmFile,
        layers,
        setLayerVisibility,
        setLayerLocked,
        setLayerVisibilityByIndices,
        setLayerLockedByIndices,
        modelUnit
    };
}
