import { useState, useRef, useEffect, MutableRefObject } from 'react';
import * as THREE from 'three';
import SunCalc from 'suncalc';
import { generateGradientTexture } from '../utils/textureUtils';
import { getNowParts, zonedTimeToUtc } from '../utils/timeUtils';

interface UseSunAnalysisProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  settings: any;
  sunSettings: any;
  selectedGradient: string;
}

export function useSunAnalysis({
  sceneRef,
  rendererRef,
  settings,
  sunSettings,
  selectedGradient
}: UseSunAnalysisProps) {
  const [isSunAnalysisRunning, setIsSunAnalysisRunning] = useState(false);
  const [maxSunHours, setMaxSunHours] = useState(0);
  const [isSunAnalysisEnabled, setIsSunAnalysisEnabled] = useState(false);
  
  const sunAnalysisGroupRef = useRef<THREE.Group | null>(null);
  const sunAnalysisTextureRef = useRef<THREE.Texture | null>(null);
  const sunAnalysisRunIdRef = useRef(0);
  const stopSignalRef = useRef(false);

  const analysisPrecision = sunSettings.precision;
  const sunAnalysisInterval = sunSettings.interval;

  const clearSunAnalysis = (dispose = true) => {
    const scene = sceneRef.current;
    if (scene && sunAnalysisGroupRef.current) {
      scene.remove(sunAnalysisGroupRef.current);
    }
    if (dispose && sunAnalysisGroupRef.current) {
      sunAnalysisGroupRef.current.traverse(obj => {
        const anyObj: any = obj as any;
        if (anyObj.material) {
          const mat = anyObj.material;
          if (Array.isArray(mat)) mat.forEach(m => m.dispose());
          else mat.dispose?.();
        }
        if (anyObj.geometry) {
          anyObj.geometry.dispose?.();
        }
      });
    }
    if (dispose && sunAnalysisTextureRef.current) {
      const tex = sunAnalysisTextureRef.current;
      if ((tex as any)._renderTarget) {
          ((tex as any)._renderTarget as THREE.WebGLRenderTarget).dispose();
      }
      tex.dispose();
      sunAnalysisTextureRef.current = null;
    }
    sunAnalysisGroupRef.current = null;
    setMaxSunHours(0);
  };

  const runSunAnalysis = async () => {
    if (!sceneRef.current) return;
    if (!rendererRef.current) return;
    if (isSunAnalysisRunning) {
      stopSignalRef.current = true;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const runId = sunAnalysisRunIdRef.current;
    setIsSunAnalysisRunning(true);
    let createdGroup: THREE.Group | null = null;
    let depthTarget: THREE.WebGLRenderTarget | null = null;
    let depthMaterial: THREE.MeshDepthMaterial | null = null;
    let accumTarget: THREE.WebGLRenderTarget | null = null;
    let analysisMaterial: THREE.ShaderMaterial | null = null;
    let canceled = false;
    try {
      const scene = sceneRef.current;
      const renderer = rendererRef.current;

      const box = new THREE.Box3();
      let hasObjects = false;
      const buildingMeshes: THREE.Mesh[] = [];
      const isActuallyVisible = (obj: THREE.Object3D) => {
        let cur: THREE.Object3D | null = obj;
        while (cur) {
          if (!cur.visible) return false;
          cur = cur.parent;
        }
        return true;
      };
      scene.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        if (!isActuallyVisible(child)) return;
        if (child.name === 'Ground') return;
        if (child.name === 'selection-box') return;
        if (child.name === 'HighlightLine') return;
        if (child.name === 'HighlightPoint') return;
        if (child.name === 'GroupAcceptShadow') return;
        if (child.name === 'GroundAcceptShadow') return;
        if (child instanceof THREE.GridHelper) return;
        if (child instanceof THREE.AxesHelper) return;
        box.expandByObject(child);
        hasObjects = true;
        if (child.userData.isModelMesh || child.geometry.type !== 'PlaneGeometry') {
          buildingMeshes.push(child);
        }
      });
      if (!hasObjects) {
        box.min.set(-1000, -1000, 0);
        box.max.set(1000, 1000, 0);
      }

      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const baseZ = box.min.z;
      const groundW = Math.max(size.x, 1) * 5;
      const groundH = Math.max(size.y, 1) * 5;

      clearSunAnalysis(true);

      const groundMaxDim = Math.max(groundW, groundH);
      const targetCellSize = groundMaxDim / 60;
      const segmentsX = Math.max(1, Math.round(groundW / targetCellSize));
      const segmentsY = Math.max(1, Math.round(groundH / targetCellSize));

      const groundGeometry = new THREE.PlaneGeometry(groundW, groundH, segmentsX, segmentsY);
      const vertexCount = groundGeometry.attributes.position.count;
      const sunScore = new Float32Array(vertexCount);
      groundGeometry.setAttribute('sunScore', new THREE.BufferAttribute(sunScore, 1));

      const sunMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
        extensions: {
            derivatives: true
        },
        uniforms: {
          uOpacity: { value: 0.78 },
          uTextMap: { value: null },
          uHasText: { value: 0.0 },
          uGradientMap: { value: generateGradientTexture(selectedGradient) },
          uAccumMap: { value: null },
          uTotalSamples: { value: 1.0 },
          uGridSegments: { value: new THREE.Vector2(segmentsX, segmentsY) }
        },
        vertexShader: `
          attribute float sunScore;
          varying float vScore;
          varying vec2 vUv;
          void main() {
            vScore = sunScore;
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying float vScore;
          varying vec2 vUv;
          uniform float uOpacity;
          uniform sampler2D uTextMap;
          uniform float uHasText;
          uniform sampler2D uGradientMap;
          uniform sampler2D uAccumMap;
          uniform float uTotalSamples;
          uniform vec2 uGridSegments;

          void main() {
            float score = 0.0;
            if (uTotalSamples > 0.0) {
                 vec4 accum = texture2D(uAccumMap, vUv);
                 float hits = accum.r * 255.0;
                 score = hits / uTotalSamples;
            } else {
                 score = vScore;
            }

            vec3 color = texture2D(uGradientMap, vec2(score, 0.5)).rgb;

            vec4 baseColor = vec4(color, uOpacity);

            if (uHasText > 0.5) {
                vec4 texColor = texture2D(uTextMap, vUv);
                vec3 finalRgb = mix(baseColor.rgb, vec3(0.0), texColor.a);
                float finalAlpha = max(baseColor.a, texColor.a);
                gl_FragColor = vec4(finalRgb, finalAlpha);
            } else {
                gl_FragColor = baseColor;
            }
          }
        `
      });

      const groundMesh = new THREE.Mesh(groundGeometry, sunMaterial);
      groundMesh.name = 'GroundAcceptShadow';
      groundMesh.position.set(center.x, center.y, baseZ);
      groundMesh.updateMatrixWorld(true);
      groundMesh.receiveShadow = true;
      groundMesh.renderOrder = 0; // 地表之上，建筑之下

      const buildingDisplayMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1.0,
        polygonOffsetUnits: -1.0,
        uniforms: {
          uOpacity: { value: 0.78 }
        },
        vertexShader: `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uOpacity;
          void main() {
            gl_FragColor = vec4(0.8, 0.8, 0.8, uOpacity);
          }
        `
      });

      const groundCorners = [
        new THREE.Vector3(center.x - groundW / 2, center.y - groundH / 2, baseZ),
        new THREE.Vector3(center.x + groundW / 2, center.y - groundH / 2, baseZ),
        new THREE.Vector3(center.x - groundW / 2, center.y + groundH / 2, baseZ),
        new THREE.Vector3(center.x + groundW / 2, center.y + groundH / 2, baseZ)
      ];

      const group = new THREE.Group();
      group.name = 'GroupAcceptShadow';
      group.renderOrder = 1;
      group.add(groundMesh);
      buildingMeshes.forEach(mesh => {
        const clonedMesh = mesh.clone();
        clonedMesh.name = 'BuildingAnalysisMesh';
        clonedMesh.material = buildingDisplayMaterial;
        clonedMesh.position.copy(mesh.position);
        clonedMesh.rotation.copy(mesh.rotation);
        clonedMesh.scale.copy(mesh.scale);
        clonedMesh.updateMatrixWorld(true);
        clonedMesh.renderOrder = 1; // 确保分析结果在建筑之后，建筑在最前
        group.add(clonedMesh);
      });
      scene.add(group);
      createdGroup = group;
      sunAnalysisGroupRef.current = group;

      const precisionMap: Record<string, { rtSize: number; accumSize: number }> = {
        low: { rtSize: 512, accumSize: 512 },
        medium: { rtSize: 1024, accumSize: 1024 },
        high: { rtSize: 2048, accumSize: 2048 }
      };
      const { rtSize, accumSize } = precisionMap[analysisPrecision] || precisionMap['medium'];
      
      depthTarget = new THREE.WebGLRenderTarget(rtSize, rtSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: true,
        stencilBuffer: false
      });
      depthTarget.texture.generateMipmaps = false;

      depthMaterial = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking
      });
      depthMaterial.blending = THREE.NoBlending;
      depthMaterial.side = THREE.DoubleSide;

      accumTarget = new THREE.WebGLRenderTarget(accumSize, accumSize, {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false
      });

      analysisMaterial = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          shadowMap: { value: null },
          sunViewMatrix: { value: new THREE.Matrix4() },
          sunProjMatrix: { value: new THREE.Matrix4() },
          uGroundRect: { value: new THREE.Vector4(center.x - groundW / 2, center.y - groundH / 2, groundW, groundH) },
          uGroundZ: { value: baseZ }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D shadowMap;
          uniform mat4 sunViewMatrix;
          uniform mat4 sunProjMatrix;
          uniform vec4 uGroundRect;
          uniform float uGroundZ;
          varying vec2 vUv;

          #include <packing>

          void main() {
            vec3 worldPos = vec3(
                uGroundRect.x + vUv.x * uGroundRect.z,
                uGroundRect.y + vUv.y * uGroundRect.w,
                uGroundZ
            );

            vec4 shadowPos = sunProjMatrix * sunViewMatrix * vec4(worldPos, 1.0);
            vec3 shadowCoords = shadowPos.xyz / shadowPos.w;
            shadowCoords = shadowCoords * 0.5 + 0.5;

            if (shadowCoords.x >= 0.0 && shadowCoords.x <= 1.0 &&
                shadowCoords.y >= 0.0 && shadowCoords.y <= 1.0 &&
                shadowCoords.z >= 0.0 && shadowCoords.z <= 1.0) {

                float depth = unpackRGBAToDepth(texture2D(shadowMap, shadowCoords.xy));
                float currentDepth = shadowCoords.z;

                if (currentDepth <= depth + 0.0001) {
                    gl_FragColor = vec4(1.0/255.0, 0.0, 0.0, 1.0);
                } else {
                    gl_FragColor = vec4(0.0);
                }
            } else {
                gl_FragColor = vec4(1.0/255.0, 0.0, 0.0, 1.0);
            }
          }
        `
      });

      const casterCorners: THREE.Vector3[] = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z)
      ];

      const allCorners: THREE.Vector3[] = [
        ...casterCorners,
        ...groundCorners
      ];

      const sunCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10000);
      const upZ = new THREE.Vector3(0, 0, 1);
      const upY = new THREE.Vector3(0, 1, 0);
      const maxDim = Math.max(size.x, size.y, size.z, 1);
      const distance = Math.max(1000, maxDim * 3);
      const margin = Math.max(10, maxDim * 0.2);

      const temp = new THREE.Vector3();

      const { year: nowYear, month: nowMonth, day: nowDay } = getNowParts(settings.timeZone);
      const year = nowYear;
      const month = settings.month ?? nowMonth;
      const day = settings.day ?? nowDay;

      let totalSamples = 0;
      const hideNames = new Set([
        'Ground',
        'GroupAcceptShadow',
        'GroundAcceptShadow',
        'BuildingAnalysisMesh',
        'selection-box',
        'HighlightLine',
        'HighlightPoint',
        'Measurements',
        'MeasurementGroup',
        'MeasurementPoint',
        'MeasurementLine',
        'MeasurementTempLine',
        'MeasurementTemp'
      ]);
      const depthIgnore: THREE.Object3D[] = [];
      scene.traverse(obj => {
        if (hideNames.has(obj.name)) depthIgnore.push(obj);
      });
      const prevIgnoreVisibility = new Array<boolean>(depthIgnore.length);

      renderer.setRenderTarget(accumTarget);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear();
      renderer.setRenderTarget(null);

      const dummyCam = new THREE.Camera();

      stopSignalRef.current = false;

      for (let h = 0; h < 24; h += sunAnalysisInterval / 60) {
        if (stopSignalRef.current) break;

        if (sunAnalysisRunIdRef.current !== runId) {
          canceled = true;
          break;
        }

        const hour = Math.floor(h);
        const minute = Math.round((h - hour) * 60);
        const date = settings.timeZone
          ? zonedTimeToUtc({ year, month, day, hour, minute }, settings.timeZone)
          : new Date(year, month - 1, day, hour, minute, 0, 0);

        const sunPos = SunCalc.getPosition(date, settings.latitude, settings.longitude);
        if (sunPos.altitude <= 0) continue;

        const phi = sunPos.altitude;
        const theta = sunPos.azimuth;
        const sunDir = new THREE.Vector3(
          Math.cos(phi) * -Math.sin(theta),
          Math.cos(phi) * -Math.cos(theta),
          Math.sin(phi)
        ).normalize();

        const lightPos = center.clone().addScaledVector(sunDir, distance);
        sunCam.position.copy(lightPos);
        sunCam.up.copy(Math.abs(sunDir.dot(upZ)) > 0.95 ? upY : upZ);
        sunCam.lookAt(center);
        sunCam.updateMatrixWorld(true);
        sunCam.matrixWorldInverse.copy(sunCam.matrixWorld).invert();

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        for (const c0 of casterCorners) {
          temp.copy(c0).applyMatrix4(sunCam.matrixWorldInverse);
          minX = Math.min(minX, temp.x);
          maxX = Math.max(maxX, temp.x);
          minY = Math.min(minY, temp.y);
          maxY = Math.max(maxY, temp.y);
        }

        for (const c0 of allCorners) {
            temp.copy(c0).applyMatrix4(sunCam.matrixWorldInverse);
            minZ = Math.min(minZ, temp.z);
            maxZ = Math.max(maxZ, temp.z);
        }

        sunCam.left = minX - margin;
        sunCam.right = maxX + margin;
        sunCam.bottom = minY - margin;
        sunCam.top = maxY + margin;
        sunCam.near = Math.max(0.1, -maxZ - margin);
        sunCam.far = Math.max(sunCam.near + 1, -minZ + margin);
        sunCam.updateProjectionMatrix();

        const prevTarget = renderer.getRenderTarget();
        const prevOverride = scene.overrideMaterial;
        const prevAutoClear = renderer.autoClear;

        for (let i = 0; i < depthIgnore.length; i += 1) {
          prevIgnoreVisibility[i] = depthIgnore[i].visible;
          depthIgnore[i].visible = false;
        }
        scene.overrideMaterial = depthMaterial;
        renderer.setRenderTarget(depthTarget);
        renderer.setClearColor(0xffffff, 1.0);
        renderer.clear();
        renderer.render(scene, sunCam);

        renderer.setRenderTarget(prevTarget);
        scene.overrideMaterial = prevOverride;
        for (let i = 0; i < depthIgnore.length; i += 1) depthIgnore[i].visible = prevIgnoreVisibility[i];

        analysisMaterial.uniforms.shadowMap.value = depthTarget.texture;
        analysisMaterial.uniforms.sunViewMatrix.value = sunCam.matrixWorldInverse;
        analysisMaterial.uniforms.sunProjMatrix.value = sunCam.projectionMatrix;

        renderer.setRenderTarget(accumTarget);
        renderer.autoClear = false;

        groundMesh.material = analysisMaterial;
        const prevFrustumCulled = groundMesh.frustumCulled;
        groundMesh.frustumCulled = false;

        renderer.render(groundMesh, dummyCam);

        renderer.autoClear = prevAutoClear;
        groundMesh.frustumCulled = prevFrustumCulled;
        groundMesh.material = sunMaterial;
        
        renderer.setRenderTarget(prevTarget);

        totalSamples += 1;

        sunMaterial.uniforms.uAccumMap.value = accumTarget.texture;
        sunMaterial.uniforms.uTotalSamples.value = totalSamples;
        setMaxSunHours(totalSamples * (sunAnalysisInterval / 60));

        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      if (sunAnalysisRunIdRef.current !== runId) canceled = true;

      if (!canceled && totalSamples > 0) {
        const pixels = new Uint8Array(accumSize * accumSize * 4);
        renderer.readRenderTargetPixels(accumTarget, 0, 0, accumSize, accumSize, pixels);

        const uvAttr = groundGeometry.attributes.uv;
        for (let i = 0; i < vertexCount; i += 1) {
            const u = uvAttr.getX(i);
            const v = uvAttr.getY(i);

            const px = Math.min(accumSize - 1, Math.max(0, Math.floor(u * (accumSize - 1))));
            const py = Math.min(accumSize - 1, Math.max(0, Math.floor(v * (accumSize - 1))));
            const idx = (py * accumSize + px) * 4;

            const hits = pixels[idx];
            sunScore[i] = hits / totalSamples;
        }

      }
      if (!canceled) {
        (groundGeometry.attributes.sunScore as THREE.BufferAttribute).needsUpdate = true;
      }
    } finally {
      if (depthMaterial) depthMaterial.dispose();
      if (depthTarget) depthTarget.dispose();

      if (sunAnalysisRunIdRef.current === runId && !canceled && accumTarget) {
         sunAnalysisTextureRef.current = accumTarget.texture;
         (accumTarget.texture as any)._renderTarget = accumTarget;
      } else {
         if (accumTarget) accumTarget.dispose();
      }

      if (analysisMaterial) analysisMaterial.dispose();
      if (sunAnalysisRunIdRef.current !== runId && createdGroup && sceneRef.current) {
        sceneRef.current.remove(createdGroup);
        createdGroup.traverse(obj => {
          const anyObj: any = obj as any;
          if (anyObj.material) {
            const mat = anyObj.material;
            if (Array.isArray(mat)) mat.forEach((m: any) => m.dispose?.());
            else mat.dispose?.();
          }
          if (anyObj.geometry) {
            anyObj.geometry.dispose?.();
          }
        });
      }
      if (sunAnalysisRunIdRef.current === runId) {
        setIsSunAnalysisRunning(false);
      }
    }
  };

  const toggleSunAnalysis = () => {
    const next = !isSunAnalysisEnabled;
    setIsSunAnalysisEnabled(next);
    if (next) {
      let hasGeometry = false;
      if (sceneRef.current) {
        sceneRef.current.traverse(child => {
          if (child instanceof THREE.Mesh && child.name !== 'Ground' && child.name !== 'selection-box' && child.name !== 'HighlightLine' && child.name !== 'HighlightPoint' && child.name !== 'GroupAcceptShadow' && child.name !== 'GroundAcceptShadow' && !(child instanceof THREE.GridHelper) && !(child instanceof THREE.AxesHelper)) {
            hasGeometry = true;
          }
        });
      }
      if (!hasGeometry) {
        setIsSunAnalysisEnabled(false);
        return false; // Indicating no geometry to the caller
      }
      sunAnalysisRunIdRef.current += 1;
      stopSignalRef.current = false;
      clearSunAnalysis(true);
      void runSunAnalysis();
      return true;
    } else {
      sunAnalysisRunIdRef.current += 1;
      setIsSunAnalysisRunning(false);
      if (isSunAnalysisRunning) clearSunAnalysis(false);
      else clearSunAnalysis(true);
      return true;
    }
  };

  useEffect(() => {
    if (isSunAnalysisEnabled && !isSunAnalysisRunning) {
      sunAnalysisRunIdRef.current += 1;
      stopSignalRef.current = false;
      clearSunAnalysis(true);
      void runSunAnalysis();
    }
  }, [
    settings.month,
    settings.day,
    settings.latitude,
    settings.longitude,
    settings.timeZone,
    isSunAnalysisEnabled
  ]);

  useEffect(() => {
    if (!settings.shadows) {
      if (isSunAnalysisRunning) {
        stopSignalRef.current = true;
      }
      setIsSunAnalysisEnabled(false);
      clearSunAnalysis(true);
    }
  }, [settings.shadows]);

  useEffect(() => {
    if (!settings.shadows && isSunAnalysisEnabled && isSunAnalysisRunning) {
      stopSignalRef.current = true;
    }
  }, [settings.shadows, isSunAnalysisEnabled, isSunAnalysisRunning]);

  useEffect(() => {
    if (sunAnalysisGroupRef.current) {
      const group = sunAnalysisGroupRef.current;
      const ground = group.getObjectByName('GroundAcceptShadow') as THREE.Mesh;
      if (ground && ground.material) {
        const mat = ground.material as THREE.ShaderMaterial;
        if (mat.uniforms && mat.uniforms.uGradientMap) {
           const oldTex = mat.uniforms.uGradientMap.value;
           mat.uniforms.uGradientMap.value = generateGradientTexture(selectedGradient);
           if (oldTex) oldTex.dispose();
        }
      }
      group.traverse(child => {
        if (child.name === 'BuildingAnalysisMesh' && child instanceof THREE.Mesh) {
          if (child.material) {
            const mat = child.material as THREE.ShaderMaterial;
            if (mat.uniforms && mat.uniforms.uOpacity) {
               mat.uniforms.uOpacity.value = 0.78;
            }
          }
        }
      });
    }
  }, [selectedGradient]);

  return {
    isSunAnalysisEnabled,
    isSunAnalysisRunning,
    maxSunHours,
    toggleSunAnalysis,
    setIsSunAnalysisEnabled,
    clearSunAnalysis,
    sunAnalysisRunIdRef
  };
}
