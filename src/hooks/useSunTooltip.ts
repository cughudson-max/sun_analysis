import { useState, useRef, useEffect, MutableRefObject } from 'react';
import * as THREE from 'three';

interface UseSunTooltipProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.Camera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  isSunAnalysisEnabled: boolean;
  maxSunHours: number;
}

export function useSunTooltip({
  sceneRef,
  cameraRef,
  rendererRef,
  isSunAnalysisEnabled,
  maxSunHours
}: UseSunTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipText, setTooltipText] = useState('');
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const handleCanvasClick = (event: MouseEvent) => {
    if (!isSunAnalysisEnabled || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const canvas = rendererRef.current.domElement;
    const rect = canvas.getBoundingClientRect();

    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.current.setFromCamera(mouse.current, cameraRef.current);

    const intersects = raycaster.current.intersectObjects(sceneRef.current.children, true);

    for (const intersect of intersects) {
      if (intersect.object.name === 'GroundAcceptShadow' || intersect.object.name === 'BuildingAnalysisMesh') {
        let sunScore = 0;
        const meshObj = intersect.object as THREE.Mesh;

        if (intersect.face && meshObj.geometry && (meshObj.geometry as THREE.BufferGeometry).attributes.sunScore) {
          const sunScoreAttribute = (meshObj.geometry as THREE.BufferGeometry).attributes.sunScore;
          const index = intersect.face.a;
          sunScore = sunScoreAttribute.getX(index);
        }

        const hours = (sunScore * maxSunHours).toFixed(1);

        setTooltipText(`日照时长: ${hours} 小时`);
        setTooltipPosition({ x: event.clientX, y: event.clientY - 40 });

        setTimeout(() => {
          setTooltipPosition(null);
        }, 3000);

        break;
      }
    }
  };

  useEffect(() => {
    if (!rendererRef.current) return;

    const canvas = rendererRef.current.domElement;
    canvas.removeEventListener('click', handleCanvasClick);
    canvas.addEventListener('click', handleCanvasClick);

    return () => {
      canvas.removeEventListener('click', handleCanvasClick);
    };
  }, [isSunAnalysisEnabled, sceneRef, cameraRef, rendererRef, maxSunHours]);

  return {
    tooltipPosition,
    tooltipText
  };
}
