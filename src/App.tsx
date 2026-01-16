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
  const cameraRef = useRef<THREE.Camera | null>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const orthoFrustumHeightRef = useRef<number>(100);
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
  const measureModeRef = useRef(false);
  const measurementGroupRef = useRef<THREE.Group | null>(null);
  const measurementStartRef = useRef<THREE.Vector3 | null>(null);
  const measurementTempMarkerRef = useRef<THREE.Mesh | null>(null);
  const highlightPointRef = useRef<THREE.Mesh | null>(null); // For snap highlight
  const measurePointGeometryRef = useRef<THREE.SphereGeometry | null>(null);
  const measureLineMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);
  const measurePointMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  
  // UI State
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [bgTop, setBgTop] = useState('#e0e0e0');
  const [bgBottom, setBgBottom] = useState('#ffffff');
  
  // Location & Time State (Defaults)
  const [latitude, setLatitude] = useState(39.9); // Beijing
  const [longitude, setLongitude] = useState(116.4); // Beijing
  const [date, setDate] = useState(new Date());

  const [isMeasureActive, setIsMeasureActive] = useState(false);
  const [isOrtho, setIsOrtho] = useState(false);

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

  const isInMeasurements = (obj: THREE.Object3D) => {
      let ptr: THREE.Object3D | null = obj;
      while (ptr) {
          if (ptr.name === 'Measurements') return true;
          ptr = ptr.parent;
      }
      return false;
  };

  const clearMeasurements = () => {
      const group = measurementGroupRef.current;
      if (!group) return;

      group.traverse((obj) => {
          if (obj instanceof THREE.Sprite) {
              const mat = obj.material;
              if (mat instanceof THREE.SpriteMaterial) {
                  if (mat.map) mat.map.dispose();
                  mat.dispose();
              }
              return;
          }

          if (obj instanceof THREE.Line) {
              obj.geometry.dispose();
              const mat = obj.material;
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
              else mat.dispose();
              return;
          }

          if (obj instanceof THREE.Mesh) {
              if (obj.geometry !== measurePointGeometryRef.current) obj.geometry.dispose();
              const mat = obj.material;
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
              else if (mat !== measurePointMaterialRef.current) mat.dispose();
          }
      });

      while (group.children.length) group.remove(group.children[0]);

      measurementStartRef.current = null;
      if (measurementTempMarkerRef.current) {
          measurementTempMarkerRef.current.parent?.remove(measurementTempMarkerRef.current);
          measurementTempMarkerRef.current = null;
      }
  };

  const createDistanceSprite = (text: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.Sprite(new THREE.SpriteMaterial());

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = '28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const material = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
          depthWrite: false
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'MeasurementLabel';
      return sprite;
  };

  const addMeasurement = (start: THREE.Vector3, end: THREE.Vector3) => {
      const group = measurementGroupRef.current;
      const pointGeo = measurePointGeometryRef.current;
      const pointMat = measurePointMaterialRef.current;
      const lineMat = measureLineMaterialRef.current;
      if (!group || !pointGeo || !pointMat || !lineMat) return;

      const startPoint = new THREE.Mesh(pointGeo, pointMat);
      startPoint.name = 'MeasurementPoint';
      startPoint.position.copy(start);
      startPoint.renderOrder = 9999;

      const endPoint = new THREE.Mesh(pointGeo, pointMat);
      endPoint.name = 'MeasurementPoint';
      endPoint.position.copy(end);
      endPoint.renderOrder = 9999;

      const lineGeom = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(lineGeom, lineMat);
      line.name = 'MeasurementLine';
      line.renderOrder = 9998;

      const distance = start.distanceTo(end);
      const label = createDistanceSprite(distance.toFixed(3));
      const mid = start.clone().add(end).multiplyScalar(0.5);
      label.position.copy(mid);

      const scaleBase = Math.min(Math.max(distance * 0.08, 2), 50);
      label.scale.set(scaleBase * 2.0, scaleBase * 0.5, 1);
      label.renderOrder = 10000;

      group.add(line);
      group.add(startPoint);
      group.add(endPoint);
      group.add(label);
      
      // Exit measure mode after successful measurement
      exitMeasureMode();
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

      // Check for snap
      // Always try to snap if close enough
      if (hit.face && hit.object instanceof THREE.Mesh) {
          const mesh = hit.object;
          const geom = mesh.geometry;
          if (geom instanceof THREE.BufferGeometry && geom.attributes.position) {
              const posAttr = geom.attributes.position as THREE.BufferAttribute;
              const a = hit.face.a;
              const b = hit.face.b;
              const c = hit.face.c;
              const vA = new THREE.Vector3().fromBufferAttribute(posAttr, a).applyMatrix4(mesh.matrixWorld);
              const vB = new THREE.Vector3().fromBufferAttribute(posAttr, b).applyMatrix4(mesh.matrixWorld);
              const vC = new THREE.Vector3().fromBufferAttribute(posAttr, c).applyMatrix4(mesh.matrixWorld);

              geom.computeBoundingSphere();
              const sphereRadius = geom.boundingSphere ? geom.boundingSphere.radius : 1;
              const worldScale = new THREE.Vector3();
              mesh.getWorldScale(worldScale);
              const snapDist = sphereRadius * Math.max(worldScale.x, worldScale.y, worldScale.z) * 0.05; // 5% tolerance

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

  const handleMeasureClick = (event: MouseEvent, raycaster: THREE.Raycaster, mouse: THREE.Vector2) => {
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
  };

  const enterMeasureMode = () => {
      measureModeRef.current = true;
      setIsMeasureActive(true);
      document.body.classList.add('cursor-crosshair');
      if (highlightPointRef.current) {
          highlightPointRef.current.visible = false;
      }
  };

  const exitMeasureMode = () => {
      measureModeRef.current = false;
      setIsMeasureActive(false);
      measurementStartRef.current = null;
      if (measurementTempMarkerRef.current) {
          measurementTempMarkerRef.current.visible = false;
      }
      if (highlightPointRef.current) {
          highlightPointRef.current.visible = false;
      }
      document.body.classList.remove('cursor-crosshair');
  };
  
  // Projection Function (defined before useEffect so it can be used in both)
  // But controls/camera refs need to be accessed inside.
  // We can define it here but it relies on refs which are constant.
  // Actually, we'll keep the logic inside useEffect or use a ref to function if needed.
  // For button, we need a stable function.
  
  const toggleProjection = () => {
      const next = isOrtho ? 'perspective' : 'orthographic';
      applyProjectionGlobal(next);
  };
  
  // Global reference to applyProjection for the button
  const applyProjectionRef = useRef<((type: 'perspective' | 'orthographic') => void) | null>(null);
  
  const applyProjectionGlobal = (type: 'perspective' | 'orthographic') => {
      if (applyProjectionRef.current) {
          applyProjectionRef.current(type);
          setIsOrtho(type === 'orthographic');
          saveSettings({ projection: type });
      }
  };

  // Keyboard Event Listener
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
              if (measureModeRef.current) {
                  exitMeasureMode();
              }
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps, using refs

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
    // Don't auto-enter measure mode from settings, it's confusing
    // if (savedSettings.measureMode !== undefined) measureModeRef.current = savedSettings.measureMode;
    
    if (savedSettings.projection === 'orthographic') setIsOrtho(true);

    if (savedSettings.month !== undefined || savedSettings.day !== undefined || savedSettings.hour !== undefined) {
        const now = new Date();
        const month = savedSettings.month !== undefined ? savedSettings.month : now.getMonth() + 1;
        const day = savedSettings.day !== undefined ? savedSettings.day : now.getDate();
        const hour = savedSettings.hour !== undefined ? savedSettings.hour : now.getHours() + now.getMinutes() / 60;
        now.setMonth(month - 1);
        now.setDate(day);
        now.setHours(Math.floor(hour));
        now.setMinutes((hour % 1) * 60);
        setDate(now);
    }

    // 1. Setup Scene
    const scene = new THREE.Scene();
    // scene.background = null; // Use CSS for gradient
    sceneRef.current = scene;

    // 2. Setup Camera
    const aspect = window.innerWidth / window.innerHeight;
    const defaultTarget = new THREE.Vector3(0, 0, 0);
    const defaultPosition = new THREE.Vector3(50, -50, 50);

    const perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
    perspectiveCamera.position.copy(defaultPosition);
    perspectiveCamera.lookAt(defaultTarget);
    perspectiveCameraRef.current = perspectiveCamera;

    const dist = defaultPosition.distanceTo(defaultTarget);
    const fovRad = (perspectiveCamera.fov * Math.PI) / 180;
    const orthoHeight = 2 * dist * Math.tan(fovRad / 2);
    const orthoWidth = orthoHeight * aspect;
    orthoFrustumHeightRef.current = orthoHeight;

    const orthographicCamera = new THREE.OrthographicCamera(
        -orthoWidth / 2,
        orthoWidth / 2,
        orthoHeight / 2,
        -orthoHeight / 2,
        0.1,
        10000
    );
    orthographicCamera.position.copy(defaultPosition);
    orthographicCamera.lookAt(defaultTarget);
    orthographicCamera.up.copy(perspectiveCamera.up);
    orthographicCameraRef.current = orthographicCamera;

    const projection = savedSettings.projection === 'orthographic' ? 'orthographic' : 'perspective';
    const camera = projection === 'orthographic' ? orthographicCamera : perspectiveCamera;
    cameraRef.current = camera;

    // 3. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lights
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
    
    dirLight.shadow.mapSize.width = savedSettings.shadowQuality || 4096;
    dirLight.shadow.mapSize.height = savedSettings.shadowQuality || 4096;
    dirLight.shadow.bias = savedSettings.shadowBias !== undefined ? savedSettings.shadowBias : -0.00005; 
    dirLight.shadow.normalBias = 0.02;
    dirLight.shadow.radius = savedSettings.shadowRadius !== undefined ? savedSettings.shadowRadius : 1;
    
    const d = 100;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 10000;

    scene.add(dirLight);
    scene.add(dirLight.target);
    dirLightRef.current = dirLight;
    
    // 5. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.DOLLY
    };
    controlsRef.current = controls;

    // 6. Helpers
    const grid = new THREE.GridHelper(100, 20);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);
    const axes = new THREE.AxesHelper(10);
    scene.add(axes);

    const measurementGroup = new THREE.Group();
    measurementGroup.name = 'Measurements';
    scene.add(measurementGroup);
    measurementGroupRef.current = measurementGroup;
    measurePointGeometryRef.current = new THREE.SphereGeometry(0.2, 16, 16);
    measureLineMaterialRef.current = new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, depthWrite: false });
    measurePointMaterialRef.current = new THREE.MeshBasicMaterial({ color: 0x00ffff, depthTest: false, depthWrite: false });

    // Highlight Point for Snapping
    const highlightGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, depthWrite: false, transparent: true, opacity: 0.8 });
    const highlightPoint = new THREE.Mesh(highlightGeo, highlightMat);
    highlightPoint.name = 'HighlightPoint';
    highlightPoint.visible = false;
    highlightPoint.renderOrder = 10002;
    scene.add(highlightPoint);
    highlightPointRef.current = highlightPoint;

    // 7. Selection Box Setup
    const selectionBox = new SelectionBox(camera, scene);
    selectionBoxRef.current = selectionBox;

    const applyProjection = (type: 'perspective' | 'orthographic') => {
        const currentCamera = cameraRef.current;
        if (!currentCamera) return;

        const target = controls.target.clone();
        const position = currentCamera.position.clone();
        const up = currentCamera.up.clone();
        const aspect = window.innerWidth / window.innerHeight;

        if (type === 'perspective') {
            const cam = perspectiveCameraRef.current;
            if (!cam) return;

            cam.aspect = aspect;
            cam.position.copy(position);
            cam.up.copy(up);
            cam.lookAt(target);
            cam.updateProjectionMatrix();
            cameraRef.current = cam;
        } else {
            const cam = orthographicCameraRef.current;
            const perspectiveCam = perspectiveCameraRef.current;
            if (!cam || !perspectiveCam) return;

            const dist = position.distanceTo(target);
            const fovRad = (perspectiveCam.fov * Math.PI) / 180;
            const orthoHeight = 2 * dist * Math.tan(fovRad / 2);
            const orthoWidth = orthoHeight * aspect;
            orthoFrustumHeightRef.current = orthoHeight;

            cam.left = -orthoWidth / 2;
            cam.right = orthoWidth / 2;
            cam.top = orthoHeight / 2;
            cam.bottom = -orthoHeight / 2;
            cam.position.copy(position);
            cam.up.copy(up);
            cam.lookAt(target);
            cam.updateProjectionMatrix();
            cameraRef.current = cam;
        }

        (controls as any).object = cameraRef.current;
        controls.update();
        if (selectionBoxRef.current) {
            (selectionBoxRef.current as any).camera = cameraRef.current;
        }
    };
    
    // Assign to global ref
    applyProjectionRef.current = applyProjection;

    // 8. Event Listeners for Interaction
    const handleResize = () => {
      const aspect = window.innerWidth / window.innerHeight;
      const currentCamera = cameraRef.current;

      if (currentCamera instanceof THREE.PerspectiveCamera) {
          currentCamera.aspect = aspect;
          currentCamera.updateProjectionMatrix();
      } else if (currentCamera instanceof THREE.OrthographicCamera) {
          const orthoHeight = orthoFrustumHeightRef.current;
          const orthoWidth = orthoHeight * aspect;
          currentCamera.left = -orthoWidth / 2;
          currentCamera.right = orthoWidth / 2;
          currentCamera.top = orthoHeight / 2;
          currentCamera.bottom = -orthoHeight / 2;
          currentCamera.updateProjectionMatrix();
      }

      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Render Loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Adaptive Scaling for Measurements
      const currentCamera = cameraRef.current;
      if (currentCamera && measurementGroupRef.current) {
          // Calculate scale factor
          let scaleFactor = 1;
          const targetPos = controlsRef.current?.target || new THREE.Vector3();
          
          // Logic: We want the markers to be constant screen size.
          // Screen size = WorldSize / Distance * ProjectionConstant
          // So WorldSize = DesiredScreenSize * Distance / ProjectionConstant
          
          if (currentCamera instanceof THREE.PerspectiveCamera) {
              // For perspective, size ~ distance
              // We can just use the distance from camera to the object center (approx)
              // Or better, distance to target (orbit center) as a uniform scale for simplicity
              const dist = currentCamera.position.distanceTo(targetPos);
              scaleFactor = dist * 0.05; // Adjust constant as needed
          } else if (currentCamera instanceof THREE.OrthographicCamera) {
              // For ortho, size ~ frustum height
              scaleFactor = (currentCamera.top - currentCamera.bottom) * 0.05;
          }
          
          // Apply to Highlight Point
          if (highlightPointRef.current) {
             highlightPointRef.current.scale.set(scaleFactor, scaleFactor, scaleFactor);
          }
          
          // Apply to Temp Marker
          if (measurementTempMarkerRef.current) {
              measurementTempMarkerRef.current.scale.set(scaleFactor, scaleFactor, scaleFactor);
          }
          
          // Apply to existing measurements
          measurementGroupRef.current.children.forEach(child => {
              if (child.name === 'MeasurementPoint') {
                  child.scale.set(scaleFactor, scaleFactor, scaleFactor);
              } else if (child.name === 'MeasurementLabel') {
                  // Labels are sprites, they attenuate by default.
                  // If we want to control them manually or ensure they match:
                  // scaleFactor * BaseScale
                  // But sprites usually handle themselves well if sizeAttenuation is true (default).
                  // If user wants them "gradient" (scaling), default behavior is actually correct for "World Space" size.
                  // But if they want "Constant Screen Size", then we need to scale them up as we zoom out.
                  // The previous code had `label.scale.set` based on distance.
                  // Let's enforce constant screen size logic:
                  child.scale.set(scaleFactor * 2.0, scaleFactor * 0.5, 1);
              }
          });
      }
      
      renderer.render(scene, cameraRef.current || camera);
    };
    animate();

    // 9. UI (lil-gui)
    const gui = new GUI({ title: 'Settings' });
    guiRef.current = gui;
    const settings = {
      brightness: savedBrightness,
      ambientIntensity: savedSettings.ambientIntensity !== undefined ? savedSettings.ambientIntensity : 1.0,
      ambientColor: savedSettings.ambientColor || '#ffffff',
      shadows: savedSettings.shadows !== undefined ? savedSettings.shadows : true,
      parallelProjection: projection === 'orthographic',
      showEdges: showEdgesRef.current,
      measureMode: measureModeRef.current,
      clearMeasurements: () => {
          clearMeasurements();
      },
      bgTop: savedSettings.bgTop || '#e0e0e0',
      bgBottom: savedSettings.bgBottom || '#ffffff',
      loadFile: () => {
        document.getElementById('file-input')?.click();
      }
    };

    gui.add(settings, 'brightness', 0, 20).name('Brightness (Sun)').onChange((v: number) => {
      if (dirLightRef.current) dirLightRef.current.intensity = v;
      saveSettings({ brightness: v });
    });

    // Removed Parallel Projection from GUI as requested
    /*
    gui.add(settings, 'parallelProjection').name('Parallel Projection').onChange((v: boolean) => {
        const next = v ? 'orthographic' : 'perspective';
        applyProjection(next);
        saveSettings({ projection: next });
    });
    */

    const folderAmbient = gui.addFolder('Ambient Light');
    folderAmbient.add(settings, 'ambientIntensity', 0, 20).name('Intensity').onChange((v: number) => {
        if (ambientLightRef.current) ambientLightRef.current.intensity = v;
        saveSettings({ ambientIntensity: v });
    });
    folderAmbient.addColor(settings, 'ambientColor').name('Color').onChange((v: string) => {
        if (ambientLightRef.current) ambientLightRef.current.color.set(v);
        saveSettings({ ambientColor: v });
    });

    const shadowFolder = gui.addFolder('Shadows');
    shadowFolder.add(settings, 'shadows').name('Enable Shadows').onChange((enabled: boolean) => {
        if (dirLightRef.current) dirLightRef.current.castShadow = enabled;
        saveSettings({ shadows: enabled });
        if (enabled) updateGround();
        else {
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
            if (dirLightRef.current.shadow.map) {
                dirLightRef.current.shadow.map.dispose();
                dirLightRef.current.shadow.map = null;
            }
        }
        saveSettings({ shadowQuality: v });
    });
    
    shadowFolder.add(shadowParams, 'bias', -0.01, 0.01, 0.0001).name('Bias').onChange((v: number) => {
        if (dirLightRef.current) dirLightRef.current.shadow.bias = v;
        saveSettings({ shadowBias: v });
    });
    
    shadowFolder.add(shadowParams, 'radius', 0, 10, 0.1).name('Blur Radius').onChange((v: number) => {
        if (dirLightRef.current) dirLightRef.current.shadow.radius = v;
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

    const measureFolder = gui.addFolder('Measure');
    // Removed Measure Mode toggle from GUI as requested
    /*
    measureFolder.add(settings, 'measureMode').name('Measure Distance').onChange((v: boolean) => {
        measureModeRef.current = v;
        saveSettings({ measureMode: v });
        if (!v) {
            measurementStartRef.current = null;
            if (measurementTempMarkerRef.current) measurementTempMarkerRef.current.visible = false;
        }
    });
    */
    measureFolder.add(settings, 'clearMeasurements').name('Clear Measurements');

    gui.addColor(settings, 'bgTop').onChange((v: string) => {
        setBgTop(v);
        saveSettings({ bgTop: v });
    });
    gui.addColor(settings, 'bgBottom').onChange((v: string) => {
        setBgBottom(v);
        saveSettings({ bgBottom: v });
    });
    
    const folderLocation = gui.addFolder('Location & Time');
    
    const locSettings = {
        latitude: savedSettings.latitude !== undefined ? savedSettings.latitude : 39.9,
        longitude: savedSettings.longitude !== undefined ? savedSettings.longitude : 116.4,
        dateString: new Date().toISOString().substring(0, 16)
    };
    
    folderLocation.add(locSettings, 'latitude', -90, 90).name('Latitude').onChange((v: number) => {
        setLatitude(v);
        saveSettings({ latitude: v });
    });
    folderLocation.add(locSettings, 'longitude', -180, 180).name('Longitude').onChange((v: number) => {
        setLongitude(v);
        saveSettings({ longitude: v });
    });
    
     const timeSettings = {
         hour: savedSettings.hour !== undefined ? savedSettings.hour : new Date().getHours() + new Date().getMinutes() / 60,
         month: savedSettings.month !== undefined ? savedSettings.month : new Date().getMonth() + 1,
         day: savedSettings.day !== undefined ? savedSettings.day : new Date().getDate()
     };

     const updateDate = () => {
         const now = new Date();
         now.setMonth(timeSettings.month - 1);
         now.setDate(timeSettings.day);
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
         startMouseRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      }
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onPointerMove = (event: PointerEvent) => {
      // 1. Handle Selection Box
      if (isSelecting && selectionBoxRef.current) {
        if (selectionBoxDivRef.current) {
            const currentX = event.clientX;
            const currentY = event.clientY;
            const startX = startMouseRef.current.x;
            const startY = startMouseRef.current.y;
            
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
      
      // 2. Handle Measure Highlight (Snap)
      if (measureModeRef.current) {
          const snapped = getSnappedPoint(event.clientX, event.clientY, raycaster, mouse);
          if (snapped && highlightPointRef.current) {
              highlightPointRef.current.position.copy(snapped);
              highlightPointRef.current.visible = true;
          } else if (highlightPointRef.current) {
              highlightPointRef.current.visible = false;
          }
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (isSelecting && selectionBoxRef.current) {
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
      }
      
      if (controlsRef.current) controlsRef.current.enabled = true;
    };

    const onClick = (event: MouseEvent) => {
      if (event.ctrlKey) return; 
      
      const now = Date.now();
      if (now - startMouseRef.current.time > 300) {
          return;
      }

      if (measureModeRef.current) {
          handleMeasureClick(event, raycaster, mouse);
          return;
      }
      
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      
      if (!cameraRef.current) return;
      raycaster.setFromCamera(mouse, cameraRef.current);
      if (!sceneRef.current) return;
      
      const intersects = raycaster.intersectObjects(sceneRef.current.children, true);
      const validIntersects = intersects.filter(hit => {
         return hit.object instanceof THREE.Mesh &&
                !isInMeasurements(hit.object) &&
                hit.object.name !== 'HighlightLine' &&
                hit.object.name !== 'HighlightPoint' &&
                hit.object.name !== 'Ground';
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
  }, []);

  const handleSelection = (objects: THREE.Object3D[], shiftKey: boolean) => {
    const validObjects = objects.filter(o => o instanceof THREE.Mesh && !isInMeasurements(o) && o.name !== 'HighlightLine' && o.name !== 'HighlightPoint' && o.name !== 'Ground');
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

  const zoomToBox = (box: THREE.Box3) => {
      if (box.isEmpty() || !cameraRef.current || !controlsRef.current) return;
      
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      if (direction.lengthSq() < 0.001) direction.set(1, -1, 1).normalize();

      if (camera instanceof THREE.PerspectiveCamera) {
          const fov = (camera.fov * Math.PI) / 180;
          let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
          cameraZ *= 2.0;
          const newPos = center.clone().add(direction.multiplyScalar(cameraZ));
          camera.position.copy(newPos);
          camera.lookAt(center);

          camera.near = maxDim / 1000;
          camera.far = maxDim * 100;
          camera.updateProjectionMatrix();
      } else if (camera instanceof THREE.OrthographicCamera) {
          const aspect = window.innerWidth / window.innerHeight;
          const orthoHeight = Math.max(maxDim * 2.0, 1);
          const orthoWidth = orthoHeight * aspect;
          orthoFrustumHeightRef.current = orthoHeight;

          camera.left = -orthoWidth / 2;
          camera.right = orthoWidth / 2;
          camera.top = orthoHeight / 2;
          camera.bottom = -orthoHeight / 2;

          const dist = maxDim * 2.0;
          const newPos = center.clone().add(direction.multiplyScalar(dist));
          camera.position.copy(newPos);
          camera.lookAt(center);

          camera.near = maxDim / 1000;
          camera.far = maxDim * 100;
          camera.updateProjectionMatrix();
      }
      
      if (dirLightRef.current) {
          const d = maxDim * 1.5;
          dirLightRef.current.shadow.camera.left = -d;
          dirLightRef.current.shadow.camera.right = d;
          dirLightRef.current.shadow.camera.top = d;
          dirLightRef.current.shadow.camera.bottom = -d;
          dirLightRef.current.shadow.camera.far = Math.max(5000, maxDim * 10);
          dirLightRef.current.shadow.camera.updateProjectionMatrix();
          
          dirLightRef.current.target.position.copy(center);
          dirLightRef.current.target.updateMatrixWorld();
          
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
      
      const box = new THREE.Box3();
      let hasObjects = false;
      
      sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
              if (child.name === 'Ground') return;
              if (child.name === 'selection-box') return;
              if (child.name === 'HighlightLine') return;
              if (child.name === 'HighlightPoint') return;
              if (child instanceof THREE.GridHelper) return;
              if (child instanceof THREE.AxesHelper) return;
              
              box.expandByObject(child);
              hasObjects = true;
          }
      });
      
      if (!hasObjects) {
           const defaultSize = 1000;
           box.min.set(-defaultSize, -defaultSize, 0);
           box.max.set(defaultSize, defaultSize, 0);
      }
      
      const size = new THREE.Vector3();
      box.getSize(size);
      
      const maxDim = Math.max(size.x, size.y);
      const groundSize = Math.max(maxDim * 10, 10000);
      
      if (groundRef.current) {
          sceneRef.current.remove(groundRef.current);
          if (groundRef.current.geometry) groundRef.current.geometry.dispose();
      }
      
      const groundGeometry = new THREE.PlaneGeometry(groundSize, groundSize);
      const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3, color: 0x000000 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.name = 'Ground';
      
      ground.position.set(0, 0, 0);
      ground.receiveShadow = true;
      
      sceneRef.current.add(ground);
      groundRef.current = ground;
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
           line.visible = showEdgesRef.current;
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
      zoomToBox(box);

    }, (xhr) => {
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
      const r = 1000;
      
      const x = r * Math.cos(phi) * -Math.sin(theta);
      const y = r * Math.cos(phi) * -Math.cos(theta);
      const z = r * Math.sin(phi);
      
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
      
      <div className="toolbar">
          <button 
              className={`toolbar-btn ${isMeasureActive ? 'active' : ''}`}
              onClick={isMeasureActive ? exitMeasureMode : enterMeasureMode}
              title="Measure Distance (M)"
          >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-5-5 4-4 5 5z"/><path d="m5 16 16-16"/><path d="m11 21-8-8"/><path d="m5 16-3 3 6 6 3-3"/></svg>
          </button>
          
          <button 
              className={`toolbar-btn ${isOrtho ? 'active' : ''}`}
              onClick={toggleProjection}
              title="Toggle Projection (Perspective/Parallel)"
          >
              {isOrtho ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h16"/><path d="M4 16h16"/><path d="M4 4h16"/><path d="M4 20h16"/></svg>
              ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 0 0-9 9 9 9 0 0 0 9 9 9 9 0 0 0 9-9 9 9 0 0 0-9-9z"/><path d="M3 12h18"/><path d="M12 3v18"/><path d="M16.5 7.5l-9 9"/><path d="M7.5 7.5l9 9"/></svg>
              )}
          </button>
      </div>
      
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
