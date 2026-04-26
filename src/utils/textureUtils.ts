import * as THREE from 'three';
import { gradients } from './gradients';

export const generateGradientTexture = (name: string) => {
  const stops = gradients[name] || gradients['turbo'];
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    stops.forEach((stop: {offset: number, color: string}) => {
      grad.addColorStop(stop.offset, stop.color);
    });
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
};
