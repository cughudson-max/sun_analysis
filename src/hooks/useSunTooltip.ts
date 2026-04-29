import { useState, useRef, useEffect, MutableRefObject } from 'react';
import * as THREE from 'three';

interface UseSunTooltipProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.Camera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  isSunAnalysisEnabled: boolean;
  isTagMode: boolean;
  maxSunHours: number;
}

export function useSunTooltip({
  sceneRef,
  cameraRef,
  rendererRef,
  isSunAnalysisEnabled,
  isTagMode,
  maxSunHours
}: UseSunTooltipProps) {
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipText, setTooltipText] = useState('');
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCanvasInteraction = (event: MouseEvent) => {
    if (!isSunAnalysisEnabled || !sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    if (!isTagMode) return;

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

        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }

        setTooltipText(`日照时长: ${hours} 小时`);
        setTooltipPosition({ x: event.clientX, y: event.clientY - 40 });

        break;
      }
    }
  };

  useEffect(() => {
    if (!rendererRef.current) return;

    const canvas = rendererRef.current.domElement;
    canvas.removeEventListener('mousemove', handleCanvasInteraction);
    if (isTagMode && isSunAnalysisEnabled) {
      canvas.addEventListener('mousemove', handleCanvasInteraction);
    }

    return () => {
      canvas.removeEventListener('mousemove', handleCanvasInteraction);
    };
  }, [isTagMode, isSunAnalysisEnabled, sceneRef, cameraRef, rendererRef, maxSunHours]);

  return {
    tooltipPosition,
    tooltipText
  };
}
