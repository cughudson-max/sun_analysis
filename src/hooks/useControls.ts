import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SelectionBox } from 'three/examples/jsm/interactive/SelectionBox.js';

export function useControls(
    cameraRef: React.MutableRefObject<THREE.Camera | null>,
    perspectiveCameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>,
    orthographicCameraRef: React.MutableRefObject<THREE.OrthographicCamera | null>,
    rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    projection: 'perspective' | 'orthographic',
    selectionBoxRef: React.MutableRefObject<SelectionBox | null>
) {
    const controlsRef = useRef<OrbitControls | null>(null);

    // Initialize Controls
    useEffect(() => {
        if (!cameraRef.current || !rendererRef.current) return;

        // Only create if not exists or if renderer element changed
        if (!controlsRef.current || controlsRef.current.domElement !== rendererRef.current.domElement) {
             const controls = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
             controls.enableDamping = false;
             controls.mouseButtons = {
                 LEFT: THREE.MOUSE.ROTATE,
                 MIDDLE: THREE.MOUSE.PAN,
                 RIGHT: THREE.MOUSE.DOLLY
             };
             controlsRef.current = controls;
        }

        return () => {
           // We might not want to dispose immediately on every re-render if refs are stable
           // But useEffect with empty deps or specific deps handles it.
           // However, OrbitControls attaches events.
        };
    }, [rendererRef.current]); 

    // Handle Projection Change
    useEffect(() => {
        const currentCamera = cameraRef.current;
        const controls = controlsRef.current;
        if (!currentCamera || !controls) return;
        
        // If the requested projection is already active, do nothing
        const isCurrentOrtho = currentCamera instanceof THREE.OrthographicCamera;
        const isTargetOrtho = projection === 'orthographic';
        if (isCurrentOrtho === isTargetOrtho) return;

        const target = controls.target.clone();
        const position = currentCamera.position.clone();
        const up = currentCamera.up.clone();
        const aspect = window.innerWidth / window.innerHeight;

        if (projection === 'perspective') {
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

        controls.object = cameraRef.current;
        controls.update();
        
        if (selectionBoxRef.current) {
            selectionBoxRef.current.camera = cameraRef.current;
        }
        
    }, [projection]);

    return controlsRef;
}
