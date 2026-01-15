import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox.js';
import { SelectionHelper } from 'three/examples/jsm/interactive/SelectionHelper.js';
import GUI from 'lil-gui';
import './index.css';

// Set Z-Up as requested
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  // Lights Refs
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  
  // Selection
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const selectionHelperRef = useRef<SelectionHelper | null>(null);
  const selectedObjectsRef = useRef<Set<string>>(new Set()); // Store UUIDs
  const lastMiddleClickTime = useRef<number>(0);
  
  // UI State
  const [, setBrightness] = useState(1.0);
  const [bgTop, setBgTop] = useState('#e0e0e0');
  const [bgBottom, setBgBottom] = useState('#ffffff');

  useEffect(() => {
    if (!containerRef.current) return;

    // 1. Setup Scene
    const scene = new THREE.Scene();
    // scene.background = null; // Use CSS for gradient
    sceneRef.current = scene;

    // 2. Setup Camera (Rhino style: Z-up, so place camera at some X,Y,Z)
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(50, -50, 50); // Look from a corner
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // 3. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true; // Enable Shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights (Adjustable brightness)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(100, -100, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0001;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false; // User asked "stop immediately", so damping false
    // Map buttons: Left=Rotate, Middle=Pan
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.DOLLY
    };
    controlsRef.current = controls;

    // 6. Helpers (Grid) - Optional but good for context
    const grid = new THREE.GridHelper(100, 20);
    grid.rotation.x = Math.PI / 2; // Rotate to lie on XY plane
    scene.add(grid);
    const axes = new THREE.AxesHelper(10);
    scene.add(axes);

    // 7. Selection Box Setup
    const selectionBox = new SelectionBox(camera, scene);
    selectionBoxRef.current = selectionBox;
    const helper = new SelectionHelper(renderer, 'selection-box');
    selectionHelperRef.current = helper;

    // 8. Event Listeners for Interaction
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Render Loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // 9. UI (lil-gui)
    const gui = new GUI({ title: 'Settings' });
    const settings = {
      brightness: 0.5, // Now mapped to Directional Light
      ambientIntensity: 1.0,
      ambientColor: '#ffffff',
      shadows: true,
      bgTop: '#e0e0e0',
      bgBottom: '#ffffff',
      loadFile: () => {
        document.getElementById('file-input')?.click();
      }
    };

    // Brightness -> Directional Light Intensity (0 - 10)
    gui.add(settings, 'brightness', 0, 10).name('Brightness (Sun)').onChange((v: number) => {
      if (dirLightRef.current) dirLightRef.current.intensity = v;
      // setBrightness(v); // No longer needed as state if only used for this
    });

    // Ambient Light Controls
    const folderAmbient = gui.addFolder('Ambient Light');
    folderAmbient.add(settings, 'ambientIntensity', 0, 2).name('Intensity').onChange((v: number) => {
        if (ambientLightRef.current) ambientLightRef.current.intensity = v;
    });
    folderAmbient.addColor(settings, 'ambientColor').name('Color').onChange((v: string) => {
        if (ambientLightRef.current) ambientLightRef.current.color.set(v);
    });

    // Shadow Switch
    gui.add(settings, 'shadows').name('Shadows').onChange((enabled: boolean) => {
        if (dirLightRef.current) dirLightRef.current.castShadow = enabled;
        // Also update renderer? Usually not needed if light stops casting.
        // But let's check if we need to toggle renderer.shadowMap.enabled
        // renderer.shadowMap.enabled = enabled; // This requires material update sometimes.
        // Toggling light.castShadow is safer and immediate.
    });

    gui.addColor(settings, 'bgTop').onChange((v: string) => setBgTop(v));
    gui.addColor(settings, 'bgBottom').onChange((v: string) => setBgBottom(v));
    gui.add(settings, 'loadFile').name('Open .3dm File');

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      gui.destroy();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Handle Input Events for Selection
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    const element = renderer.domElement;
    let isSelecting = false;

    const onPointerDown = (event: PointerEvent) => {
      // Middle Click Double Click Check
      if (event.button === 1) {
          const now = Date.now();
          if (now - lastMiddleClickTime.current < 300) {
              zoomToSelection();
          }
          lastMiddleClickTime.current = now;
      }

      // Check for Ctrl key
      if (event.ctrlKey) {
        isSelecting = true;
        // Disable orbit controls temporarily
        if (controlsRef.current) controlsRef.current.enabled = false;
        
        if (selectionBoxRef.current && selectionHelperRef.current) {
          selectionBoxRef.current.startPoint.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1,
            0.5
          );
        }
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isSelecting && selectionBoxRef.current && selectionHelperRef.current) {
        selectionBoxRef.current.endPoint.set(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
          0.5
        );
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (isSelecting && selectionBoxRef.current && selectionHelperRef.current) {
        selectionBoxRef.current.endPoint.set(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
          0.5
        );

        const allSelected = selectionBoxRef.current.select();
        handleSelection(allSelected, event.shiftKey);

        isSelecting = false;
        if (controlsRef.current) controlsRef.current.enabled = true;
      } else if (!event.ctrlKey && event.button === 0 && !controlsRef.current?.mouseButtons.LEFT /* Check if it was a click, not drag? */) {
         // This logic is tricky. OrbitControls handles clicks. 
         // We need a Raycaster for single click if it wasn't a drag.
         // But let's rely on SelectionBox for click too (it works for single points essentially).
         // Actually, Raycaster is better for single click.
      }
      
      // Re-enable controls just in case
      if (controlsRef.current) controlsRef.current.enabled = true;
    };

    // Separate Raycaster for simple click (without Ctrl)
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    const onClick = (event: MouseEvent) => {
      if (event.ctrlKey) return; // Handled by box selection
      // If moved significantly, it's a drag (Orbit), ignore.
      // We can check this by storing down position.
      
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, cameraRef.current!);
      // Intersect only our meshes
      if (!sceneRef.current) return;
      
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      // Filter out helpers
      const validIntersects = intersects.filter(hit => {
         return hit.object.type === 'Mesh' && hit.object.name !== 'HighlightLine';
      });

      if (validIntersects.length > 0) {
        handleSelection([validIntersects[0].object], event.shiftKey);
      } else {
        // Clicked on empty space -> Deselect all unless shift
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
  }, []);

  const handleSelection = (objects: THREE.Object3D[], shiftKey: boolean) => {
    const validObjects = objects.filter(o => o.type === 'Mesh' && o.name !== 'HighlightLine');
    const newSelection = shiftKey ? new Set(selectedObjectsRef.current) : new Set<string>();

    validObjects.forEach(obj => {
      if (shiftKey && selectedObjectsRef.current.has(obj.uuid)) {
        newSelection.delete(obj.uuid); // Toggle off
      } else {
        newSelection.add(obj.uuid); // Add
      }
    });

    selectedObjectsRef.current = newSelection;
    updateHighlights();
  };

  const zoomToBox = (box: THREE.Box3) => {
      if (box.isEmpty() || !cameraRef.current || !controlsRef.current) return;
      
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      
      const fov = cameraRef.current.fov * (Math.PI / 180);
      let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      cameraZ *= 2.0; // Zoom out a bit
      
      const direction = new THREE.Vector3().subVectors(cameraRef.current.position, controlsRef.current.target).normalize();
      if (direction.lengthSq() < 0.001) direction.set(1, -1, 1).normalize();
      
      const newPos = center.clone().add(direction.multiplyScalar(cameraZ));
      cameraRef.current.position.copy(newPos);
      cameraRef.current.lookAt(center);
      
      // Adjust clipping planes
      cameraRef.current.near = maxDim / 1000;
      cameraRef.current.far = maxDim * 100;
      cameraRef.current.updateProjectionMatrix();
      
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
  };

  const zoomToSelection = () => {
      if (selectedObjectsRef.current.size === 0) return;
      
      const box = new THREE.Box3();
      if (!sceneRef.current) return;

      selectedObjectsRef.current.forEach(uuid => {
           const obj = sceneRef.current?.getObjectByProperty('uuid', uuid);
           if (obj) {
               box.expandByObject(obj);
           }
      });
      
      zoomToBox(box);
  };

  const updateHighlights = () => {
     if (!sceneRef.current) return;
     
     // Remove old highlights
     const toRemove: THREE.Object3D[] = [];
     sceneRef.current.traverse(child => {
       if (child.name === 'HighlightLine') toRemove.push(child);
     });
     toRemove.forEach(child => child.parent?.remove(child));

     // Add new highlights
     selectedObjectsRef.current.forEach(uuid => {
        const obj = sceneRef.current?.getObjectByProperty('uuid', uuid);
        if (obj && obj instanceof THREE.Mesh) {
           // Create Highlight Edges
           // Optimization: Check if obj already has geometry.
           const edges = new THREE.EdgesGeometry(obj.geometry);
           const material = new THREE.LineBasicMaterial({ 
             color: 0xffff00, 
             depthTest: false,
             depthWrite: false,
             linewidth: 2 // Note: linewidth only works in WebGL2 on some browsers, mostly 1
           });
           const line = new THREE.LineSegments(edges, material);
           line.name = 'HighlightLine';
           line.renderOrder = 9999; // On top
           
           // Since we add line as a child of obj, it inherits obj's transform.
           // We just need to ensure line has no additional transform.
           line.position.set(0, 0, 0);
           line.rotation.set(0, 0, 0);
           line.scale.set(1, 1, 1);
           
           obj.add(line);
        }
     });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Clear previous model
    if (sceneRef.current) {
        // Remove objects that are NOT helpers or lights
        // We can tag the loaded model with a name or type to easily remove it.
        // Or simply remove all Meshes that are not helpers.
        const toRemove: THREE.Object3D[] = [];
        sceneRef.current.children.forEach(child => {
            // Keep lights, camera helpers, grid, axes
            if (child instanceof THREE.Light) return;
            if (child instanceof THREE.GridHelper) return;
            if (child instanceof THREE.AxesHelper) return;
            if (child.name === 'selection-box') return; // SelectionHelper
            if (child.type === 'Camera') return;
            
            // Assume everything else is part of the loaded model or its helpers
            toRemove.push(child);
        });
        
        toRemove.forEach(child => sceneRef.current?.remove(child));
        
        // Also clear selection
        selectedObjectsRef.current.clear();
        updateHighlights();
    }

    const loader = new Rhino3dmLoader();
    loader.setLibraryPath('/'); // Public folder
    
    const url = URL.createObjectURL(file);
    
    loader.load(url, (object) => {
      // Process object
      console.log('Model loaded:', object);

      // 1. Traverse and Add Edges (Sketchup Style)
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
           console.log('Processing mesh:', child.name || child.uuid);
           
           // Enable Shadows
           child.castShadow = true;
           child.receiveShadow = true;

           // Debug Logging for UserData
           if (child.userData) {
               try {
                   console.log('UserData keys:', Object.keys(child.userData));
                   if (child.userData.attributes) {
                       console.log('Attributes:', child.userData.attributes);
                       if (child.userData.attributes.drawColor) {
                           console.log('DrawColor found in attributes:', child.userData.attributes.drawColor);
                       }
                   }
               } catch (e) {
                   console.error('Error logging userData:', e);
               }
           }

           // Create Black Edges
           const edges = new THREE.EdgesGeometry(child.geometry);
           const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
           child.add(line);
           
           // Ensure material exists
           if (!child.material) {
             child.material = new THREE.MeshLambertMaterial({ color: 0xffffff });
           }

           // Handle Array Materials and Clone to avoid side-effects
           const materials = Array.isArray(child.material) ? child.material : [child.material];
           // Clone materials so we can modify them individually without affecting shared materials
           const clonedMaterials = materials.map(m => m.clone());
           child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
           
           // Attempt to find the correct display color
           let drawColor = null;
           
           // Strategy 1: Check child.userData.attributes.drawColor (Standard Rhino3dmLoader)
           if (child.userData?.attributes?.drawColor) {
               drawColor = child.userData.attributes.drawColor;
           } 
           // Strategy 2: Check child.userData.drawColor (Direct)
           else if (child.userData?.drawColor) {
               drawColor = child.userData.drawColor;
           }
           // Strategy 3: Check Parent's attributes (e.g. if child is part of an Instance/Block)
           else if (child.parent && child.parent.type !== 'Scene' && child.parent.userData?.attributes?.drawColor) {
               drawColor = child.parent.userData.attributes.drawColor;
               console.log('Found drawColor in parent:', drawColor);
           }

           clonedMaterials.forEach(mat => {
               // We only modify materials that support color
               if (mat.color) {
                   if (drawColor) {
                       // Apply drawColor
                       if (typeof drawColor === 'object' && 'r' in drawColor) {
                           // User Request: If drawColor is black, set to white for better visibility
                           if (drawColor.r === 0 && drawColor.g === 0 && drawColor.b === 0) {
                               console.log('DrawColor is black, forcing white as requested');
                               mat.color.setHex(0xffffff);
                           } else {
                               // Rhino colors are 0-255
                               mat.color.setRGB(drawColor.r / 255.0, drawColor.g / 255.0, drawColor.b / 255.0);
                           }
                           console.log('Applied drawColor (RGB):', mat.color);
                       } else if (typeof drawColor === 'number') {
                           // Integer color
                           if (drawColor === 0) {
                               console.log('DrawColor is black (0), forcing white as requested');
                               mat.color.setHex(0xffffff);
                           } else {
                               mat.color.setHex(drawColor);
                           }
                           console.log('Applied drawColor (Hex):', mat.color);
                       }
                   } else {
                       // No drawColor found.
                       // If material is pure black (0x000000), it might be uninitialized or default.
                       // We force it to white for better visibility in the viewer, 
                       // unless the user really wanted black (which is hard to distinguish from uninitialized).
                       // For now, if it's black, we make it white.
                       if (mat.color.getHex() === 0x000000) {
                          console.log('Material is black and no drawColor found, defaulting to white');
                          mat.color.setHex(0xffffff);
                       }
                   }
               }
           });
        }
      });
      
      // Fix 1: Zoom Extents & Adjust Clipping Planes
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
          zoomToBox(box);
          
          // Adjust Shadow Camera Frustum
          if (dirLightRef.current) {
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              
              const shadowCam = dirLightRef.current.shadow.camera;
              shadowCam.left = -maxDim;
              shadowCam.right = maxDim;
              shadowCam.top = maxDim;
              shadowCam.bottom = -maxDim;
              
              // Ensure near/far cover the model
              // Light is at 100, -100, 100. Distance to center 0,0,0 is ~173.
              // If model is far, we need to adjust position or range.
              // Let's position light relative to model center? 
              // Usually directional light position only affects direction, but for shadows it defines the "center" of shadow map projection.
              // Ideally move light to follow model center but keep direction.
              const direction = dirLightRef.current.position.clone().normalize();
              const dist = maxDim * 2; // Distance from center
              const newLightPos = center.clone().add(direction.multiplyScalar(dist));
              
              // Actually we can just keep light position if we adjust near/far and camera bounds, 
              // BUT shadow camera is orthographic centered at Light Position!
              // So we MUST move light to center of model (projected back along light dir) to cover it efficiently.
              
              dirLightRef.current.position.copy(newLightPos);
              dirLightRef.current.target.position.copy(center);
              dirLightRef.current.target.updateMatrixWorld();
              
              shadowCam.near = 0.1;
              shadowCam.far = dist * 4;
              shadowCam.updateProjectionMatrix();
              
              // Debug
              console.log('Shadow camera updated', shadowCam);
          }
      }

      // Clear previous model if needed? Or just add.
      // Let's add.
      sceneRef.current?.add(object);
      
      // Cleanup
      URL.revokeObjectURL(url);
    }, undefined, (error) => {
      console.error(error);
      alert('Error loading file');
    });
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100vh',
        background: `linear-gradient(to bottom, ${bgTop}, ${bgBottom})`
      }}
    >
      <input 
        type="file" 
        id="file-input" 
        accept=".3dm" 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
      />
    </div>
  );
}

export default App;
