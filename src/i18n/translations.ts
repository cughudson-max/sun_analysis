export type Language = 'zh-CN' | 'zh-TW' | 'en';

export interface TranslationKeys {
  app: {
    title: string;
  };
  topHeader: {
    sunAnalysis: string;
    upload: string;
    download: string;
    selectLocation: string;
    email: string;
    settings: string;
    lightMode: string;
    darkMode: string;
    shadow: string;
    time: string;
    deleteAnalysis: string;
  };
  welcome: {
    title: string;
    subtitle: string;
    getStarted: string;
    loadModel: string;
    selectFile: string;
    supportedFormats: string;
    features: string;
    feature3dmSupport: string;
    featureSunAnalysis: string;
    featureDisplayModes: string;
    featureLayerManagement: string;
    openLocalFile: string;
    continue: string;
  };
  settings: {
    title: string;
    display: string;
    displayMode: string;
    shadeWithEdge: string;
    renderMode: string;
    shading: string;
    wireframe: string;
    shadows: string;
    mergeGeometry: string;
    loadMultiFile: string;
    projection: string;
    perspective: string;
    orthographic: string;
    lighting: string;
    ambientLight: string;
    directionalLight: string;
    sunSimulation: string;
    sunPath: string;
    analysis: string;
    language: string;
    close: string;
    precision: {
      low: string;
      lowDesc: string;
      medium: string;
      mediumDesc: string;
      high: string;
      highDesc: string;
      minutes: string;
      samplingInterval: string;
    };
    analysisTime: string;
    analysisPrecision: string;
    colorMapping: string;
    viewportBackground: string;
  };
  location: {
    title: string;
    searchPlaceholder: string;
    currentLocation: string;
    latitude: string;
    longitude: string;
    confirm: string;
    cancel: string;
  };
  alert: {
    noGeometry: {
      title: string;
      description: string;
    };
    loadError: {
      title: string;
      description: string;
    };
  };
  sunAnalysis: {
    title: string;
    hours: string;
    legend: string;
  };
  common: {
    confirm: string;
    cancel: string;
    close: string;
    save: string;
    loading: string;
  };
}

export const translations: Record<Language, TranslationKeys> = {
  'zh-CN': {
    app: {
      title: '3D 模型查看器',
    },
    topHeader: {
      sunAnalysis: '日照分析',
      upload: '上传',
      download: '下载',
      selectLocation: '选择位置',
      email: '邮件',
      settings: '设置',
      lightMode: '浅色模式',
      darkMode: '深色模式',
      shadow: '阴影',
      time: '时间',
      deleteAnalysis: '删除分析',
    },
    welcome: {
      title: '欢迎使用 3D 模型查看器',
      subtitle: '上传您的 3DM 文件开始探索',
      getStarted: '开始使用',
      loadModel: '加载模型',
      selectFile: '选择文件',
      supportedFormats: '支持 .3DM 格式文件',
      features: '功能特点',
      feature3dmSupport: '支持 .3dm 文件格式',
      featureSunAnalysis: '日照光影分析',
      featureDisplayModes: '多种显示模式',
      featureLayerManagement: '图层管理',
      openLocalFile: '打开本地 *.3dm 文件',
      continue: '继续',
    },
    settings: {
      title: '设置',
      display: '显示',
      displayMode: '显示模式',
      shadeWithEdge: '着色带边',
      renderMode: '渲染模式',
      shading: '着色',
      wireframe: '线框',
      shadows: '阴影',
      mergeGeometry: '合并几何体',
      loadMultiFile: '加载多文件',
      projection: '投影',
      perspective: '透视',
      orthographic: '正交',
      lighting: '照明',
      ambientLight: '环境光',
      directionalLight: '平行光',
      sunSimulation: '太阳模拟',
      sunPath: '太阳路径',
      analysis: '分析',
      language: '语言',
      close: '关闭',
      precision: {
        low: '低',
        lowDesc: '快速计算，低精度',
        medium: '中',
        mediumDesc: '平衡精度与速度',
        high: '高',
        highDesc: '高精度，慢速计算',
        minutes: '{count}分钟',
        samplingInterval: '采样间隔',
      },
      analysisTime: '分析时间',
      analysisPrecision: '分析精度',
      colorMapping: '颜色映射',
      viewportBackground: '视口背景',
    },
    location: {
      title: '选择位置',
      searchPlaceholder: '搜索位置...',
      currentLocation: '当前位置',
      latitude: '纬度',
      longitude: '经度',
      confirm: '确认',
      cancel: '取消',
    },
    alert: {
      noGeometry: {
        title: '无几何体',
        description: '请在运行日照分析前加载 3D 模型。',
      },
      loadError: {
        title: '加载错误',
        description: '无法加载文件，请检查文件格式。',
      },
    },
    sunAnalysis: {
      title: '日照分析',
      hours: '小时',
      legend: '图例',
    },
    common: {
      confirm: '确认',
      cancel: '取消',
      close: '关闭',
      save: '保存',
      loading: '加载中...',
    },
  },
  'zh-TW': {
    app: {
      title: '3D 模型檢視器',
    },
    topHeader: {
      sunAnalysis: '日照分析',
      upload: '上傳',
      download: '下載',
      selectLocation: '選擇位置',
      email: '郵件',
      settings: '設定',
      lightMode: '淺色模式',
      darkMode: '深色模式',
      shadow: '陰影',
      time: '時間',
      deleteAnalysis: '刪除分析',
    },
    welcome: {
      title: '歡迎使用 3D 模型檢視器',
      subtitle: '上傳您的 3DM 檔案開始探索',
      getStarted: '開始使用',
      loadModel: '載入模型',
      selectFile: '選擇檔案',
      supportedFormats: '支援 .3DM 格式檔案',
      features: '功能特點',
      feature3dmSupport: '支援 .3dm 檔案格式',
      featureSunAnalysis: '日照光影分析',
      featureDisplayModes: '多種顯示模式',
      featureLayerManagement: '圖層管理',
      openLocalFile: '開啟本地 *.3dm 檔案',
      continue: '繼續',
    },
    settings: {
      title: '設定',
      display: '顯示',
      displayMode: '顯示模式',
      shadeWithEdge: '著色帶邊',
      renderMode: '渲染模式',
      shading: '著色',
      wireframe: '線框',
      shadows: '陰影',
      mergeGeometry: '合併幾何體',
      loadMultiFile: '載入多檔案',
      projection: '投影',
      perspective: '透視',
      orthographic: '正交',
      lighting: '照明',
      ambientLight: '環境光',
      directionalLight: '平行光',
      sunSimulation: '太陽模擬',
      sunPath: '太陽路徑',
      analysis: '分析',
      language: '語言',
      close: '關閉',
      precision: {
        low: '低',
        lowDesc: '快速計算，低精度',
        medium: '中',
        mediumDesc: '平衡精度與速度',
        high: '高',
        highDesc: '高精度，慢速計算',
        minutes: '{count}分鐘',
        samplingInterval: '採樣間隔',
      },
      analysisTime: '分析時間',
      analysisPrecision: '分析精度',
      colorMapping: '顏色映射',
      viewportBackground: '視口背景',
    },
    location: {
      title: '選擇位置',
      searchPlaceholder: '搜尋位置...',
      currentLocation: '目前位置',
      latitude: '緯度',
      longitude: '經度',
      confirm: '確認',
      cancel: '取消',
    },
    alert: {
      noGeometry: {
        title: '無幾何體',
        description: '請在執行日照分析前載入 3D 模型。',
      },
      loadError: {
        title: '載入錯誤',
        description: '無法載入檔案，請檢查檔案格式。',
      },
    },
    sunAnalysis: {
      title: '日照分析',
      hours: '小時',
      legend: '圖例',
    },
    common: {
      confirm: '確認',
      cancel: '取消',
      close: '關閉',
      save: '儲存',
      loading: '載入中...',
    },
  },
  'en': {
    app: {
      title: '3D Model Viewer',
    },
    topHeader: {
      sunAnalysis: 'Sun Analysis',
      upload: 'Upload',
      download: 'Download',
      selectLocation: 'Select Location',
      email: 'Email',
      settings: 'Settings',
      lightMode: 'Light Mode',
      darkMode: 'Dark Mode',
      shadow: 'Shadow',
      time: 'Time',
      deleteAnalysis: 'Delete Analysis',
    },
    welcome: {
      title: 'Welcome to 3D Model Viewer',
      subtitle: 'Upload your 3DM file to start exploring',
      getStarted: 'Get Started',
      loadModel: 'Load Model',
      selectFile: 'Select File',
      supportedFormats: 'Supports .3DM format files',
      features: 'Features',
      feature3dmSupport: 'Support for .3dm file format',
      featureSunAnalysis: 'Sun lighting analysis',
      featureDisplayModes: 'Multiple display modes',
      featureLayerManagement: 'Layer management',
      openLocalFile: 'Open *.3dm from local',
      continue: 'Continue',
    },
    settings: {
      title: 'Settings',
      display: 'Display',
      displayMode: 'Display Mode',
      shadeWithEdge: 'Shade with Edge',
      renderMode: 'Render Mode',
      shading: 'Shading',
      wireframe: 'Wireframe',
      shadows: 'Shadows',
      mergeGeometry: 'Merge Geometry',
      loadMultiFile: 'Load Multi-file',
      projection: 'Projection',
      perspective: 'Perspective',
      orthographic: 'Orthographic',
      lighting: 'Lighting',
      ambientLight: 'Ambient Light',
      directionalLight: 'Directional Light',
      sunSimulation: 'Sun Simulation',
      sunPath: 'Sun Path',
      analysis: 'Analysis',
      language: 'Language',
      close: 'Close',
      precision: {
        low: 'Low',
        lowDesc: 'Fast calculation, low precision',
        medium: 'Medium',
        mediumDesc: 'Balance precision and speed',
        high: 'High',
        highDesc: 'High precision, slow calculation',
        minutes: '{count} min',
        samplingInterval: 'Sampling interval',
      },
      analysisTime: 'Analysis Time',
      analysisPrecision: 'Analysis Precision',
      colorMapping: 'Color Mapping',
      viewportBackground: 'Viewport Background',
    },
    location: {
      title: 'Select Location',
      searchPlaceholder: 'Search location...',
      currentLocation: 'Current Location',
      latitude: 'Latitude',
      longitude: 'Longitude',
      confirm: 'Confirm',
      cancel: 'Cancel',
    },
    alert: {
      noGeometry: {
        title: 'No Geometry',
        description: 'Please load a 3D model before running sun analysis.',
      },
      loadError: {
        title: 'Load Error',
        description: 'Unable to load file, please check the file format.',
      },
    },
    sunAnalysis: {
      title: 'Sun Analysis',
      hours: 'hours',
      legend: 'Legend',
    },
    common: {
      confirm: 'Confirm',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      loading: 'Loading...',
    },
  },
};

export const languages: { value: Language; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en', label: 'English' },
];