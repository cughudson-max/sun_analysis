import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox.js';
import GUI from 'lil-gui';
import SunCalc from 'suncalc';
import ViewCube from './components/ViewCube';
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
  const groundRef = useRef<THREE.Mesh | null>(null);
  
  // Selection
  const selectionBoxRef = useRef<SelectionBox | null>(null);
  const selectionBoxDivRef = useRef<HTMLDivElement>(null);
  const startMouseRef = useRef<{x: number, y: number, time: number}>({ x: 0, y: 0, time: 0 });
  const selectedObjectsRef = useRef<Set<string>>(new Set()); // Store UUIDs
  const lastMiddleClickTime = useRef<number>(0);
  
  // GUI Refs
  const guiRef = useRef<GUI | null>(null);
  const layersFolderRef = useRef<GUI | null>(null);
  const showEdgesRef = useRef(true);
  
  // UI State
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [bgTop, setBgTop] = useState('#e0e0e0');
  const [bgBottom, setBgBottom] = useState('#ffffff');
  
  // Location & Time State (Defaults)
  const [latitude, setLatitude] = useState(39.9); // Beijing
  const [longitude, setLongitude] = useState(116.4); // Beijing
  const [date, setDate] = useState(new Date());

  // Settings Storage Helper
  const SETTINGS_KEY = '3dm-viewer-settings';

  const saveSettings = (newSettings: any) => {
      try {
          const current = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
          const updated = { ...current, ...newSettings };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      } catch (e) {
          console.error('Failed to save settings', e);
      }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Load Settings
    let savedSettings: any = {};
    try {
        savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (e) {
        console.error('Failed to load settings', e);
    }

    // Apply Saved State Initializers
    if (savedSettings.bgTop) setBgTop(savedSettings.bgTop);
    if (savedSettings.bgBottom) setBgBottom(savedSettings.bgBottom);
    if (savedSettings.latitude !== undefined) setLatitude(savedSettings.latitude);
    if (savedSettings.longitude !== undefined) setLongitude(savedSettings.longitude);
    if (savedSettings.showEdges !== undefined) showEdgesRef.current = savedSettings.showEdges;

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
    const savedBrightness = savedSettings.brightness !== undefined ? savedSettings.brightness : 0.5;
    const ambientLight = new THREE.AmbientLight(
        savedSettings.ambientColor || 0xffffff, 
        savedSettings.ambientIntensity !== undefined ? savedSettings.ambientIntensity : 1.0
    );
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, savedBrightness);
    dirLight.position.set(100, -100, 100);
    dirLight.castShadow = savedSettings.shadows !== undefined ? savedSettings.shadows : true;
    
    // Improved Shadow Quality
    dirLight.shadow.mapSize.width = savedSettings.shadowQuality || 4096;
    dirLight.shadow.mapSize.height = savedSettings.shadowQuality || 4096;
    dirLight.shadow.bias = savedSettings.shadowBias !== undefined ? savedSettings.shadowBias : -0.00005; 
    dirLight.shadow.normalBias = 0.02; // Helps with self-shadowing
    dirLight.shadow.radius = savedSettings.shadowRadius !== undefined ? savedSettings.shadowRadius : 1;
    
    // Initial Shadow Camera (Will be updated on load)
    const d = 100;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 10000; // Increased far plane

    scene.add(dirLight);
    scene.add(dirLight.target); // Important for target to work
    dirLightRef.current = dirLight;
    
    // Infinite Ground Plane - REMOVED, now dynamic
    // groundRef is still used but initialized later

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
    // Helper removed, using custom div logic

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
    guiRef.current = gui;
    const settings = {
      brightness: savedBrightness, // Now mapped to Directional Light
      ambientIntensity: savedSettings.ambientIntensity !== undefined ? savedSettings.ambientIntensity : 1.0,
      ambientColor: savedSettings.ambientColor || '#ffffff',
      shadows: savedSettings.shadows !== undefined ? savedSettings.shadows : true,
      showEdges: showEdgesRef.current,
      bgTop: savedSettings.bgTop || '#e0e0e0',
      bgBottom: savedSettings.bgBottom || '#ffffff',
      loadFile: () => {
        document.getElementById('file-input')?.click();
      }
    };

    // Brightness -> Directional Light Intensity (0 - 20)
    gui.add(settings, 'brightness', 0, 20).name('Brightness (Sun)').onChange((v: number) => {
      if (dirLightRef.current) dirLightRef.current.intensity = v;
      saveSettings({ brightness: v });
      // setBrightness(v); // No longer needed as state if only used for this
    });

    // Ambient Light Controls
    const folderAmbient = gui.addFolder('Ambient Light');
    folderAmbient.add(settings, 'ambientIntensity', 0, 20).name('Intensity').onChange((v: number) => {
        if (ambientLightRef.current) ambientLightRef.current.intensity = v;
        saveSettings({ ambientIntensity: v });
    });
    folderAmbient.addColor(settings, 'ambientColor').name('Color').onChange((v: string) => {
        if (ambientLightRef.current) ambientLightRef.current.color.set(v);
        saveSettings({ ambientColor: v });
    });

    // Shadow Switch
    const shadowFolder = gui.addFolder('Shadows');
    shadowFolder.add(settings, 'shadows').name('Enable Shadows').onChange((enabled: boolean) => {
        if (dirLightRef.current) dirLightRef.current.castShadow = enabled;
        saveSettings({ shadows: enabled });
        
        if (enabled) {
            updateGround();
        } else {
            // Remove ground
            if (groundRef.current) {
                sceneRef.current?.remove(groundRef.current);
                groundRef.current = null;
            }
        }
    });

    const shadowParams = {
        shadowQuality: savedSettings.shadowQuality || 4096,
        bias: savedSettings.shadowBias !== undefined ? savedSettings.shadowBias : -0.0001,
        radius: savedSettings.shadowRadius !== undefined ? savedSettings.shadowRadius : 1
    };

    shadowFolder.add(shadowParams, 'shadowQuality', 1024, 8192, 1024).name('Shadow Map Size').onChange((v: number) => {
        if (dirLightRef.current) {
            dirLightRef.current.shadow.mapSize.width = v;
            dirLightRef.current.shadow.mapSize.height = v;
            // Force update by disposing the old map
            if (dirLightRef.current.shadow.map) {
                dirLightRef.current.shadow.map.dispose();
                dirLightRef.current.shadow.map = null; // Re-created automatically
            }
        }
        saveSettings({ shadowQuality: v });
    });
    
    shadowFolder.add(shadowParams, 'bias', -0.01, 0.01, 0.0001).name('Bias').onChange((v: number) => {
        if (dirLightRef.current) {
            dirLightRef.current.shadow.bias = v;
        }
        saveSettings({ shadowBias: v });
    });
    
    shadowFolder.add(shadowParams, 'radius', 0, 10, 0.1).name('Blur Radius').onChange((v: number) => {
        if (dirLightRef.current) {
            dirLightRef.current.shadow.radius = v;
        }
        saveSettings({ shadowRadius: v });
    });

    gui.add(settings, 'showEdges').name('Show Surface Curves').onChange((v: boolean) => {
        showEdgesRef.current = v;
        saveSettings({ showEdges: v });
        if (sceneRef.current) {
            sceneRef.current.traverse((child) => {
                if (child.name === 'SurfaceEdge') {
                    child.visible = v;
                }
            });
        }
    });

    gui.addColor(settings, 'bgTop').onChange((v: string) => {
        setBgTop(v);
        saveSettings({ bgTop: v });
    });
    gui.addColor(settings, 'bgBottom').onChange((v: string) => {
        setBgBottom(v);
        saveSettings({ bgBottom: v });
    });
    
    // Ground Settings - REMOVED

    // Location & Time Controls
    const folderLocation = gui.addFolder('Location & Time');
    
    const locSettings = {
        latitude: savedSettings.latitude !== undefined ? savedSettings.latitude : 39.9,
        longitude: savedSettings.longitude !== undefined ? savedSettings.longitude : 116.4,
        dateString: new Date().toISOString().substring(0, 16) // YYYY-MM-DDTHH:mm
    };
    
    folderLocation.add(locSettings, 'latitude', -90, 90).name('Latitude').onChange((v: number) => {
        setLatitude(v);
        saveSettings({ latitude: v });
    });
    folderLocation.add(locSettings, 'longitude', -180, 180).name('Longitude').onChange((v: number) => {
        setLongitude(v);
        saveSettings({ longitude: v });
    });
    
    // Date/Time Control (String input for now, maybe custom slider later)
     // Lil-gui doesn't have a date picker, so we use string or separate sliders.
     // Let's use hour slider for easy day cycle.
     
     const timeSettings = {
         hour: savedSettings.hour !== undefined ? savedSettings.hour : new Date().getHours() + new Date().getMinutes() / 60,
         month: savedSettings.month !== undefined ? savedSettings.month : new Date().getMonth() + 1,
         day: savedSettings.day !== undefined ? savedSettings.day : new Date().getDate()
     };

     const updateDate = () => {
         const now = new Date();
         now.setMonth(timeSettings.month - 1);
         now.setDate(timeSettings.day); // Set day before time to avoid month rollover issues
         now.setHours(Math.floor(timeSettings.hour));
         now.setMinutes((timeSettings.hour % 1) * 60);
         setDate(now);
         
         saveSettings({
             month: timeSettings.month,
             day: timeSettings.day,
             hour: timeSettings.hour
         });
     };
     
     folderLocation.add(timeSettings, 'month', 1, 12, 1).name('Month').onChange(updateDate);
     folderLocation.add(timeSettings, 'day', 1, 31, 1).name('Day').onChange(updateDate);
     folderLocation.add(timeSettings, 'hour', 0, 23.99).name('Hour').onChange(updateDate);
 
     gui.add(settings, 'loadFile').name('Open .3dm File');


    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      gui.destroy();
      guiRef.current = null;
      layersFolderRef.current = null;
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
        
        // Show selection box
        if (selectionBoxDivRef.current) {
            selectionBoxDivRef.current.style.display = 'block';
            selectionBoxDivRef.current.style.left = `${event.clientX}px`;
            selectionBoxDivRef.current.style.top = `${event.clientY}px`;
            selectionBoxDivRef.current.style.width = '0px';
            selectionBoxDivRef.current.style.height = '0px';
        }
        startMouseRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
        
        if (selectionBoxRef.current) {
          selectionBoxRef.current.startPoint.set(
            (event.clientX / window.innerWidth) * 2 - 1,
            -(event.clientY / window.innerHeight) * 2 + 1,
            0.5
          );
        }
      } else {
         // Record time for simple click check
         startMouseRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (isSelecting && selectionBoxRef.current) {
        // Update selection box visual
        if (selectionBoxDivRef.current) {
            const currentX = event.clientX;
            const currentY = event.clientY;
            const startX = startMouseRef.current.x;
            const startY = startMouseRef.current.y;
            
            // Calculate top-left and width/height
            const newLeft = Math.min(startX, currentX);
            const newTop = Math.min(startY, currentY);
            const newWidth = Math.abs(currentX - startX);
            const newHeight = Math.abs(currentY - startY);
            
            selectionBoxDivRef.current.style.left = `${newLeft}px`;
            selectionBoxDivRef.current.style.top = `${newTop}px`;
            selectionBoxDivRef.current.style.width = `${newWidth}px`;
            selectionBoxDivRef.current.style.height = `${newHeight}px`;
        }

        selectionBoxRef.current.endPoint.set(
          (event.clientX / window.innerWidth) * 2 - 1,
          -(event.clientY / window.innerHeight) * 2 + 1,
          0.5
        );
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (isSelecting && selectionBoxRef.current) {
        // Hide selection box
        if (selectionBoxDivRef.current) {
            selectionBoxDivRef.current.style.display = 'none';
            selectionBoxDivRef.current.style.width = '0px';
            selectionBoxDivRef.current.style.height = '0px';
        }

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
      
      // Check for long press (drag)
      const now = Date.now();
      if (now - startMouseRef.current.time > 300) {
          // Long press detected, ignore selection
          return;
      }

      // If moved significantly, it's a drag (Orbit), ignore.
      // We can check this by storing down position.
      
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      raycaster.setFromCamera(mouse, cameraRef.current!);
      // Intersect only our meshes
      if (!sceneRef.current) return;
      
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      // Filter out helpers and Ground
      const validIntersects = intersects.filter(hit => {
         return hit.object.type === 'Mesh' && 
                hit.object.name !== 'HighlightLine' &&
                hit.object.name !== 'Ground';
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
    const validObjects = objects.filter(o => o.type === 'Mesh' && o.name !== 'HighlightLine' && o.name !== 'Ground');
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
      
      // Update Shadow Camera to cover model
      if (dirLightRef.current) {
          const d = maxDim * 1.5; // Ensure it covers the model with some margin
          dirLightRef.current.shadow.camera.left = -d;
          dirLightRef.current.shadow.camera.right = d;
          dirLightRef.current.shadow.camera.top = d;
          dirLightRef.current.shadow.camera.bottom = -d;
          dirLightRef.current.shadow.camera.far = Math.max(5000, maxDim * 10);
          dirLightRef.current.shadow.camera.updateProjectionMatrix();
          
          // Move light target to center
          dirLightRef.current.target.position.copy(center);
          dirLightRef.current.target.updateMatrixWorld();
          
          // Re-update sun position to respect new target
          // The previous sun position was relative to (0,0,0). 
          // If we move target, we should move position too to keep direction?
          // Actually updateSunPosition sets absolute position.
          // Direction is (Position - Target).
          // If we want same direction, we should add Center to Position.
          // But updateSunPosition is based on Earth coordinates, usually assuming origin is "Observer".
          // If we treat "Observer" as the model center:
          updateSunPosition(latitude, longitude, date);
      }
      
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

  const updateGround = () => {
      if (!sceneRef.current) return;
      
      // 1. Calculate Bounding Box of all Meshes (excluding helpers/ground)
      const box = new THREE.Box3();
      let hasObjects = false;
      
      sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
              // Ignore helpers, existing ground, selection box
              if (child.name === 'Ground') return;
              if (child.name === 'selection-box') return;
              if (child.name === 'HighlightLine') return;
              if (child instanceof THREE.GridHelper) return;
              if (child instanceof THREE.AxesHelper) return;
              
              // Only consider loaded model parts
              box.expandByObject(child);
              hasObjects = true;
          }
      });
      
      if (!hasObjects) {
          // If no objects, maybe just a default small ground or none
          // Let's make a default one if empty so we have something
           const defaultSize = 1000;
           box.min.set(-defaultSize, -defaultSize, 0);
           box.max.set(defaultSize, defaultSize, 0);
      }
      
      // 2. Create/Resize Ground
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      
      // Make ground larger than the box to catch shadows
      // Say 10x the max dimension
      const maxDim = Math.max(size.x, size.y);
      const groundSize = Math.max(maxDim * 10, 10000); // Minimum 10000
      
      // Remove old ground if exists
      if (groundRef.current) {
          sceneRef.current.remove(groundRef.current);
          if (groundRef.current.geometry) groundRef.current.geometry.dispose();
          // Reuse material if possible, but creating new one is cheap enough
      }
      
      const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
      const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3, color: 0x000000 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.name = 'Ground';
      
      // Position at Z=0 (Standard Ground)
      // Or should it be at box.min.z? 
      // User said "ShadowOnly Ground based on size". Usually ground is at 0.
      // If model is floating, shadow falls on 0. 
      // If model is below 0, shadow might be weird. 
      // Let's stick to Z=0 as the "Floor".
      ground.position.set(0, 0, 0);
      ground.receiveShadow = true;
      
      sceneRef.current.add(ground);
      groundRef.current = ground;
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
            if (child.name === 'Ground') return; // Keep Ground
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
      setIsLoading(false);
      setLoadingProgress(100);
      
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
           line.name = 'SurfaceEdge';
           line.visible = showEdgesRef.current;
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
      
      sceneRef.current?.add(object);

      // --- Handle Layers ---
      if (guiRef.current) {
          // Destroy old layers folder if exists
          if (layersFolderRef.current) {
              layersFolderRef.current.destroy();
              layersFolderRef.current = null;
          }
          
          // Create new layers folder
          const layersFolder = guiRef.current.addFolder('Layers');
          layersFolderRef.current = layersFolder;
          
          // Get Layers from userData
          const layers = object.userData.layers;
          console.log('3DM Layers Info:', layers); // Log layers info
          
          if (layers && Array.isArray(layers)) {
              // 1. Build Layer Tree
               interface LayerNode {
                   id: string; // UUID or index
                   layerIndex: number;
                   name: string;
                   visible: boolean;
                   children: LayerNode[];
                   parentLayerId: string;
               }
 
               const layerMap = new Map<string, LayerNode>();
               const rootLayers: LayerNode[] = [];
               const layerState: Record<string, boolean> = {};
 
               // First pass: Create nodes and map
               layers.forEach((layer: any) => {
                   const layerIndex = layer.index !== undefined ? layer.index : layer.layerIndex;
                   const layerId = layer.id; // Usually UUID
                   const parentLayerId = layer.parentLayerId;
                   
                   // Default visibility: true unless explicitly false
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
                   
                   // Initialize state for GUI
                   const key = `layer_${layerIndex}`;
                   layerState[key] = isVisible;
               });
 
               // Second pass: Build hierarchy
               layerMap.forEach((node) => {
                   const parentLayerId = node.parentLayerId;
                   // Check if parent exists and is not a nil UUID (0000...)
                   const isRoot = !parentLayerId || parentLayerId === '00000000-0000-0000-0000-000000000000';
                   
                   if (isRoot) {
                       rootLayers.push(node);
                   } else {
                       const parent = layerMap.get(parentLayerId);
                       if (parent) {
                           parent.children.push(node);
                       } else {
                           // Parent not found, treat as root
                           rootLayers.push(node);
                       }
                   }
               });
 
               // Recursive function to set visibility for a hierarchy branch
               const setLayerHierarchyVisibility = (node: LayerNode, visible: boolean) => {
                   const key = `layer_${node.layerIndex}`;
                   layerState[key] = visible;
                   
                   if (node.children) {
                       node.children.forEach(child => {
                           setLayerHierarchyVisibility(child, visible);
                       });
                   }
               };

               // Recursive function to update visibility based on hierarchy
               const updateSceneVisibility = () => {
                   object.traverse((child) => {
                       if (child.userData?.attributes?.layerIndex !== undefined) {
                           const layerIndex = child.userData.attributes.layerIndex;
                           const key = `layer_${layerIndex}`;
                           
                           // Find the layer node to check hierarchy
                          let isVisible = layerState[key] !== undefined ? layerState[key] : true;
                          
                          // Check ancestors
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
                                   
                                   // Move up
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

              // Recursive function to create GUI folders
              const createLayerGUI = (nodes: LayerNode[], parentFolder: GUI) => {
                  nodes.forEach(node => {
                      const key = `layer_${node.layerIndex}`;
                      
                      if (node.children.length > 0) {
                          // Create a folder for this layer
                          const folder = parentFolder.addFolder(`📁 ${node.name}`);
                          
                          // Add toggle for the layer itself
                          folder.add(layerState, key)
                              .name(`👁️ ${node.name}`)
                              .listen() // Update UI if value changes programmatically
                              .onChange((v: boolean) => {
                                  // Update all children states recursively
                                  setLayerHierarchyVisibility(node, v);
                                  updateSceneVisibility();
                              });
                          
                          // Recursively add children
                          createLayerGUI(node.children, folder);
                      } else {
                          // Leaf node
                          parentFolder.add(layerState, key)
                              .name(`🔹 ${node.name}`)
                              .listen()
                              .onChange(() => {
                                  updateSceneVisibility();
                              });
                      }
                  });
              };

              // Initial Scene Update
              updateSceneVisibility();

              // Create GUI
              createLayerGUI(rootLayers, layersFolder);
              
          } else {
             // Fallback: Scan objects for unique layer indices if userData.layers is missing
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

      // Update Ground if shadows are enabled
      if (dirLightRef.current?.castShadow) {
          updateGround();
      }
      
      // Fix 1: Zoom Extents & Adjust Clipping Planes
      const box = new THREE.Box3().setFromObject(object);
      zoomToBox(box);

    }, (xhr) => {
        // Progress
        if (xhr.lengthComputable) {
            const percentComplete = (xhr.loaded / xhr.total) * 100;
            setLoadingProgress(Math.round(percentComplete));
            setIsLoading(true);
        }
    }, (error) => {
        console.error(error);
        setIsLoading(false);
    });
  };

  const updateSunPosition = (lat: number, lon: number, dateVal: Date) => {
      if (!dirLightRef.current) return;
      
      const times = SunCalc.getPosition(dateVal, lat, lon);
      
      const phi = times.altitude;
      const theta = times.azimuth; 
      
      // Conversion depends on coordinate system.
      // Standard Mapping for Z-up Architecture:
      // +X = East, +Y = North.
      // SunCalc Azimuth: 0 = South (-Y), -PI/2 = East (+X), PI/2 = West (-X), PI = North (+Y).
      
      const r = 1000;
      
      const x = r * Math.cos(phi) * -Math.sin(theta);
      const y = r * Math.cos(phi) * -Math.cos(theta);
      const z = r * Math.sin(phi);
      
      // If we have a target (center of model), we should position light relative to it?
      // Or just set position far away?
      // DirectionalLight uses position and target to determine direction.
      // Direction = Target - Position.
      // We want Light -> Target to be the Sun direction.
      // So Position should be Target + SunVector.
      
      if (dirLightRef.current.target) {
          const targetPos = dirLightRef.current.target.position;
          dirLightRef.current.position.set(
              targetPos.x + x,
              targetPos.y + y,
              targetPos.z + z
          );
      } else {
          dirLightRef.current.position.set(x, y, z);
      }
      
      dirLightRef.current.updateMatrixWorld();
  };
  
  // Update sun when params change
  useEffect(() => {
      updateSunPosition(latitude, longitude, date);
  }, [latitude, longitude, date]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100vh',
        background: `linear-gradient(to bottom, ${bgTop}, ${bgBottom})`
      }}
    >
      {isLoading && <div className="loader" title={`Loading: ${loadingProgress}%`}></div>}
      
      <ViewCube controlsRef={controlsRef} cameraRef={cameraRef} />
      
      <div ref={selectionBoxDivRef} className="selection-box"></div>
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
