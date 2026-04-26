import * as THREE from 'three';

export function downloadScreenshot(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  fileName: string | null
) {
  const scale = 2;
  const width = renderer.domElement.width;
  const height = renderer.domElement.height;

  renderer.render(scene, camera);

  requestAnimationFrame(() => {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = width * scale;
    scaledCanvas.height = height * scale;
    const ctx = scaledCanvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(renderer.domElement, 0, 0, width * scale, height * scale);
    }

    const link = document.createElement('a');
    link.download = fileName ? `${fileName}_screenshot.png` : '3dm-viewer-screenshot.png';
    link.href = scaledCanvas.toDataURL('image/png');
    link.click();
  });
}
