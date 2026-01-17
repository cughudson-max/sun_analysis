import * as THREE from 'three';

export const isInMeasurements = (obj: THREE.Object3D) => {
    let ptr: THREE.Object3D | null = obj;
    while (ptr) {
        if (ptr.name === 'Measurements') return true;
        ptr = ptr.parent;
    }
    return false;
};

export const createDistanceSprite = (text: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Sprite(new THREE.SpriteMaterial());

    const fontSize = 20;
    const font = `${fontSize}px sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const paddingX = 12;
    const paddingY = 6;
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = Math.ceil((textWidth + paddingX * 2) * dpr);
    canvas.height = Math.ceil((fontSize + paddingY * 2) * dpr);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(0, 0, canvas.width / dpr, canvas.height / dpr, 8);
    } else {
        ctx.rect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }
    ctx.fill();

    ctx.font = font;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / (2 * dpr), canvas.height / (2 * dpr));

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
