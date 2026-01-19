import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { Text, Slider, Switch, Input, Button, Checkbox, ColorPicker, ColorSlider, ColorArea, Popover, PopoverTrigger, PopoverSurface, Accordion, AccordionHeader, AccordionItem, AccordionPanel } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { TimePicker } from '@fluentui/react-timepicker-compat';

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

import ViewCube from './components/ViewCube';
import { Toolbar } from './components/UI/Toolbar';
import { Loader } from './components/UI/Loader';
import './index.css';

// Set Z-Up as requested
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

type Hsv = {
  h: number;
  s: number;
  v: number;
  a?: number;
};

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
            width: 14,
            height: 14,
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
          icon={<img src={layer.visible ? eyeIcon : hideIcon} style={{ width: 14, height: 14 }} alt={layer.visible ? "Visible" : "Hidden"} />}
          onClick={() => onToggleVisibility(layer.index, !layer.visible)}
          title={layer.visible ? 'Hide Layer' : 'Show Layer'}
          size="small"
          style={{ minWidth: 24, padding: 0 }}
        />
        <Button
          appearance="transparent"
          icon={<img src={layer.locked ? lockIcon : unlockIcon} style={{ width: 14, height: 14 }} alt={layer.locked ? "Locked" : "Unlocked"} />}
          onClick={() => onToggleLock(layer.index, !layer.locked)}
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

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Settings
  const { settings, updateSettings } = useSettings();
  const displayMode = settings.displayMode || 'shadeWithEdge';

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
  const { dirLightRef, updateGround, updateSunPosition } = useLights(sceneRef, settings);

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
      measureModeRef
  );

  // 6. Rhino Loader
  const {
      isLoading,
      loadingProgress,
      handleFileChange,
      layers,
      setLayerVisibility,
      setLayerLocked
  } = useRhinoLoader(
      sceneRef,
      cameraRef,
      controlsRef,
      orthoFrustumHeightRef,
      dirLightRef,
      updateGround,
      updateHighlights,
      clearMeasurements,
      displayMode,
      updateSunPosition,
      selectedObjectsRef
  );

  // Clipping
  const { isClippingActive, toggleClipping, updateMaterials: updateClippingMaterials, flipClipping, alignToAxis } = useClipping(
    sceneRef,
    cameraRef,
    rendererRef,
    controlsRef
  );

  useEffect(() => {
    updateClippingMaterials();
  }, [layers, updateClippingMaterials]);

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
      const mode = displayMode || 'shadeWithEdge';
      sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach((mat: any) => {
                  if (mat && typeof mat === 'object' && 'wireframe' in mat) {
                      mat.wireframe = mode === 'wireframe';
                  }
              });
          }
          if (child.name === 'SurfaceEdge') {
              child.visible = mode !== 'shade';
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
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div
        style={{
          width: 364,
          minWidth: 364,
          maxWidth: 364,
          flexShrink: 0,
          height: '100%',
          boxSizing: 'border-box',
          padding: 6,
          backgroundColor: 'rgb(234, 236, 240)',
          borderLeft: '1px solid #d1d1d1',
          color: '#000000',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflow: 'hidden'
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
                      size="small"
                      value={settings.brightness}
                      min={0}
                      max={20}
                      onChange={(_, data) => updateSettings({ brightness: data.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Text size={200} style={{ width: 18, textAlign: 'right' }}>
                    {Math.round(settings.brightness)}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    环境光强度
                  </Text>
                  <div style={{ flex: 1 }}>
                    <Slider
                      size="small"
                      value={settings.ambientIntensity}
                      min={0}
                      max={3}
                      onChange={(_, data) => updateSettings({ ambientIntensity: data.value })}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <Text size={200} style={{ width: 18, textAlign: 'right' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  <Text size={200} style={{ minWidth: 64 }}>
                    纬度
                  </Text>
                  <div style={{ flex: 1 }}>
                    <Input
                      type="number"
                      size="medium"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="纬度"
                      value={String(settings.latitude)}
                      disabled={!settings.shadows}
                      onChange={(_, data) =>
                        updateSettings({
                          latitude: Math.max(-90, Math.min(90, parseFloat(data.value || '0') || 0))
                        })
                      }
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    经度
                  </Text>
                  <div style={{ flex: 1 }}>
                    <Input
                      type="number"
                      size="medium"
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      placeholder="经度"
                      value={String(settings.longitude)}
                      disabled={!settings.shadows}
                      onChange={(_, data) =>
                        updateSettings({
                          longitude: Math.max(-180, Math.min(180, parseFloat(data.value || '0') || 0))
                        })
                      }
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    日期
                  </Text>
                  <div style={{ flex: 1 }}>
                    <DatePicker
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      disabled={!settings.shadows}
                      value={
                        new Date(
                          new Date().getFullYear(),
                          (settings.month ?? new Date().getMonth() + 1) - 1,
                          settings.day ?? new Date().getDate()
                        )
                      }
                      formatDate={(date) => date ? date.toLocaleDateString('zh-CN') : ''}
                      onSelectDate={date => {
                        if (!date) return;
                        updateSettings({
                          month: date.getMonth() + 1,
                          day: date.getDate()
                        });
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28, paddingLeft: 8 }}>
                  <Text size={200} style={{ minWidth: 64 }}>
                    时间
                  </Text>
                  <div style={{ flex: 1 }}>
                    <TimePicker
                      freeform
                      style={{ width: '100%', boxSizing: 'border-box' }}
                      disabled={!settings.shadows}
                      placeholder="选择时间"
                      selectedTime={(() => {
                        const base = new Date();
                        const currentHour = base.getHours() + base.getMinutes() / 60;
                        const hourValue = settings.hour ?? currentHour;
                        const h = Math.floor(hourValue);
                        const m = Math.round((hourValue - h) * 60);
                        const d = new Date(base);
                        d.setHours(h, m, 0, 0);
                        return d;
                      })()}
                      onTimeChange={(_, data) => {
                        if (!data.selectedTime) return;
                        const hours = data.selectedTime.getHours();
                        const minutes = data.selectedTime.getMinutes();
                        const hourValue = hours + minutes / 60;
                        const clamped = Math.max(0, Math.min(23.99, hourValue));
                        updateSettings({ hour: clamped });
                      }}
                    />
                  </div>
                </div>
              </div>
            </AccordionPanel>
          </AccordionItem>


        </Accordion>

        <div style={{ margin: '6px 0', height: 1, backgroundColor: '#e0e0e0' }} />

        <div className="layers-list" style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', border: '1px solid #d1d1d1', backgroundColor: '#fff' }}>
          <LayerTree layers={layers} onToggleVisibility={setLayerVisibility} onToggleLock={setLayerLocked} />
          {layers.length === 0 && (
            <Text size={100} style={{ color: 'rgba(0,0,0,0.45)', marginTop: 8, alignSelf: 'center' }}>
              加载模型以查看图层
            </Text>
          )}
        </div>

        <div style={{ marginTop: 4 }}>
          <Button
            appearance="primary"
            style={{ width: '100%' }}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            打开 .3dm 文件
          </Button>
        </div>
      </div>
    </div>
  );
}

export default App;
