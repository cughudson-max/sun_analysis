import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const zoomToBox = (
    box: THREE.Box3,
    camera: THREE.Camera,
    controls: OrbitControls,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    dirLight?: THREE.DirectionalLight,
    onLightUpdate?: () => void
) => {
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

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
    
    if (dirLight) {
        const d = maxDim * 1.5;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.far = Math.max(5000, maxDim * 10);
        dirLight.shadow.camera.updateProjectionMatrix();
        
        dirLight.target.position.copy(center);
        dirLight.target.updateMatrixWorld();
        
        if (onLightUpdate) onLightUpdate();
    }
    
    controls.target.copy(center);
    controls.update();
};
