import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function useThreeScene(containerRef: React.RefObject<HTMLDivElement>) {
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const perspectiveCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const orthographicCameraRef = useRef<THREE.OrthographicCamera | null>(null);
    const cameraRef = useRef<THREE.Camera | null>(null); // Current active camera
    const orthoFrustumHeightRef = useRef<number>(100);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight || window.innerHeight;

        // 1. Setup Scene
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // 2. Setup Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, preserveDrawingBuffer: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.localClippingEnabled = true;
        containerRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 3. Setup Cameras
        const aspect = width / height;
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

        // Default to perspective initially
        cameraRef.current = perspectiveCamera;

        // 4. Handle Resize
        const handleResize = () => {
            if (!rendererRef.current || !containerRef.current) return;
            const newWidth = containerRef.current.clientWidth;
            const newHeight = containerRef.current.clientHeight || window.innerHeight;
            const newAspect = newWidth / newHeight;

            if (perspectiveCameraRef.current) {
                perspectiveCameraRef.current.aspect = newAspect;
                perspectiveCameraRef.current.updateProjectionMatrix();
            }

            if (orthographicCameraRef.current) {
                const h = orthoFrustumHeightRef.current;
                const w = h * newAspect;
                orthographicCameraRef.current.left = -w / 2;
                orthographicCameraRef.current.right = w / 2;
                orthographicCameraRef.current.top = h / 2;
                orthographicCameraRef.current.bottom = -h / 2;
                orthographicCameraRef.current.updateProjectionMatrix();
            }

            rendererRef.current.setSize(newWidth, newHeight);
        };

        window.addEventListener('resize', handleResize);
        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => {
                handleResize();
            })
            : null;
        resizeObserver?.observe(container);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver?.disconnect();
            renderer.dispose();
            if (containerRef.current && renderer.domElement) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
    }, [containerRef]);

    return {
        sceneRef,
        rendererRef,
        perspectiveCameraRef,
        orthographicCameraRef,
        cameraRef,
        orthoFrustumHeightRef
    };
}
