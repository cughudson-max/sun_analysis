import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

import { useSettings } from './hooks/useSettings';
import { useThreeScene } from './hooks/useThreeScene';
import { useLights } from './hooks/useLights';
import { useControls } from './hooks/useControls';
import { useSelection } from './hooks/useSelection';
import { useRhinoLoader } from './hooks/useRhinoLoader';
import { useSunAnalysisSettings } from './hooks/useSunAnalysisSettings';
import { useSunAnalysis } from './hooks/useSunAnalysis';
import { useSunTooltip } from './hooks/useSunTooltip';
import { LanguageProvider, useTranslation } from './hooks/useTranslation';

import { viewport_gradients } from './utils/gradients';
import { downloadScreenshot } from './utils/exportUtils';

import { Loader } from './components/UI/Loader';
import { TopHeader } from './components/UI/TopHeader';
import { WelcomeDialog } from './components/UI/WelcomeDialog';
import { SunAnalysisLegend } from './components/UI/SunAnalysisLegend';
import { AlertDialog } from './components/UI/AlertDialog';
import { SettingsDialog } from './components/UI/SettingsDialog';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

function AppContent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef<any>(null);
  const { t, language, setLanguage } = useTranslation();

  const { settings, updateSettings } = useSettings();
  const { settings: sunSettings, updateSettings: updateSunSettings } = useSunAnalysisSettings();

  const [selectedGradient, setSelectedGradient] = useState(sunSettings.selectedGradient);
  const [selectedViewportGradient, setSelectedViewportGradient] = useState(sunSettings.selectedViewportGradient);
  
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isWelcomeDialogOpen, setIsWelcomeDialogOpen] = useState(false);
  const [hasSelectedModel, setHasSelectedModel] = useState(true);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertDialogContent, setAlertDialogContent] = useState({ title: '', description: '' });
  const [bannerTexture, setBannerTexture] = useState<THREE.Texture | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });

  const displayMode = settings.displayMode || 'shadeWithEdge';

  const {
    sceneRef,
    rendererRef,
    cameraRef,
    perspectiveCameraRef,
    orthographicCameraRef,
    orthoFrustumHeightRef
  } = useThreeScene(containerRef);

  const { dirLightRef, updateGround, updateShadowFrustum } = useLights(sceneRef, settings);

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
  );

  const {
    isLoading,
    loadingProgress,
    handleFileChange,
    load3dmFile,
    currentFileName
  } = useRhinoLoader(
    sceneRef,
    cameraRef,
    controlsRef,
    orthoFrustumHeightRef,
    dirLightRef,
    updateGround,
    updateHighlights,
    settings.mergeGeometry,
    settings.loadMultiFile,
    displayMode,
    updateShadowFrustum,
    selectedObjectsRef
  );

  const {
    isSunAnalysisEnabled,
    isSunAnalysisRunning,
    maxSunHours,
    toggleSunAnalysis,
    setIsSunAnalysisEnabled,
    clearSunAnalysis,
    sunAnalysisRunIdRef
  } = useSunAnalysis({
    sceneRef,
    rendererRef,
    settings,
    sunSettings,
    selectedGradient
  });

  const { tooltipPosition, tooltipText } = useSunTooltip({
    sceneRef,
    cameraRef,
    rendererRef,
    isSunAnalysisEnabled,
    maxSunHours
  });

  const wasShadowOriginallyEnabledRef = useRef(true);
  const prevSunAnalysisEnabledRef = useRef(false);

  const handlePlayClick = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    if (!isSunAnalysisEnabled) {
      wasShadowOriginallyEnabledRef.current = settings.shadows;
      if (!settings.shadows) {
        updateSettings({ shadows: true });
      }
    }

    const hasGeometry = toggleSunAnalysis();
    if (!hasGeometry && !isSunAnalysisEnabled) {
      setAlertDialogContent({
        title: t.alert.noGeometry.title,
        description: t.alert.noGeometry.description
      });
      setAlertDialogOpen(true);
    }
  };

  const handleDownloadClick = async () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    setIsDownloading(true);
    downloadScreenshot(rendererRef.current, sceneRef.current, cameraRef.current, currentFileName);
    setTimeout(() => setIsDownloading(false), 500);
  };

  const handleDeleteClick = () => {
    if (isSunAnalysisEnabled) {
      setIsSunAnalysisEnabled(false);
    }
    if (isSunAnalysisRunning) {
      sunAnalysisRunIdRef.current += 1;
    }
    clearSunAnalysis(true);
  };

  const autoLoadRef = useRef(false);
  const autoPlayTriggeredRef = useRef(false);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);

  useEffect(() => {
    if (!settings.shadows) {
      updateSettings({ shadows: true });
    }
    if (!autoLoadRef.current) {
      load3dmFile('/demo.3dm');
      autoLoadRef.current = true;
    }
  }, [settings.shadows, updateSettings, load3dmFile]);

  useEffect(() => {
    if (isLoading) {
      setHasStartedLoading(true);
    }
  }, [isLoading]);

  // 当文件加载完成且尚未触发过自动日照分析时，自动执行 handlePlayClick
  useEffect(() => {
    if (hasStartedLoading && !isLoading && !autoPlayTriggeredRef.current) {
      autoPlayTriggeredRef.current = true;
      // 延迟一小段时间，确保场景已更新
      const timer = setTimeout(() => {
        if (!isSunAnalysisEnabled) {
          handlePlayClick();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [hasStartedLoading, isLoading, isSunAnalysisEnabled]);

  useEffect(() => {
    updateSunSettings({ selectedGradient });
  }, [selectedGradient]);

  useEffect(() => {
    updateSunSettings({ selectedViewportGradient });
  }, [selectedViewportGradient]);

  useEffect(() => {
    setSelectedGradient(sunSettings.selectedGradient);
  }, [sunSettings.selectedGradient]);

  useEffect(() => {
    setSelectedViewportGradient(sunSettings.selectedViewportGradient);
  }, [sunSettings.selectedViewportGradient]);

  useEffect(() => {
    const date = new Date(sunSettings.analysisDate);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const timeParts = sunSettings.analysisTime.split(':');
    const hour = parseInt(timeParts[0], 10);
    if (settings.month !== month || settings.day !== day || settings.hour !== hour) {
      updateSettings({ month, day, hour });
    }
  }, [sunSettings.analysisDate, sunSettings.analysisTime]);

  useEffect(() => {
    const animate = () => {
      requestAnimationFrame(animate);
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();
  }, [sceneRef, cameraRef, rendererRef]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (prevSunAnalysisEnabledRef.current && !isSunAnalysisEnabled) {
      if (!wasShadowOriginallyEnabledRef.current && settings.shadows) {
        updateSettings({ shadows: false });
      }
    }
    prevSunAnalysisEnabledRef.current = isSunAnalysisEnabled;

    if (sceneRef.current) {
      const ground = sceneRef.current.getObjectByName('Ground');
      if (ground) {
        ground.visible = !isSunAnalysisEnabled;
      }
    }
  }, [isSunAnalysisEnabled, settings.shadows, updateSettings, sceneRef]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const stops = viewport_gradients[selectedViewportGradient] || viewport_gradients['white'];
    if (stops.length > 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        stops.forEach((stop: { offset: number; color: string }) => {
          grad.addColorStop(stop.offset, stop.color);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      sceneRef.current.background = texture;
    } else {
      const color = stops.length > 0 ? stops[0].color : '#FFFFFF';
      const threeColor = new THREE.Color(color);
      sceneRef.current.background = threeColor;
    }
  }, [selectedViewportGradient, sceneRef]);

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.isModelMesh) {
        const currentMaterials = Array.isArray(child.material) ? child.material : [child.material];
        if (!child.userData.baseMaterials) {
          child.userData.baseMaterials = currentMaterials.map((m: THREE.Material) => m.clone());
        }
        if (!child.userData.displayMaterialCache) {
          child.userData.displayMaterialCache = {};
        }

        const mode = 'shadeWithEdge';
        const cache = child.userData.displayMaterialCache as Record<string, THREE.Material[]>;
        if (!cache[mode]) {
          const baseMaterials = child.userData.baseMaterials as THREE.Material[];
          cache[mode] = baseMaterials.map((m: THREE.Material) => {
            const anyM: any = m as any;
            const color = anyM?.color?.clone ? anyM.color.clone() : new THREE.Color(0xffffff);
            const map = anyM.map || null;
            const opacity = typeof anyM.opacity === 'number' ? anyM.opacity : 1;
            const transparent = !!anyM.transparent;
            const side = typeof anyM.side === 'number' ? anyM.side : THREE.FrontSide;
            const depthWrite = typeof anyM.depthWrite === 'boolean' ? anyM.depthWrite : true;
            const depthTest = typeof anyM.depthTest === 'boolean' ? anyM.depthTest : true;
            return new THREE.MeshLambertMaterial({ color, map, opacity, transparent, side, depthWrite, depthTest });
          });
        }
        const nextMaterials = cache[mode];
        child.material = (Array.isArray(child.material) ? nextMaterials : nextMaterials[0]);
      }
      if (child.name === 'SurfaceEdge') {
        child.visible = true;
      }
    });
  }, [sceneRef]);

  useEffect(() => {
    if (hasSelectedModel && !bannerTexture) {
      const loader = new THREE.TextureLoader();
      loader.load('/banner.jpg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        setBannerTexture(texture);
      });
    }
  }, [hasSelectedModel, bannerTexture]);

  return (
    <div className="relative w-full h-screen">
      <div
        ref={containerRef}
        className="absolute top-12 left-0 right-0 bottom-0 bg-white overflow-hidden"
        style={{
          background: bannerTexture
            ? `url(${bannerTexture.image.src}) center/cover no-repeat`
            : `linear-gradient(to bottom, ${settings.bgTop}, ${settings.bgBottom})`
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-[9999] pointer-events-none flex items-center justify-center">
            <Loader progress={loadingProgress} />
          </div>
        )}

        <div ref={selectionBoxDivRef} className="selection-box"></div>
        <input
          type="file"
          id="file-input"
          accept=".3dm"
          multiple={settings.loadMultiFile}
          className="hidden"
          onChange={handleFileChange}
        />

        {tooltipPosition && (
          <div
            className="fixed bg-black/80 text-white px-2 py-1 rounded text-xs pointer-events-none z-[10000]"
            style={{
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
            }}
          >
            {tooltipText}
          </div>
        )}
      </div>

      {maxSunHours > 0 && (
        <div className="absolute right-4 top-16 z-50">
          <SunAnalysisLegend
            maxSunHours={maxSunHours}
            selectedGradient={selectedGradient}
          />
        </div>
      )}

      <TopHeader
        onUploadClick={() => document.getElementById('file-input')?.click()}
        onDownloadClick={handleDownloadClick}
        onPlayClick={handlePlayClick}
        onDeleteClick={handleDeleteClick}
        isDownloading={isDownloading}
        isPlaying={isSunAnalysisEnabled}
        isCalculating={isSunAnalysisRunning}
        onSettingClick={() => setIsSettingsDialogOpen(true)}
        onThemeToggle={() => setIsDarkMode(!isDarkMode)}
        isDarkMode={isDarkMode}
        currentLanguage={language}
        onLanguageChange={setLanguage}
      />

      <WelcomeDialog
        open={isWelcomeDialogOpen}
        onOpenChange={setIsWelcomeDialogOpen}
        onFileSelect={(files) => {
          handleFileChange({ target: { files } } as any);
          setHasSelectedModel(true);
        }}
        isLoading={isLoading}
      />

      <AlertDialog
        open={alertDialogOpen}
        onOpenChange={setAlertDialogOpen}
        title={alertDialogContent.title}
        description={alertDialogContent.description}
      />

      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        externalSettings={sunSettings}
        onExternalSettingsChange={updateSunSettings}
      />
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}

export default App;