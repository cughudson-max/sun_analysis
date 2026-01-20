import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isInMeasurements } from '../utils/three-helpers';
import { zoomToBox } from '../utils/camera-utils';

export function useSelection(
    sceneRef: React.MutableRefObject<THREE.Scene | null>,
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
    controlsRef: React.MutableRefObject<OrbitControls | null>,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    selectionBoxRef: React.MutableRefObject<SelectionBox | null>,
    measureModeRef: React.MutableRefObject<boolean>,
    clippingPlanes: THREE.Plane[] = []
) {
    const selectionBoxDivRef = useRef<HTMLDivElement>(null);
    const startMouseRef = useRef<{x: number, y: number, time: number}>({ x: 0, y: 0, time: 0 });
    const selectedObjectsRef = useRef<Set<string>>(new Set());
    const lastMiddleClickTime = useRef<number>(0);

    const zoomToSelection = () => {
      if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;
      
      const box = new THREE.Box3();
      
      if (selectedObjectsRef.current.size > 0) {
          selectedObjectsRef.current.forEach(uuid => {
               const obj = sceneRef.current?.getObjectByProperty('uuid', uuid);
               if (obj) {
                   box.expandByObject(obj);
               }
          });
      } else {
          // Zoom to all visible geometry
          sceneRef.current.traverse(obj => {
              if (!obj.visible) return;
              
              if (obj instanceof THREE.Mesh && 
                  !isInMeasurements(obj) && 
                  obj.name !== 'HighlightLine' && 
                  obj.name !== 'HighlightPoint' && 
                  obj.name !== 'Ground') {
                  box.expandByObject(obj);
              }
          });
      }
      
      if (!box.isEmpty()) {
          zoomToBox(box, cameraRef.current, controlsRef.current, orthoFrustumHeightRef);
      }
    };

    const updateHighlights = () => {
         if (!sceneRef.current) return;
         
         const toRemove: THREE.Object3D[] = [];
         sceneRef.current.traverse(child => {
           if (child.name === 'HighlightLine') toRemove.push(child);
         });
         toRemove.forEach(child => child.parent?.remove(child));
    
         selectedObjectsRef.current.forEach(uuid => {
            const obj = sceneRef.current?.getObjectByProperty('uuid', uuid);
            if (obj && obj instanceof THREE.Mesh) {
               const edges = new THREE.EdgesGeometry(obj.geometry);
               const material = new THREE.LineBasicMaterial({ 
                 color: 0xffff00, 
                 depthTest: false,
                 depthWrite: false,
                 linewidth: 2 
               });
               const line = new THREE.LineSegments(edges, material);
               line.name = 'HighlightLine';
               line.renderOrder = 9999;
               
               line.position.set(0, 0, 0);
               line.rotation.set(0, 0, 0);
               line.scale.set(1, 1, 1);
               
               obj.add(line);
            }
         });
    };

    const handleSelection = (objects: THREE.Object3D[], shiftKey: boolean) => {
        const validObjects = objects.filter(o => 
            o instanceof THREE.Mesh && 
            !isInMeasurements(o) && 
            o.name !== 'HighlightLine' && 
            o.name !== 'HighlightPoint' && 
            o.name !== 'Ground' &&
            !o.userData.isLocked
        );
        const newSelection = shiftKey ? new Set(selectedObjectsRef.current) : new Set<string>();
    
        validObjects.forEach(obj => {
          if (shiftKey && selectedObjectsRef.current.has(obj.uuid)) {
            newSelection.delete(obj.uuid); 
          } else {
            newSelection.add(obj.uuid);
          }
        });
    
        selectedObjectsRef.current = newSelection;
        updateHighlights();
    };

    useEffect(() => {
        const renderer = rendererRef.current;
        if (!renderer) return;
    
        // Initialize SelectionBox if needed
        if (!selectionBoxRef.current && cameraRef.current && sceneRef.current) {
             selectionBoxRef.current = new SelectionBox(cameraRef.current, sceneRef.current);
        }

        const element = renderer.domElement;
        let isSelecting = false;
    
        const onPointerDown = (event: PointerEvent) => {
          if (event.button === 1) {
              const now = Date.now();
              if (now - lastMiddleClickTime.current < 300) {
                  zoomToSelection();
              }
              lastMiddleClickTime.current = now;
          }
    
          if (event.ctrlKey) {
            isSelecting = true;
            if (controlsRef.current) controlsRef.current.enabled = false;

            // Ensure SelectionBox uses the current camera and scene
            if (selectionBoxRef.current) {
                if (cameraRef.current) selectionBoxRef.current.camera = cameraRef.current;
                if (sceneRef.current) selectionBoxRef.current.scene = sceneRef.current;
            }
            
            const rect = element.getBoundingClientRect();
            const relX = event.clientX - rect.left;
            const relY = event.clientY - rect.top;

            if (selectionBoxDivRef.current) {
                selectionBoxDivRef.current.style.display = 'block';
                selectionBoxDivRef.current.style.left = `${relX}px`;
                selectionBoxDivRef.current.style.top = `${relY}px`;
                selectionBoxDivRef.current.style.width = '0px';
                selectionBoxDivRef.current.style.height = '0px';
            }
            startMouseRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
            
            if (selectionBoxRef.current) {
              selectionBoxRef.current.startPoint.set(
                (relX / rect.width) * 2 - 1,
                -(relY / rect.height) * 2 + 1,
                0.5
              );
            }
          } else {
             startMouseRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
          }
        };
    
        const onPointerMove = (event: PointerEvent) => {
          if (isSelecting && selectionBoxRef.current) {
            const rect = element.getBoundingClientRect();
            const relX = event.clientX - rect.left;
            const relY = event.clientY - rect.top;
            
            const startRelX = startMouseRef.current.x - rect.left;
            const startRelY = startMouseRef.current.y - rect.top;

            if (selectionBoxDivRef.current) {
                const newLeft = Math.min(startRelX, relX);
                const newTop = Math.min(startRelY, relY);
                const newWidth = Math.abs(relX - startRelX);
                const newHeight = Math.abs(relY - startRelY);
                
                selectionBoxDivRef.current.style.left = `${newLeft}px`;
                selectionBoxDivRef.current.style.top = `${newTop}px`;
                selectionBoxDivRef.current.style.width = `${newWidth}px`;
                selectionBoxDivRef.current.style.height = `${newHeight}px`;
            }
    
            selectionBoxRef.current.endPoint.set(
              (relX / rect.width) * 2 - 1,
              -(relY / rect.height) * 2 + 1,
              0.5
            );
          }
        };
    
        const onPointerUp = (event: PointerEvent) => {
          if (isSelecting && selectionBoxRef.current) {
            if (selectionBoxDivRef.current) {
                selectionBoxDivRef.current.style.display = 'none';
                selectionBoxDivRef.current.style.width = '0px';
                selectionBoxDivRef.current.style.height = '0px';
            }
            
            const rect = element.getBoundingClientRect();
            const relX = event.clientX - rect.left;
            const relY = event.clientY - rect.top;
    
            selectionBoxRef.current.endPoint.set(
              (relX / rect.width) * 2 - 1,
              -(relY / rect.height) * 2 + 1,
              0.5
            );
    
            const allSelected = selectionBoxRef.current.select();
            console.log(`SelectionBox found ${allSelected.length} objects`);
            handleSelection(allSelected, event.shiftKey);
    
            isSelecting = false;
            if (controlsRef.current) controlsRef.current.enabled = true;
          }
          
          if (controlsRef.current) controlsRef.current.enabled = true;
        };
    
        const onClick = (event: MouseEvent) => {
          if (event.ctrlKey) return; 
          
          // Skip if in measure mode
          if (measureModeRef.current) return;

          const now = Date.now();
          if (now - startMouseRef.current.time > 300) {
              return;
          }
          
          const rect = element.getBoundingClientRect();
          const mouse = new THREE.Vector2();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          
          if (!cameraRef.current) return;
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(mouse, cameraRef.current);
          if (!sceneRef.current) return;
          
          const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
          const validIntersects = intersects.filter(hit => {
             // Check clipping planes
             if (clippingPlanes.length > 0) {
                 for (const plane of clippingPlanes) {
                     if (plane.distanceToPoint(hit.point) < 0) {
                         return false;
                     }
                 }
             }

             return hit.object instanceof THREE.Mesh &&
                    !isInMeasurements(hit.object) &&
                    hit.object.name !== 'HighlightLine' &&
                    hit.object.name !== 'HighlightPoint' &&
                    hit.object.name !== 'Ground' &&
                    !hit.object.userData.isLocked;
          });
    
          if (validIntersects.length > 0) {
            handleSelection([validIntersects[0].object], event.shiftKey);
          } else {
            if (!event.shiftKey) {
               handleSelection([], false);
            }
          }
        };
    
        element.addEventListener('pointerdown', onPointerDown);
        element.addEventListener('pointermove', onPointerMove);
        element.addEventListener('pointerup', onPointerUp);
        element.addEventListener('click', onClick);
    
        return () => {
          element.removeEventListener('pointerdown', onPointerDown);
          element.removeEventListener('pointermove', onPointerMove);
          element.removeEventListener('pointerup', onPointerUp);
          element.removeEventListener('click', onClick);
        };
    }, [rendererRef.current, clippingPlanes]);

    return {
        selectionBoxDivRef,
        selectedObjectsRef,
        zoomToSelection,
        updateHighlights,
        handleSelection
    };
}
