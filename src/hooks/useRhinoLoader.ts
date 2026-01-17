import { useState, useRef } from 'react';
import * as THREE from 'three';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import GUI from 'lil-gui';
import { zoomToBox } from '../utils/camera-utils';

export function useRhinoLoader(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    controlsRef: React.MutableRefObject<any>,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    dirLightRef: React.MutableRefObject<THREE.DirectionalLight | null>,
    guiRef: React.MutableRefObject<GUI | null>,
    updateGround: () => void,
    updateHighlights: () => void,
    clearMeasurements: () => void,
    showEdges: boolean,
    updateSunPosition: () => void,
    selectedObjectsRef: React.MutableRefObject<Set<string>>
) {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const layersFolderRef = useRef<GUI | null>(null);

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

                   const edges = new THREE.EdgesGeometry(child.geometry);
                   const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
                   line.name = 'SurfaceEdge';
                   line.visible = showEdges;
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

            if (guiRef.current) {
                if (layersFolderRef.current) {
                    layersFolderRef.current.destroy();
                    layersFolderRef.current = null;
                }
                
                const layersFolder = guiRef.current.addFolder('Layers');
                layersFolderRef.current = layersFolder;
                
                const layers = object.userData.layers;
                
                if (layers && Array.isArray(layers)) {
                     interface LayerNode {
                         id: string;
                         layerIndex: number;
                         name: string;
                         visible: boolean;
                         children: LayerNode[];
                         parentLayerId: string;
                     }
       
                     const layerMap = new Map<string, LayerNode>();
                     const rootLayers: LayerNode[] = [];
                     const layerState: Record<string, boolean> = {};
       
                     layers.forEach((layer: any) => {
                         const layerIndex = layer.index !== undefined ? layer.index : layer.layerIndex;
                         const layerId = layer.id;
                         const parentLayerId = layer.parentLayerId;
                         const isVisible = layer.visible !== false;
                         
                         const node: LayerNode = {
                             id: layerId,
                             layerIndex: layerIndex,
                             name: layer.name || `Layer ${layerIndex}`,
                             visible: isVisible,
                             children: [],
                             parentLayerId: parentLayerId
                         };
                         
                         layerMap.set(layerId, node);
                         layerState[`layer_${layerIndex}`] = isVisible;
                     });
       
                     layerMap.forEach((node) => {
                         const parentLayerId = node.parentLayerId;
                         const isRoot = !parentLayerId || parentLayerId === '00000000-0000-0000-0000-000000000000';
                         
                         if (isRoot) {
                             rootLayers.push(node);
                         } else {
                             const parent = layerMap.get(parentLayerId);
                             if (parent) {
                                 parent.children.push(node);
                             } else {
                                 rootLayers.push(node);
                             }
                         }
                     });
       
                     const setLayerHierarchyVisibility = (node: LayerNode, visible: boolean) => {
                         const key = `layer_${node.layerIndex}`;
                         layerState[key] = visible;
                         
                         if (node.children) {
                             node.children.forEach(child => {
                                 setLayerHierarchyVisibility(child, visible);
                             });
                         }
                     };
      
                     const updateSceneVisibility = () => {
                         object.traverse((child) => {
                             if (child.userData?.attributes?.layerIndex !== undefined) {
                                 const layerIndex = child.userData.attributes.layerIndex;
                                 const key = `layer_${layerIndex}`;
                                 
                                let isVisible = layerState[key] !== undefined ? layerState[key] : true;
                                
                                 let currentNode: LayerNode | undefined;
                                 for (const node of layerMap.values()) {
                                     if (node.layerIndex === layerIndex) {
                                         currentNode = node;
                                         break;
                                     }
                                 }
                                 
                                 if (currentNode) {
                                     let ptr: LayerNode | undefined = currentNode;
                                     while (ptr) {
                                         const ptrKey = `layer_${ptr.layerIndex}`;
                                         if (!layerState[ptrKey]) {
                                             isVisible = false;
                                             break;
                                         }
                                         
                                         if (ptr.parentLayerId && ptr.parentLayerId !== '00000000-0000-0000-0000-000000000000') {
                                             ptr = layerMap.get(ptr.parentLayerId);
                                         } else {
                                             ptr = undefined;
                                         }
                                     }
                                 }
                                 
                                 child.visible = isVisible;
                             }
                         });
                     };
      
                    const createLayerGUI = (nodes: LayerNode[], parentFolder: GUI) => {
                        nodes.forEach(node => {
                            const key = `layer_${node.layerIndex}`;
                            
                            if (node.children.length > 0) {
                                const folder = parentFolder.addFolder(`📁 ${node.name}`);
                                
                                folder.add(layerState, key)
                                    .name(`👁️ ${node.name}`)
                                    .listen()
                                    .onChange((v: boolean) => {
                                        setLayerHierarchyVisibility(node, v);
                                        updateSceneVisibility();
                                    });
                                
                                createLayerGUI(node.children, folder);
                            } else {
                                parentFolder.add(layerState, key)
                                    .name(`🔹 ${node.name}`)
                                    .listen()
                                    .onChange(() => {
                                        updateSceneVisibility();
                                    });
                            }
                        });
                    };
      
                    updateSceneVisibility();
                    createLayerGUI(rootLayers, layersFolder);
                    
                } else {
                   const foundLayers = new Set<number>();
                   object.traverse(child => {
                       if (child.userData?.attributes?.layerIndex !== undefined) {
                           foundLayers.add(child.userData.attributes.layerIndex);
                       }
                   });
                   
                   if (foundLayers.size > 0) {
                       const layerState: Record<string, boolean> = {};
                       foundLayers.forEach(index => {
                           const name = `Layer ${index}`;
                           const key = `layer_${index}`;
                           layerState[key] = true;
                           
                           layersFolder.add(layerState, key).name(name).onChange((visible: boolean) => {
                               object.traverse(child => {
                                   if (child.userData?.attributes?.layerIndex === index) {
                                       child.visible = visible;
                                   }
                               });
                           });
                       });
                   }
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

    return {
        isLoading,
        loadingProgress,
        handleFileChange,
        layersFolderRef
    };
}
