import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import GUI from 'lil-gui';

import { useSettings } from './hooks/useSettings';
import { useThreeScene } from './hooks/useThreeScene';
import { useLights } from './hooks/useLights';
import { useControls } from './hooks/useControls';
import { useSelection } from './hooks/useSelection';
import { useMeasurement } from './hooks/useMeasurement';
import { useRhinoLoader } from './hooks/useRhinoLoader';

import ViewCube from './components/ViewCube';
import { Toolbar } from './components/UI/Toolbar';
import { Loader } from './components/UI/Loader';
import './index.css';

// Set Z-Up as requested
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);

  // 1. Settings
  const { settings, updateSettings } = useSettings();

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
      zoomToSelection,
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
      handleFileChange
  } = useRhinoLoader(
      sceneRef,
      cameraRef,
      controlsRef,
      orthoFrustumHeightRef,
      dirLightRef,
      guiRef,
      updateGround,
      updateHighlights,
      clearMeasurements,
      settings.showEdges,
      updateSunPosition,
      selectedObjectsRef
  );

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
                                       const h = scaleFactor * 1.2; 
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

  // 8. GUI Initialization
  useEffect(() => {
      if (guiRef.current) guiRef.current.destroy();
      
      const gui = new GUI({ title: 'Settings' });
      guiRef.current = gui;
      
      const guiSettings = {
          brightness: settings.brightness,
          ambientIntensity: settings.ambientIntensity,
          ambientColor: settings.ambientColor,
          shadows: settings.shadows,
          shadowQuality: settings.shadowQuality,
          shadowBias: settings.shadowBias,
          shadowRadius: settings.shadowRadius,
          showEdges: settings.showEdges,
          bgTop: settings.bgTop,
          bgBottom: settings.bgBottom,
          latitude: settings.latitude,
          longitude: settings.longitude,
          month: settings.month || new Date().getMonth() + 1,
          day: settings.day || new Date().getDate(),
          hour: settings.hour || new Date().getHours() + new Date().getMinutes() / 60,
          
          loadFile: () => document.getElementById('file-input')?.click(),
          clearMeasurements: clearMeasurements
      };
      
      gui.add(guiSettings, 'brightness', 0, 20).name('Brightness (Sun)').onChange(v => updateSettings({ brightness: v }));
      
      const folderAmbient = gui.addFolder('Ambient Light');
      folderAmbient.add(guiSettings, 'ambientIntensity', 0, 3).onChange(v => updateSettings({ ambientIntensity: v }));
      folderAmbient.addColor(guiSettings, 'ambientColor').onChange(v => updateSettings({ ambientColor: v }));
      
      const shadowFolder = gui.addFolder('Shadows');
      shadowFolder.add(guiSettings, 'shadows').onChange(v => updateSettings({ shadows: v }));
      shadowFolder.add(guiSettings, 'shadowQuality', 1024, 8192, 1024).onChange(v => updateSettings({ shadowQuality: v }));
      shadowFolder.add(guiSettings, 'shadowBias', -0.01, 0.01, 0.0001).onChange(v => updateSettings({ shadowBias: v }));
      shadowFolder.add(guiSettings, 'shadowRadius', 0, 10, 0.1).onChange(v => updateSettings({ shadowRadius: v }));
      
      gui.add(guiSettings, 'showEdges').name('Show Surface Curves').onChange(v => {
          updateSettings({ showEdges: v });
          if (sceneRef.current) {
              sceneRef.current.traverse((child) => {
                  if (child.name === 'SurfaceEdge') {
                      child.visible = v;
                  }
              });
          }
      });
      
      gui.addColor(guiSettings, 'bgTop').onChange(v => updateSettings({ bgTop: v }));
      gui.addColor(guiSettings, 'bgBottom').onChange(v => updateSettings({ bgBottom: v }));
      
      const folderLocation = gui.addFolder('Location & Time');
      folderLocation.add(guiSettings, 'latitude', -90, 90).onChange(v => updateSettings({ latitude: v }));
      folderLocation.add(guiSettings, 'longitude', -180, 180).onChange(v => updateSettings({ longitude: v }));
      
      const updateDate = () => {
          updateSettings({
              month: guiSettings.month,
              day: guiSettings.day,
              hour: guiSettings.hour
          });
      };
      
      folderLocation.add(guiSettings, 'month', 1, 12, 1).onChange(updateDate);
      folderLocation.add(guiSettings, 'day', 1, 31, 1).onChange(updateDate);
      folderLocation.add(guiSettings, 'hour', 0, 23.99).onChange(updateDate);
      
      gui.add(guiSettings, 'loadFile').name('Open .3dm File');
      
      return () => {
          gui.destroy();
          guiRef.current = null;
      };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100vh',
        background: `linear-gradient(to bottom, ${settings.bgTop}, ${settings.bgBottom})`
      }}
    >
      {isLoading && <Loader progress={loadingProgress} />}
      
      <ViewCube controlsRef={controlsRef} cameraRef={cameraRef} />
      
      <Toolbar 
          isMeasureActive={isMeasureActive}
          isOrtho={settings.projection === 'orthographic'}
          onMeasureClick={isMeasureActive ? exitMeasureMode : enterMeasureMode}
          onUndo={undoMeasurement}
          onRedo={redoMeasurement}
          onClear={clearMeasurements}
          onToggleProjection={() => updateSettings({ projection: settings.projection === 'orthographic' ? 'perspective' : 'orthographic' })}
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
  );
}

export default App;
