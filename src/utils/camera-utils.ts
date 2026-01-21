import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ZoomToBoxOptions = {
    animate?: boolean;
    durationMs?: number;
};

let zoomAnimSeq = 0;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const zoomToBox = (
    box: THREE.Box3,
    camera: THREE.Camera,
    controls: OrbitControls,
    orthoFrustumHeightRef: React.MutableRefObject<number>,
    dirLight?: THREE.DirectionalLight,
    onLightUpdate?: () => void,
    options?: ZoomToBoxOptions
) => {
    if (box.isEmpty()) return;
    
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (direction.lengthSq() < 0.001) direction.set(1, -1, 1).normalize();

    const applyLight = () => {
        if (!dirLight) return;
        const d = maxDim * 1.5;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.camera.far = Math.max(5000, maxDim * 10);
        dirLight.shadow.camera.updateProjectionMatrix();
        
        dirLight.target.position.copy(center);
        dirLight.target.updateMatrixWorld();
    };

    const finalize = () => {
        applyLight();
        if (onLightUpdate) onLightUpdate();
        controls.target.copy(center);
        controls.update();
    };

    const doInstant = () => {
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

        finalize();
    };

    if (!options?.animate) {
        doInstant();
        return;
    }

    const durationMs = Math.max(0, options.durationMs ?? 350);
    if (durationMs <= 0) {
        doInstant();
        return;
    }

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    const token = ++zoomAnimSeq;
    (camera as any).userData = (camera as any).userData || {};
    (camera as any).userData.__zoomToBoxAnimToken = token;

    let endPos = startPos.clone();
    let endNear = (camera as any).near ?? 0.1;
    let endFar = (camera as any).far ?? 10000;
    let startNear = endNear;
    let startFar = endFar;

    let isOrtho = false;
    let startLeft = 0;
    let startRight = 0;
    let startTop = 0;
    let startBottom = 0;
    let endLeft = 0;
    let endRight = 0;
    let endTop = 0;
    let endBottom = 0;
    let startOrthoHeight = orthoFrustumHeightRef.current;
    let endOrthoHeight = orthoFrustumHeightRef.current;

    if (camera instanceof THREE.PerspectiveCamera) {
        const fov = (camera.fov * Math.PI) / 180;
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
        cameraZ *= 2.0;
        endPos = center.clone().add(direction.clone().multiplyScalar(cameraZ));
        startNear = camera.near;
        startFar = camera.far;
        endNear = maxDim / 1000;
        endFar = maxDim * 100;
    } else if (camera instanceof THREE.OrthographicCamera) {
        isOrtho = true;
        const aspect = window.innerWidth / window.innerHeight;
        endOrthoHeight = Math.max(maxDim * 2.0, 1);
        const orthoWidth = endOrthoHeight * aspect;
        endLeft = -orthoWidth / 2;
        endRight = orthoWidth / 2;
        endTop = endOrthoHeight / 2;
        endBottom = -endOrthoHeight / 2;

        startLeft = camera.left;
        startRight = camera.right;
        startTop = camera.top;
        startBottom = camera.bottom;

        startNear = camera.near;
        startFar = camera.far;
        endNear = maxDim / 1000;
        endFar = maxDim * 100;

        const dist = maxDim * 2.0;
        endPos = center.clone().add(direction.clone().multiplyScalar(dist));
    } else {
        doInstant();
        return;
    }

    applyLight();

    const startTime = performance.now();
    const step = (now: number) => {
        const curToken = (camera as any).userData?.__zoomToBoxAnimToken;
        if (curToken !== token) return;

        const t = clamp01((now - startTime) / durationMs);
        const k = easeInOutCubic(t);

        camera.position.lerpVectors(startPos, endPos, k);
        controls.target.lerpVectors(startTarget, center, k);

        if ((camera as any).near !== undefined) {
            (camera as any).near = startNear + (endNear - startNear) * k;
        }
        if ((camera as any).far !== undefined) {
            (camera as any).far = startFar + (endFar - startFar) * k;
        }

        if (isOrtho && camera instanceof THREE.OrthographicCamera) {
            camera.left = startLeft + (endLeft - startLeft) * k;
            camera.right = startRight + (endRight - startRight) * k;
            camera.top = startTop + (endTop - startTop) * k;
            camera.bottom = startBottom + (endBottom - startBottom) * k;
            orthoFrustumHeightRef.current = startOrthoHeight + (endOrthoHeight - startOrthoHeight) * k;
        }

        camera.updateProjectionMatrix();
        controls.update();

        if (t < 1) {
            requestAnimationFrame(step);
            return;
        }

        camera.position.copy(endPos);
        controls.target.copy(center);
        if ((camera as any).near !== undefined) (camera as any).near = endNear;
        if ((camera as any).far !== undefined) (camera as any).far = endFar;
        if (isOrtho && camera instanceof THREE.OrthographicCamera) {
            camera.left = endLeft;
            camera.right = endRight;
            camera.top = endTop;
            camera.bottom = endBottom;
            orthoFrustumHeightRef.current = endOrthoHeight;
        }
        camera.updateProjectionMatrix();
        controls.update();

        if (onLightUpdate) onLightUpdate();
    };

    requestAnimationFrame(step);
};
