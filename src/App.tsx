import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import SunCalc from 'suncalc';

import { Text, Slider, Switch, Button, ColorPicker, ColorSlider, ColorArea, Popover, PopoverTrigger, PopoverSurface, Accordion, AccordionHeader, AccordionItem, AccordionPanel, Combobox, Dropdown, Option, makeStyles, useId } from '@fluentui/react-components';

import tzLookupRaw from 'tz-lookup/tz.js?raw';

import layerIcon from './icon/layer.svg';
import eyeIcon from './icon/eye.svg';
import hideIcon from './icon/hide.svg';
import lockIcon from './icon/lock.svg';
import unlockIcon from './icon/unlock.svg';
import angleIcon from './icon/angle.svg';
import solidAngleIcon from './icon/SolidAngle.svg';

import { useSettings } from './hooks/useSettings';
import { useThreeScene } from './hooks/useThreeScene';
import { useLights } from './hooks/useLights';
import { useControls } from './hooks/useControls';
import { useSelection } from './hooks/useSelection';
import { useMeasurement } from './hooks/useMeasurement';
import { useRhinoLoader } from './hooks/useRhinoLoader';
import { useClipping } from './hooks/useClipping';
import { gradients, getGradientCss } from './utils/gradients';

import ViewCube from './components/ViewCube';
import { Toolbar } from './components/UI/Toolbar';
import { Loader } from './components/UI/Loader';
import './index.css';

// Set Z-Up as requested
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const ShadowsDateTimeFields = lazy(() => import('./components/Settings/ShadowsDateTimeFields'));

type Hsv = {
  h: number;
  s: number;
  v: number;
  a?: number;
};

type City = {
  name: string;
  lat: number;
  lng: number;
};

const useStyles = makeStyles({
  cityListbox: {
    height: '240px',
    maxHeight: '240px',
    overflowY: 'auto',
  },
  gradientDropdown: {
    backgroundSize: 'calc(100% - 28px) 100%',
    '& > :first-child': {
      padding: '0 4px',
    },
  },
});

type TzLookupFn = (lat: number, lng: number) => string;

let cachedTzLookup: TzLookupFn | null = null;
function getTzLookup(): TzLookupFn {
  if (cachedTzLookup) return cachedTzLookup;
  const fn = new Function(`${tzLookupRaw}; return tzlookup;`)() as unknown;
  if (typeof fn !== 'function') {
    throw new Error('tz-lookup init failed');
  }
  cachedTzLookup = fn as TzLookupFn;
  return cachedTzLookup;
}

function safeLookupTimeZone(lat: number, lng: number): string | undefined {
  try {
    return getTzLookup()(lat, lng);
  } catch {
    return undefined;
  }
}

function getNowParts(timeZone?: string) {
  const now = new Date();
  if (!timeZone) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  if ([year, month, day].some(n => Number.isNaN(n))) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }
  return { year, month, day };
}

function getTimeZoneOffsetMinutes(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUTC - date.getTime()) / 60000;
}

function zonedTimeToUtc(
  {
    year,
    month,
    day,
    hour,
    minute
  }: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string
) {
  const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  let offset = getTimeZoneOffsetMinutes(timeZone, guessUTC);
  let adjusted = new Date(guessUTC.getTime() - offset * 60000);
  const offset2 = getTimeZoneOffsetMinutes(timeZone, adjusted);
  if (offset2 !== offset) {
    adjusted = new Date(guessUTC.getTime() - offset2 * 60000);
  }
  return adjusted;
}

function hexToHsv(hex: string): Hsv {
  let normalized = hex.trim();
  if (normalized.startsWith('#')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  if (normalized.length !== 6) {
    return { h: 0, s: 0, v: 1, a: 1 };
  }
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v, a: 1 };
}

function hsvToHex(color: Hsv): string {
  let h = color.h;
  const s = color.s;
  const v = color.v;
  if (Number.isNaN(h) || Number.isNaN(s) || Number.isNaN(v)) {
    return '#ffffff';
  }
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (h < 180) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function LayerNode({ layer, depth, onToggleVisibility, onToggleLock }: any) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = layer.children && layer.children.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '0 0 0 4px',
          paddingLeft: depth === 0 ? 4 : 16 + depth * 16
        }}
      >
        <div
          onClick={(e) => {
             e.stopPropagation();
             if (hasChildren) setIsExpanded(!isExpanded);
          }}
          style={{
            width: hasChildren ? 14 : 0,
            height: hasChildren ? 14 : 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: hasChildren ? 'pointer' : 'default'
          }}
        >
          {hasChildren && (
            <img 
              src={angleIcon} 
              style={{ 
                width: 14, 
                height: 14,
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                transition: 'transform 0.1s ease-in-out'
              }} 
              alt={isExpanded ? "Collapse" : "Expand"} 
            />
          )}
        </div>

        <img src={layerIcon} style={{ width: 14, height: 14 }} alt="Layer" />
        <Text size={200} style={{ marginLeft: 4, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {layer.name}
        </Text>
        
        <Button
          appearance="transparent"
          icon={<img src={layer.isVisible ? eyeIcon : hideIcon} style={{ width: 14, height: 14 }} alt={layer.isVisible ? "Visible" : "Hidden"} />}
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(layer.id, !layer.isVisible);
          }}
          title={layer.isVisible ? 'Hide Layer' : 'Show Layer'}
          size="small"
          style={{ minWidth: 24, padding: 0 }}
        />
        <Button
          appearance="transparent"
          icon={<img src={layer.locked ? lockIcon : unlockIcon} style={{ width: 14, height: 14 }} alt={layer.locked ? "Locked" : "Unlocked"} />}
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock(layer.id, !layer.locked);
          }}
          title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
          size="small"
          style={{ minWidth: 24, padding: 0 }}
        />
      </div>
      {hasChildren && isExpanded && (
        <LayerTree layers={layer.children} depth={depth + 1} onToggleVisibility={onToggleVisibility} onToggleLock={onToggleLock} />
      )}
    </div>
  );
}

function LayerTree({ layers, depth = 0, onToggleVisibility, onToggleLock }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {layers.map((layer: any) => (
        <LayerNode
          key={layer.id || layer.index}
          layer={layer}
          depth={depth}
          onToggleVisibility={onToggleVisibility}
          onToggleLock={onToggleLock}
        />
      ))}
    </div>
  );
}

function SunAnalysisLegend({ maxHours, gradientName, visible }: { maxHours: number; gradientName: string; visible: boolean }) {
  if (!visible) return null;
  const stops = gradients[gradientName] || gradients['turbo'];
  const gradientCss = `linear-gradient(to top, ${stops.map((s: any) => `${s.color} ${s.offset * 100}%`).join(', ')})`;
  
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      right: 10,
      display: 'flex',
      flexDirection: 'row',
      gap: 4,
      pointerEvents: 'none',
      userSelect: 'none',
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 150, textAlign: 'right', color: '#000', fontSize: '12px', lineHeight: 1 }}>
        <span>{maxHours.toFixed(1)} h</span>
        <span>{(maxHours * 0.75).toFixed(1)} h</span>
        <span>{(maxHours * 0.5).toFixed(1)} h</span>
        <span>{(maxHours * 0.25).toFixed(1)} h</span>
        <span>0.0 h</span>
      </div>
      <div style={{ width: 24, height: 150, background: gradientCss }} />
    </div>
  );
}

function App() {
  const styles = useStyles();
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true);
  const settingsPanelWidth = 364;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSunAnalysisRunning, setIsSunAnalysisRunning] = useState(false);
  const [maxSunHours, setMaxSunHours] = useState(0);
  const [isSunAnalysisEnabled, setIsSunAnalysisEnabled] = useState(false);
  const sunAnalysisGroupRef = useRef<THREE.Group | null>(null);
  const sunAnalysisTextureRef = useRef<THREE.Texture | null>(null);
  const sunAnalysisRunIdRef = useRef(0);
  const stopSignalRef = useRef(false);
  const [selectedGradient, setSelectedGradient] = useState('turbo');

  const generateGradientTexture = (name: string) => {
    const stops = gradients[name] || gradients['turbo'];
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 256, 0);
      stops.forEach(stop => {
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

  // 1. Settings
  const { settings, updateSettings, configLoaded } = useSettings();
  const displayMode = settings.displayMode || 'shadeWithEdge';

  useEffect(() => {
    const tz = safeLookupTimeZone(settings.latitude, settings.longitude);
    if (!tz) return;
    if (settings.timeZone === tz) return;
    updateSettings({ timeZone: tz });
  }, [settings.latitude, settings.longitude, settings.timeZone, updateSettings]);

  const [cities, setCities] = useState<City[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [selectedCityValue, setSelectedCityValue] = useState<string | undefined>(undefined);
  const [selectedCityText, setSelectedCityText] = useState<string>('');
  const cityComboboxLabelId = useId('city-combobox-label');
  const selectedCityTooltip = (() => {
    if (!selectedCityValue) return undefined;
    const parts = selectedCityValue.split('@@');
    if (parts.length !== 3) return undefined;
    const lat = Number(parts[1]);
    const lng = Number(parts[2]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined;
    return `经度:${lng}，纬度：${lat}`;
  })();

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
      // Check if there is an associated render target to dispose
      if ((tex as any)._renderTarget) {
          ((tex as any)._renderTarget as THREE.WebGLRenderTarget).dispose();
      }
      tex.dispose();
      sunAnalysisTextureRef.current = null;
    }
    sunAnalysisGroupRef.current = null;
  };

  const runSunAnalysis = async () => {
    if (!sceneRef.current) return;
    if (!rendererRef.current) return;
    // Don't block if already running, we will check runId
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

      const gridSegments = 50;
      const groundGeometry = new THREE.PlaneGeometry(groundW, groundH, gridSegments, gridSegments);
      const vertexCount = groundGeometry.attributes.position.count;
      const sunScore = new Float32Array(vertexCount);
      groundGeometry.setAttribute('sunScore', new THREE.BufferAttribute(sunScore, 1));

      const sunMaterial = new THREE.ShaderMaterial({
        transparent: true,
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
          uGridSegments: { value: gridSegments }
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
          uniform float uGridSegments;
          
          void main() {
            float score = 0.0;
            // Use high-res accumulation texture if available
            if (uTotalSamples > 0.0) {
                 vec4 accum = texture2D(uAccumMap, vUv);
                 // Red channel is 0..1 representing 0..255 hits
                 float hits = accum.r * 255.0;
                 score = hits / uTotalSamples;
            } else {
                 score = vScore; // Fallback
            }

            vec3 color = texture2D(uGradientMap, vec2(score, 0.5)).rgb;
            
            // Grid Lines
            // Use fwidth for constant pixel width line
            vec2 grid = abs(fract(vUv * uGridSegments - 0.5) - 0.5) / fwidth(vUv * uGridSegments);
            float line = min(grid.x, grid.y);
            float gridAlpha = 1.0 - min(line, 1.0);
            
            // Mix grid color (black, 20% opacity)
            color = mix(color, vec3(0.0), gridAlpha * 0.2);

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
      groundMesh.updateMatrixWorld(true); // Ensure matrix is up to date
      groundMesh.receiveShadow = true;

      const groundCorners = [
        new THREE.Vector3(center.x - groundW / 2, center.y - groundH / 2, baseZ),
        new THREE.Vector3(center.x + groundW / 2, center.y - groundH / 2, baseZ),
        new THREE.Vector3(center.x - groundW / 2, center.y + groundH / 2, baseZ),
        new THREE.Vector3(center.x + groundW / 2, center.y + groundH / 2, baseZ)
      ];

      const group = new THREE.Group();
      group.name = 'GroupAcceptShadow';
      group.add(groundMesh);
      scene.add(group);
      createdGroup = group;
      sunAnalysisGroupRef.current = group;

      const rtSize = 2048;
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

      // GPU Accumulation Setup
      const accumSize = 1024; // Increased resolution for better sampling
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
            // Map UV to NDC (-1 to 1) to cover the render target
            gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D shadowMap;
          uniform mat4 sunViewMatrix;
          uniform mat4 sunProjMatrix;
          uniform vec4 uGroundRect; // x, y, width, height
          uniform float uGroundZ;
          varying vec2 vUv;

          #include <packing>

          void main() {
            // Reconstruct World Position from UV
            vec3 worldPos = vec3(
                uGroundRect.x + vUv.x * uGroundRect.z,
                uGroundRect.y + vUv.y * uGroundRect.w,
                uGroundZ
            );

            vec4 shadowPos = sunProjMatrix * sunViewMatrix * vec4(worldPos, 1.0);
            vec3 shadowCoords = shadowPos.xyz / shadowPos.w;
            shadowCoords = shadowCoords * 0.5 + 0.5;

            // Check if point is inside the shadow camera frustum
            if (shadowCoords.x >= 0.0 && shadowCoords.x <= 1.0 &&
                shadowCoords.y >= 0.0 && shadowCoords.y <= 1.0 &&
                shadowCoords.z >= 0.0 && shadowCoords.z <= 1.0) {
                
                float depth = unpackRGBAToDepth(texture2D(shadowMap, shadowCoords.xy));
                float currentDepth = shadowCoords.z;
                
                // Bias to prevent acne
                if (currentDepth <= depth + 0.0001) {
                    // Lit: Accumulate 1 unit (1/255)
                    gl_FragColor = vec4(1.0/255.0, 0.0, 0.0, 1.0);
                } else {
                    // Shadowed
                    gl_FragColor = vec4(0.0);
                }
            } else {
                // Outside light frustum -> Lit
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
        'selection-box',
        'HighlightLine',
        'HighlightPoint',
        'Measurements',
        'MeasurementGroup',
        'MeasurementPoint',
        'MeasurementLine',
        'MeasurementTempLine',
        'MeasurementTemp',
        'ClippingPlaneHelper',
        'ClippingCapMesh'
      ]);
      const depthIgnore: THREE.Object3D[] = [];
      scene.traverse(obj => {
        if (hideNames.has(obj.name)) depthIgnore.push(obj);
      });
      const prevIgnoreVisibility = new Array<boolean>(depthIgnore.length);

      // Clear accumulation target
      renderer.setRenderTarget(accumTarget);
      renderer.setClearColor(0x000000, 0.0);
      renderer.clear();
      renderer.setRenderTarget(null);

      // Dummy camera for full-screen pass
      const dummyCam = new THREE.Camera();

      // Reset stop signal
      stopSignalRef.current = false;

      for (let h = 0; h < 24; h += 0.5) {
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
        
        // Fit X/Y to Casters Only (High Resolution for Shadows)
        for (const c0 of casterCorners) {
          temp.copy(c0).applyMatrix4(sunCam.matrixWorldInverse);
          minX = Math.min(minX, temp.x);
          maxX = Math.max(maxX, temp.x);
          minY = Math.min(minY, temp.y);
          maxY = Math.max(maxY, temp.y);
        }
        
        // Fit Z to Everything (Casters + Ground) to capture correct depth range
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

        // 1. Render Shadow Map
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
        
        // Restore scene state
        renderer.setRenderTarget(prevTarget);
        scene.overrideMaterial = prevOverride;
        for (let i = 0; i < depthIgnore.length; i += 1) depthIgnore[i].visible = prevIgnoreVisibility[i];

        // 2. Accumulate
        analysisMaterial.uniforms.shadowMap.value = depthTarget.texture;
        analysisMaterial.uniforms.sunViewMatrix.value = sunCam.matrixWorldInverse;
        analysisMaterial.uniforms.sunProjMatrix.value = sunCam.projectionMatrix;
        
        renderer.setRenderTarget(accumTarget);
        renderer.autoClear = false; // CRITICAL: Prevent clearing accumulation buffer
        
        // Do NOT clear here, we accumulate
        groundMesh.material = analysisMaterial;
        const prevFrustumCulled = groundMesh.frustumCulled;
        groundMesh.frustumCulled = false;
        
        renderer.render(groundMesh, dummyCam);
        
        renderer.autoClear = prevAutoClear; // Restore global state
        groundMesh.frustumCulled = prevFrustumCulled;
        groundMesh.material = sunMaterial; // Restore material
        renderer.setRenderTarget(prevTarget);

        totalSamples += 1;
        
        // Update visualization in real-time
        sunMaterial.uniforms.uAccumMap.value = accumTarget.texture;
        sunMaterial.uniforms.uTotalSamples.value = totalSamples;
        setMaxSunHours(totalSamples * 0.5);

        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }

      if (sunAnalysisRunIdRef.current !== runId) canceled = true;

      if (!canceled && totalSamples > 0) {
        // Read back results once
        const pixels = new Uint8Array(accumSize * accumSize * 4);
        renderer.readRenderTargetPixels(accumTarget, 0, 0, accumSize, accumSize, pixels);

        const uvAttr = groundGeometry.attributes.uv;
        for (let i = 0; i < vertexCount; i += 1) {
            const u = uvAttr.getX(i);
            const v = uvAttr.getY(i);
            
            const px = Math.min(accumSize - 1, Math.max(0, Math.floor(u * (accumSize - 1))));
            const py = Math.min(accumSize - 1, Math.max(0, Math.floor(v * (accumSize - 1))));
            const idx = (py * accumSize + px) * 4;
            
            // Red channel contains the count (1/255 per hit, so value * 255 = hits? No, value IS hits because 1.0/255 maps to 1 in byte)
            const hits = pixels[idx];
            sunScore[i] = hits / totalSamples;
        }

        // Generate Text Texture
        const canvas = document.createElement('canvas');
        canvas.width = 4096;
        canvas.height = 4096;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
             ctx.font = '10px Arial'; 
             ctx.fillStyle = 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const cellW = canvas.width / gridSegments;
            const cellH = canvas.height / gridSegments;
            const rowVertices = gridSegments + 1;

            for (let iy = 0; iy < gridSegments; iy++) {
                for (let ix = 0; ix < gridSegments; ix++) {
                    const i1 = iy * rowVertices + ix;
                    const i2 = iy * rowVertices + (ix + 1);
                    const i3 = (iy + 1) * rowVertices + ix;
                    const i4 = (iy + 1) * rowVertices + (ix + 1);
                    
                    const s1 = sunScore[i1];
                    const s2 = sunScore[i2];
                    const s3 = sunScore[i3];
                    const s4 = sunScore[i4];
                    
                    const avgScore = (s1 + s2 + s3 + s4) / 4;
                    const hours = avgScore * totalSamples * 0.5;
                    const text = hours.toFixed(1);
                    
                    const cx = (ix + 0.5) * cellW;
                    const cy = (iy + 0.5) * cellH;
                    
                    ctx.fillText(text, cx, cy);
                }
            }
            
            const texture = new THREE.CanvasTexture(canvas);
            sunMaterial.uniforms.uTextMap.value = texture;
            sunMaterial.uniforms.uHasText.value = 1.0;
        }
      }
      if (!canceled) {
        (groundGeometry.attributes.sunScore as THREE.BufferAttribute).needsUpdate = true;
      }
    } finally {
      if (depthMaterial) depthMaterial.dispose();
      if (depthTarget) depthTarget.dispose();
      
      if (sunAnalysisRunIdRef.current === runId && !canceled && accumTarget) {
         // Keep accumTarget for display
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
        setIsSunAnalysisEnabled(false);
      }
    }
  };

  useEffect(() => {
    if (isSunAnalysisEnabled && !isSunAnalysisRunning) {
      sunAnalysisRunIdRef.current += 1;
      stopSignalRef.current = false;
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
    if (!settings.shadows && isSunAnalysisRunning) {
      stopSignalRef.current = true;
      setIsSunAnalysisEnabled(false);
    }
  }, [settings.shadows, isSunAnalysisRunning]);

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
    }
  }, [selectedGradient]);

  useEffect(() => {
    if (!settings.shadows && isSunAnalysisEnabled && isSunAnalysisRunning) {
      stopSignalRef.current = true;
    }
  }, [settings.shadows, isSunAnalysisEnabled, isSunAnalysisRunning]);

  useEffect(() => {
    let isMounted = true;
    const loadCities = async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}city.json`);
        if (!res.ok) return;
        const raw = (await res.json()) as unknown;
        if (!Array.isArray(raw)) return;
        const parsed: City[] = [];
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue;
          const maybe = item as Record<string, unknown>;
          const name = typeof maybe.name === 'string' ? maybe.name : undefined;
          const lat = typeof maybe.lat === 'number' ? maybe.lat : undefined;
          const lng = typeof maybe.lng === 'number' ? maybe.lng : undefined;
          if (!name || lat === undefined || lng === undefined) continue;
          parsed.push({ name, lat, lng });
        }
        if (!isMounted) return;
        setCities(parsed);
        if (!selectedCityValue && cityQuery.trim() === '') {
          const matched = parsed.find(c => Math.abs(c.lat - settings.latitude) < 1e-4 && Math.abs(c.lng - settings.longitude) < 1e-4);
          if (matched) {
            setSelectedCityValue(`${matched.name}@@${matched.lat}@@${matched.lng}`);
            setSelectedCityText(matched.name);
          }
        }
      } catch {
        return;
      }
    };
    void loadCities();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Scene Setup
  const { 
    sceneRef, 
    rendererRef, 
    cameraRef, 
    perspectiveCameraRef, 
    orthographicCameraRef,
    orthoFrustumHeightRef
  } = useThreeScene(containerRef);

  // 3. Lights & Environment
  const { dirLightRef, updateGround, updateShadowFrustum } = useLights(sceneRef, settings);

  // 4. Measurements
  const {
    isMeasureActive,
    measureModeRef,
    enterMeasureMode,
    exitMeasureMode,
    undoMeasurement,
    redoMeasurement,
    clearMeasurements,
    measurementGroupRef,
    highlightPointRef,
    measurementTempMarkerRef
  } = useMeasurement(sceneRef, cameraRef, rendererRef);

  // 5. Selection
  const selectionBoxRef = useRef<any>(null);

  const controlsRef = useControls(
      cameraRef,
      perspectiveCameraRef,
      orthographicCameraRef,
      rendererRef,
      orthoFrustumHeightRef,
      settings.projection,
      selectionBoxRef
  );

  // Clipping
  const { isClippingActive, toggleClipping, updateMaterials: updateClippingMaterials, flipClipping, alignToAxis, clippingPlanes, rebuildStencil } = useClipping(
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef
  );

  const {
      selectionBoxDivRef,
      selectedObjectsRef,
      updateHighlights
  } = useSelection(
      sceneRef, 
      cameraRef, 
      rendererRef, 
      controlsRef,
      orthoFrustumHeightRef,
      selectionBoxRef,
      measureModeRef,
      clippingPlanes
  );



  // 6. Rhino Loader
  const {
      isLoading,
      loadingProgress,
      handleFileChange,
      load3dmFile,
      layers,
      setLayerVisibility,
      setLayerLocked,
      modelUnit
  } = useRhinoLoader(
      sceneRef,
      cameraRef,
      controlsRef,
      orthoFrustumHeightRef,
      dirLightRef,
      updateGround,
      updateHighlights,
      clearMeasurements,
      settings.mergeGeometry,
      settings.loadMultiFile,
      displayMode,
      updateShadowFrustum,
      selectedObjectsRef
  );

  const autoLoadRef = useRef(false);
  useEffect(() => {
      if (settings.files3dm && settings.files3dm.length > 0 && !autoLoadRef.current) {
          settings.files3dm.forEach(url => load3dmFile(url));
          autoLoadRef.current = true;
      }
  }, [settings.files3dm, load3dmFile]);

  useEffect(() => {
    updateClippingMaterials();
    if (isClippingActive) {
        rebuildStencil();
    }
  }, [layers, updateClippingMaterials, rebuildStencil, isClippingActive]);

  // 7. Animation Loop
  useEffect(() => {
      const animate = () => {
          requestAnimationFrame(animate);
          
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
               // Adaptive Scaling Logic
               const currentCamera = cameraRef.current;
               if (measurementGroupRef.current) {
                  let scaleFactor = 1;
                  const targetPos = controlsRef.current?.target || new THREE.Vector3();
                  
                  if (currentCamera instanceof THREE.PerspectiveCamera) {
                      const dist = currentCamera.position.distanceTo(targetPos);
                      scaleFactor = dist * 0.05;
                  } else if (currentCamera instanceof THREE.OrthographicCamera) {
                      scaleFactor = (currentCamera.top - currentCamera.bottom) * 0.05;
                  }
                  
                  if (highlightPointRef.current) {
                     highlightPointRef.current.scale.set(scaleFactor, scaleFactor, scaleFactor);
                  }
                  if (measurementTempMarkerRef.current) {
                      measurementTempMarkerRef.current.scale.set(scaleFactor, scaleFactor, scaleFactor);
                  }
                  
                  measurementGroupRef.current.children.forEach(measurement => {
                      if (measurement instanceof THREE.Group) {
                          measurement.children.forEach(child => {
                              if (child.name === 'MeasurementPoint') {
                                  child.scale.set(scaleFactor, scaleFactor, scaleFactor);
                              } else if (child.name === 'MeasurementLabel') {
                                  if (child instanceof THREE.Sprite && child.material.map && child.material.map.image) {
                                       const img = child.material.map.image;
                                       const aspect = img.width / img.height;
                                       const h = scaleFactor * 0.233;
                                       const w = h * aspect;
                                       child.scale.set(w, h, 1);
                                  }
                              }
                          });
                      }
                  });
               }
               
               rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
      };
      animate();
  }, [rendererRef.current]);

  // 8. Display Mode
  useEffect(() => {
      if (!sceneRef.current) return;
      const normalizedMode = (displayMode === 'wireframe' ? 'edge' : displayMode) || 'shadeWithEdge';
      const makeDisplayMaterial = (base: THREE.Material, mode: string) => {
          const anyBase: any = base as any;
          const color = anyBase?.color?.clone ? anyBase.color.clone() : new THREE.Color(0xffffff);
          const map = anyBase.map || null;
          const opacity = typeof anyBase.opacity === 'number' ? anyBase.opacity : 1;
          const transparent = !!anyBase.transparent;
          const side = typeof anyBase.side === 'number' ? anyBase.side : THREE.FrontSide;
          const depthWrite = typeof anyBase.depthWrite === 'boolean' ? anyBase.depthWrite : true;
          const depthTest = typeof anyBase.depthTest === 'boolean' ? anyBase.depthTest : true;

          if (mode === 'pen') {
              return new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 1, transparent: false, side, depthWrite: true, depthTest: true });
          }
          if (mode === 'edge') {
              const m = new THREE.MeshBasicMaterial({ color, opacity: 1, transparent: false, side, wireframe: true, depthWrite: false, depthTest });
              return m;
          }
          if (mode === 'shade' || mode === 'shadeWithEdge') {
              return new THREE.MeshLambertMaterial({ color, map, opacity, transparent, side, depthWrite, depthTest });
          }
          return base.clone();
      };
      sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
              const currentMaterials = Array.isArray(child.material) ? child.material : [child.material];
              if (!child.userData.baseMaterials) {
                  child.userData.baseMaterials = currentMaterials.map((m: THREE.Material) => m.clone());
              }
              if (!child.userData.displayMaterialCache) {
                  child.userData.displayMaterialCache = {};
              }

              const cache = child.userData.displayMaterialCache as Record<string, THREE.Material[]>;
              if (!cache[normalizedMode]) {
                  const baseMaterials = child.userData.baseMaterials as THREE.Material[];
                  cache[normalizedMode] = baseMaterials.map((m) => makeDisplayMaterial(m, normalizedMode));
              }
              const nextMaterials = cache[normalizedMode];
              child.material = (Array.isArray(child.material) ? nextMaterials : nextMaterials[0]);
          }
          if (child.name === 'SurfaceEdge') {
              child.visible = normalizedMode === 'shadeWithEdge' || normalizedMode === 'pen';
          }
      });
  }, [sceneRef, displayMode]);



  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          height: '100vh',
          position: 'relative',
          background: `linear-gradient(to bottom, ${settings.bgTop}, ${settings.bgBottom})`
        }}
      >
        {isLoading && <Loader progress={loadingProgress} />}

        <ViewCube controlsRef={controlsRef} cameraRef={cameraRef} />

        <Toolbar
          isMeasureActive={isMeasureActive}
          isOrtho={settings.projection === 'orthographic'}
          displayMode={displayMode}
          onMeasureClick={isMeasureActive ? exitMeasureMode : enterMeasureMode}
          onUndo={undoMeasurement}
          onRedo={redoMeasurement}
          onClear={clearMeasurements}
          onToggleProjection={() =>
            updateSettings({
              projection:
                settings.projection === 'orthographic' ? 'perspective' : 'orthographic'
            })
          }
          onChangeDisplayMode={mode => updateSettings({ displayMode: mode })}
          isClippingActive={isClippingActive}
          onToggleClipping={toggleClipping}
          onFlipClipping={flipClipping}
          onAlignToAxis={alignToAxis}
        />

        <div ref={selectionBoxDivRef} className="selection-box"></div>
        <input
          type="file"
          id="file-input"
          accept=".3dm"
          multiple={settings.loadMultiFile}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        
        {modelUnit && (
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                color: '#333',
                zIndex: 100,
                pointerEvents: 'none',
                userSelect: 'none',
                fontFamily: 'sans-serif',
                fontSize: '12px'
            }}>
                模型单位:{modelUnit}
            </div>
        )}
        <SunAnalysisLegend 
            maxHours={maxSunHours} 
            gradientName={selectedGradient} 
            visible={settings.shadows} 
        />
      </div>

      <div
        className="settings-panel-shell"
        data-open={isSettingsPanelOpen ? 'true' : 'false'}
        style={{
          width: isSettingsPanelOpen ? settingsPanelWidth : 0,
          minWidth: isSettingsPanelOpen ? settingsPanelWidth : 0,
          maxWidth: isSettingsPanelOpen ? settingsPanelWidth : 0,
          flexShrink: 0,
          height: '100%',
          position: 'relative',
          overflow: 'visible',
          transition: 'width 0.2s ease'
        }}
      >
        <button
          type="button"
          className="settings-drawer-handle"
          onClick={() => setIsSettingsPanelOpen(prev => !prev)}
          aria-label={isSettingsPanelOpen ? '关闭设置面板' : '打开设置面板'}
          title={isSettingsPanelOpen ? '关闭设置面板' : '打开设置面板'}
        >
          <span className="settings-drawer-icon">{isSettingsPanelOpen ? '›' : '‹'}</span>
        </button>

        <div
          style={{
            width: settingsPanelWidth,
            minWidth: settingsPanelWidth,
            maxWidth: settingsPanelWidth,
            height: '100%',
            boxSizing: 'border-box',
            padding: 6,
            backgroundColor: 'rgb(234, 236, 240)',
            borderLeft: '1px solid #d1d1d1',
            color: '#000000',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflow: 'hidden',
            position: 'absolute',
            top: 0,
            right: 0,
            transform: isSettingsPanelOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.2s ease',
            pointerEvents: isSettingsPanelOpen ? 'auto' : 'none'
          }}
        >


        <Accordion collapsible multiple defaultOpenItems={['display', 'shadows']}>
          <AccordionItem value="display">
            <AccordionHeader expandIcon={<img src={solidAngleIcon} alt="expand" width={10} height={10} className="accordion-expand-icon" style={{ paddingRight: 4 }} />} style={{ minHeight: '24px', height: '24px', maxHeight: '24px', background: 'linear-gradient(180deg, #dedede, #ababab)', borderRadius: '3px' }} button={{ style: { minHeight: '24px', height: '24px', maxHeight: '24px', padding: '0 8px' } }}>
              <Text weight="semibold" size={200}>显示设置</Text>
            </AccordionHeader>
            <AccordionPanel style={{ padding: '4px 0 4px 4px', margin: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    亮度
                  </Text>
                  <div style={{ flex: 1 }}>
                    <Slider
                      size="medium"
                      value={settings.brightness}
                      min={0}
                      max={20}
                      onChange={(_, data) => updateSettings({ brightness: data.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Text size={200} style={{ width: 24, textAlign: 'center' }}>
                    {Math.round(settings.brightness)}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    环境光强度
                  </Text>
                  <div style={{ flex: 1 }}>
                    <Slider
                      size="medium"
                      value={settings.ambientIntensity}
                      min={0}
                      max={3}
                      onChange={(_, data) => updateSettings({ ambientIntensity: data.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Text size={200} style={{ width: 24, textAlign: 'center' }}>
                    {Math.round(settings.ambientIntensity)}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    环境光颜色
                  </Text>
                  <div style={{ marginLeft: 'auto' }}>
                    <Popover>
                      <PopoverTrigger disableButtonEnhancement>
                        <button
                          type="button"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: '1px solid #d0d0d0',
                            padding: 0,
                            margin: 0,
                            backgroundColor: settings.ambientColor,
                            cursor: 'pointer'
                          }}
                        />
                      </PopoverTrigger>
                      <PopoverSurface>
                        <ColorPicker
                          color={hexToHsv(settings.ambientColor)}
                          onColorChange={(_, data) => {
                            updateSettings({ ambientColor: hsvToHex(data.color as Hsv) });
                          }}
                        >
                          <ColorSlider />
                          <ColorArea />
                        </ColorPicker>
                      </PopoverSurface>
                    </Popover>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    顶部颜色
                  </Text>
                  <div style={{ marginLeft: 'auto' }}>
                    <Popover>
                      <PopoverTrigger disableButtonEnhancement>
                        <button
                          type="button"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: '1px solid #d0d0d0',
                            padding: 0,
                            margin: 0,
                            backgroundColor: settings.bgTop,
                            cursor: 'pointer'
                          }}
                        />
                      </PopoverTrigger>
                      <PopoverSurface>
                        <ColorPicker
                          color={hexToHsv(settings.bgTop)}
                          onColorChange={(_, data) => {
                            updateSettings({ bgTop: hsvToHex(data.color as Hsv) });
                          }}
                        >
                          <ColorSlider />
                          <ColorArea />
                        </ColorPicker>
                      </PopoverSurface>
                    </Popover>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    底部颜色
                  </Text>
                  <div style={{ marginLeft: 'auto' }}>
                    <Popover>
                      <PopoverTrigger disableButtonEnhancement>
                        <button
                          type="button"
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: '1px solid #d0d0d0',
                            padding: 0,
                            margin: 0,
                            backgroundColor: settings.bgBottom,
                            cursor: 'pointer'
                          }}
                        />
                      </PopoverTrigger>
                      <PopoverSurface>
                        <ColorPicker
                          color={hexToHsv(settings.bgBottom)}
                          onColorChange={(_, data) => {
                            updateSettings({ bgBottom: hsvToHex(data.color as Hsv) });
                          }}
                        >
                          <ColorSlider />
                          <ColorArea />
                        </ColorPicker>
                      </PopoverSurface>
                    </Popover>
                  </div>
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>

          <AccordionItem value="shadows">
            <AccordionHeader expandIcon={<img src={solidAngleIcon} alt="expand" width={10} height={10} className="accordion-expand-icon" style={{ paddingRight: 4 }} />} style={{ minHeight: '24px', height: '24px', maxHeight: '24px', background: 'linear-gradient(180deg, #dedede, #ababab)', borderRadius: '3px' }} button={{ style: { minHeight: '24px', height: '24px', maxHeight: '24px', padding: '0 8px' } }}>
              <Text weight="semibold" size={200}>阴影设置</Text>
            </AccordionHeader>
            <AccordionPanel style={{ padding: '4px 0 4px 4px', margin: 0 }}>
              <div className="shadows-settings" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    启用阴影
                  </Text>
                  <Switch
                    checked={settings.shadows}
                    onChange={(_, data) => updateSettings({ shadows: data.checked })}
                    style={{ marginLeft: 'auto' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text id={cityComboboxLabelId} size={200} style={{ minWidth: 64 }}>
                    城市
                  </Text>
                  <div className="settings-control" style={{ flex: 1, paddingRight: 4 }}>
                    <Combobox
                      aria-labelledby={cityComboboxLabelId}
                      placeholder="检索城市"
                      disabled={!settings.shadows}
                      positioning="below-start"
                      freeform
                      style={{ width: '100%', boxSizing: 'border-box', height: 28, minHeight: 28, paddingLeft: 0 }}
                      title={selectedCityTooltip}
                      input={{ style: { height: 28, minHeight: 28 }, title: selectedCityTooltip }}
                      listbox={{ className: styles.cityListbox }}
                      value={selectedCityValue ? selectedCityText : cityQuery}
                      selectedOptions={selectedCityValue ? [selectedCityValue] : []}
                      onInput={(e) => {
                        setCityQuery((e.target as HTMLInputElement).value);
                        setSelectedCityValue(undefined);
                        setSelectedCityText('');
                      }}
                      onOptionSelect={(_, data) => {
                        const optionValue = typeof data.optionValue === 'string' ? data.optionValue : undefined;
                        const optionText = typeof data.optionText === 'string' ? data.optionText : undefined;
                        if (!optionValue) return;
                        const parts = optionValue.split('@@');
                        if (parts.length !== 3) return;
                        const lat = Number(parts[1]);
                        const lng = Number(parts[2]);
                        if (Number.isNaN(lat) || Number.isNaN(lng)) return;
                        setSelectedCityValue(optionValue);
                        setSelectedCityText(optionText ?? parts[0]);
                        setCityQuery('');
                        const tz = safeLookupTimeZone(lat, lng);
                        updateSettings({ latitude: lat, longitude: lng, ...(tz ? { timeZone: tz } : {}) });
                      }}
                    >
                      {(cityQuery.trim() === '' ? cities : cities.filter(c => c.name.toLowerCase().includes(cityQuery.trim().toLowerCase())))
                        .slice(0, 100)
                        .map(c => (
                          <Option
                            key={`${c.name}-${c.lat}-${c.lng}`}
                            value={`${c.name}@@${c.lat}@@${c.lng}`}
                            title={`经度:${c.lng}，纬度：${c.lat}`}
                          >
                            {c.name}
                          </Option>
                        ))}
                    </Combobox>
                  </div>
                </div>
                <Suspense fallback={null}>
                  <ShadowsDateTimeFields settings={settings} updateSettings={updateSettings} />
                </Suspense>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    颜色映射
                  </Text>
                  <div className="settings-control" style={{ flex: 1, paddingRight: 4 }}>
                    <Dropdown
                      className={styles.gradientDropdown}
                      disabled={!settings.shadows}
                      selectedOptions={[selectedGradient]}
                      onOptionSelect={(_, data) => {
                        if (data.optionValue) setSelectedGradient(data.optionValue);
                      }}
                      listbox={{ style: { display: 'flex', flexDirection: 'column', gap: '2px' } }}
                      style={{ 
                        width: '100%',
                        height: 28, 
                        minHeight: 28,
                        backgroundImage: getGradientCss(gradients[selectedGradient] || gradients['turbo']),
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'left center',
                        color: 'transparent',
                        filter: !settings.shadows ? 'grayscale(1)' : 'none'
                      }}
                    >
                      {Object.keys(gradients).map((name) => (
                        <Option key={name} value={name} text="">
                          <div style={{ width: '100%', height: 20, background: getGradientCss(gradients[name]) }} />
                        </Option>
                      ))}
                    </Dropdown>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    日照分析
                  </Text>
                  <div className="settings-control" style={{ flex: 1, paddingRight: 4 }}>
                    <Button
                      appearance={isSunAnalysisEnabled ? "primary" : "secondary"}
                      size="small"
                      disabled={!settings.shadows || isSunAnalysisRunning}
                      onClick={() => {
                        const next = !isSunAnalysisEnabled;
                        setIsSunAnalysisEnabled(next);
                        if (next) {
                          sunAnalysisRunIdRef.current += 1;
                          stopSignalRef.current = false;
                          void runSunAnalysis();
                        } else {
                          sunAnalysisRunIdRef.current += 1;
                          setIsSunAnalysisRunning(false);
                          if (isSunAnalysisRunning) clearSunAnalysis(false);
                          else clearSunAnalysis(true);
                        }
                      }}
                      style={{ width: '100%' }}
                    >
                      {isSunAnalysisEnabled ? '停止' : '开始'}
                    </Button>
                  </div>
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>


        </Accordion>

        <div style={{ margin: '6px 0', height: 1, backgroundColor: '#e0e0e0' }} />

        <div className="layers-list" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #d1d1d1', backgroundColor: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', height: 24, backgroundColor: '#f5f5f5', borderBottom: '1px solid #e0e0e0', flexShrink: 0 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', borderRight: '1px solid #e0e0e0' }}>
              <Text size={200}>图层名称</Text>
            </div>
            <div style={{ width: 26, height: '100%', borderRight: '1px solid #e0e0e0', boxSizing: 'border-box' }} />
            <div style={{ width: 26, height: '100%' }} />
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <LayerTree layers={layers} onToggleVisibility={setLayerVisibility} onToggleLock={setLayerLocked} />
            {layers.length === 0 && (
              <Text size={100} style={{ color: 'rgba(0,0,0,0.45)', marginTop: 8, alignSelf: 'center',fontSize:12 }}>
                加载模型以查看图层
              </Text>
            )}
          </div>
        </div>

        {configLoaded && (!settings.files3dm || settings.files3dm.length === 0) && (
            <div style={{ marginTop: 4 }}>
            <Button
                appearance="primary"
                style={{ width: '100%' }}
                onClick={() => document.getElementById('file-input')?.click()}
            >
                打开 .3dm 文件
            </Button>
            </div>
        )}
        </div>
      </div>
    </div>
  );
}

export default App;
