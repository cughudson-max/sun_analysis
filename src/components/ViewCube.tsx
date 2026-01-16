import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ViewCubeProps {
  controlsRef: React.MutableRefObject<OrbitControls | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
}

const ViewCube: React.FC<ViewCubeProps> = ({ controlsRef, cameraRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRefGizmo = useRef<THREE.PerspectiveCamera | null>(null);
  const isHoveredRef = useRef<boolean>(false);

  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Setup Renderer
    const width = 120;
    const height = 120;
    const renderer = new THREE.WebGLRenderer({ 
        canvas: canvasRef.current, 
        alpha: true, 
        antialias: true 
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0); // Transparent
    rendererRef.current = renderer;

    // 2. Setup Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 3. Setup Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 5;
    camera.position.y = 0;
    camera.position.x = 0;
    cameraRefGizmo.current = camera;

    // 4. Create Gizmo Geometry (Z-Up: Blue=Up, Green=Y, Red=X)
    const axisLength = 1.2;
    const sphereRadius = 0.15; // Slimmer balls
    const cylinderRadius = 0.04; // Slimmer sticks
    const cylinderHeight = axisLength - sphereRadius; // Slightly shorter to connect
    
    const colors = {
        x: 0xff3653, // Red
        y: 0x8adb00, // Green
        z: 0x2c8fff, // Blue
        grey: 0xcccccc,
        hover: 0xffffff
    };

    const createAxis = (axis: 'x' | 'y' | 'z', direction: 1 | -1) => {
        const group = new THREE.Group();
        const color = direction === 1 ? colors[axis] : colors.grey;
        
        // Material
        const material = new THREE.MeshBasicMaterial({ color: color });
        
        // Sphere (Tip)
        const sphereGeo = new THREE.SphereGeometry(sphereRadius, 32, 32);
        const sphere = new THREE.Mesh(sphereGeo, material);
        const pos = new THREE.Vector3();
        pos[axis] = direction * axisLength;
        sphere.position.copy(pos);
        sphere.userData = { axis, direction, type: 'node' }; // Tag for interaction
        group.add(sphere);

        // Cylinder (Stick) - Only for positive axes
        if (direction === 1) {
            const cylinderGeo = new THREE.CylinderGeometry(cylinderRadius, cylinderRadius, cylinderHeight, 32);
            // Cylinder is Y-up by default, rotate it
            const cylinder = new THREE.Mesh(cylinderGeo, material);
            cylinder.position[axis] = axisLength / 2;
            
            if (axis === 'x') {
                cylinder.rotation.z = -Math.PI / 2;
            } else if (axis === 'z') {
                cylinder.rotation.x = Math.PI / 2;
            }
            // Y is default
            
            cylinder.userData = { axis, direction, type: 'stick' };
            group.add(cylinder);
        }

        return group;
    };

    const axesGroup = new THREE.Group();
    // Z-Up standard: X=Red, Y=Green, Z=Blue
    axesGroup.add(createAxis('x', 1));
    axesGroup.add(createAxis('x', -1));
    axesGroup.add(createAxis('y', 1));
    axesGroup.add(createAxis('y', -1));
    axesGroup.add(createAxis('z', 1));
    axesGroup.add(createAxis('z', -1));
    
    // Central Node (Hidden or Small)
    // const centerGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    // const center = new THREE.Mesh(centerGeo, new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 }));
    // axesGroup.add(center);

    scene.add(axesGroup);

    // 5. Animation Loop
    const animate = () => {
        if (!rendererRef.current) return;
        requestAnimationFrame(animate);
        
        if (cameraRef.current && cameraRefGizmo.current && controlsRef.current) {
            // Calculate direction from target to camera (Orbit behavior)
            const mainCam = cameraRef.current;
            const controls = controlsRef.current;
            
            // Vector from Target to Camera
            const direction = new THREE.Vector3().subVectors(mainCam.position, controls.target);
            direction.normalize().multiplyScalar(5); // Fixed distance for Gizmo
            
            // Gizmo Camera Position = Gizmo Origin (0,0,0) + Direction
            cameraRefGizmo.current.position.copy(direction);
            cameraRefGizmo.current.lookAt(0, 0, 0);
            
            // Sync Up Vector
            cameraRefGizmo.current.up.copy(mainCam.up);
        }
        
        renderer.render(scene, camera);
    };
    animate();

    // 6. Interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointer = (event: PointerEvent) => {
        if (!canvasRef.current || !sceneRef.current || !cameraRefGizmo.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, cameraRefGizmo.current);
        const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

        // Reset colors
        sceneRef.current.traverse((child) => {
            if (child instanceof THREE.Mesh && child.userData.type === 'node') {
                const { axis, direction } = child.userData;
                const baseColor = direction === 1 ? colors[axis as keyof typeof colors] : colors.grey;
                (child.material as THREE.MeshBasicMaterial).color.setHex(baseColor as number);
            }
        });

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            if (hit.userData.type === 'node' && hit instanceof THREE.Mesh) {
                const mat = hit.material;
                if (mat instanceof THREE.MeshBasicMaterial) {
                    mat.color.setHex(colors.hover);
                }
                canvasRef.current.style.cursor = 'pointer';
                isHoveredRef.current = true;
                return;
            }
        }
        
        canvasRef.current.style.cursor = 'default';
        isHoveredRef.current = false;
    };

    const handleClick = (event: MouseEvent) => {
        if (!isHoveredRef.current || !canvasRef.current || !cameraRefGizmo.current || !sceneRef.current) return;
        
        const rect = canvasRef.current.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, cameraRefGizmo.current);
        const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const { axis, direction } = hit.userData;
            
            if (axis && direction && controlsRef.current && cameraRef.current) {
                const controls = controlsRef.current;
                const camera = cameraRef.current;
                
                const target = controls.target.clone();
                const dist = camera.position.distanceTo(target);
                
                const newPos = new THREE.Vector3();
                
                // Map axis to vector
                // +X -> (1, 0, 0)
                // -X -> (-1, 0, 0)
                // etc.
                if (axis === 'x') newPos.set(direction * dist, 0, 0);
                if (axis === 'y') newPos.set(0, direction * dist, 0);
                if (axis === 'z') newPos.set(0, 0, direction * dist);
                
                // Position is relative to target
                newPos.add(target);
                
                camera.position.copy(newPos);
                camera.lookAt(target);
                controls.update();
            }
        }
    };

    canvasRef.current.addEventListener('pointermove', handlePointer);
    canvasRef.current.addEventListener('click', handleClick);

    return () => {
        if (canvasRef.current) {
            canvasRef.current.removeEventListener('pointermove', handlePointer);
            canvasRef.current.removeEventListener('click', handleClick);
        }
        renderer.dispose();
    };
  }, [controlsRef, cameraRef]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1001 }} />;
};

export default ViewCube;
