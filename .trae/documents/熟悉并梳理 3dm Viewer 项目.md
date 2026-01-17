项目目前主要逻辑都集中在 `App.tsx` 中（约 1500 行），包含场景初始化、事件监听、业务逻辑（测量、文件加载）和 UI。

为了提高可维护性和扩展性，我建议采用 **"自定义 Hook + 功能组件"** 的方式进行重构。保持现有的 Three.js 原生写法（不迁移到 React-Three-Fiber 以避免重写成本过高），但将逻辑拆分到独立的 Hook 中。

### 📁 建议目录结构
```text
src/
├── components/          # UI 组件
│   ├── UI/              # 纯 React UI (Toolbar, Loading)
│   ├── ViewCube/        # 现有视图组件
│   └── Viewer/          # 3D 容器组件 (可选)
├── hooks/               # 核心逻辑拆分
│   ├── useThreeScene.ts # 场景、相机、渲染器初始化与 Resize
│   ├── useLights.ts     # 灯光、阴影、地面、SunCalc
│   ├── useControls.ts   # 轨道控制器、正交/透视切换
│   ├── useSelection.ts  # 射线检测、点选、框选、高亮
│   ├── useMeasurement.ts# 测量工具逻辑
│   ├── useRhinoLoader.ts# .3dm 加载与材质处理
│   └── useSettings.ts   # 配置存储 (LocalStorage)
├── utils/               # 工具函数
└── App.tsx              # 主入口，负责组装
```

### 🚀 重构步骤

#### 第一阶段：基础设施拆分
1.  **提取配置管理 (`useSettings`)**: 将 `localStorage` 读写逻辑和默认状态移出。
2.  **提取核心 3D 环境 (`useThreeScene`)**: 将 Scene, Camera, Renderer 的创建和 `requestAnimationFrame` 循环封装。
3.  **提取光照与环境 (`useLights`)**: 将 SunCalc、方向光、环境光、Ground 的更新逻辑移出。

#### 第二阶段：交互逻辑拆分
4.  **提取控制器 (`useControls`)**: 封装 OrbitControls 及相机切换（透视/正交）逻辑。
5.  **提取选择系统 (`useSelection`)**: 将 `raycaster`、`SelectionBox`、点击事件、高亮逻辑封装。
6.  **提取测量工具 (`useMeasurement`)**: 将测量相关的状态、绘制、吸附逻辑（`getSnappedPoint`）独立。

#### 第三阶段：业务与 UI 分离
7.  **提取加载器 (`useRhinoLoader`)**: 封装 `Rhino3dmLoader` 及图层/材质解析逻辑。
8.  **UI 组件化**:
    *   创建 `src/components/UI/Toolbar.tsx` 替代原生的 HTML 按钮。
    *   创建 `src/components/UI/Loader.tsx`。
    *   (可选) 将 `lil-gui` 逻辑封装到一个专门的 `useGui.ts` 或组件中，避免污染主逻辑。

#### 第四阶段：整合
9.  **重组 `App.tsx`**: `App` 将主要负责调用上述 Hooks 并将 Refs 传递给 UI 组件，代码量预计可减少至 300 行以内。

---

**确认执行计划？**
如果确认，我将开始按照上述模块逐步创建文件并迁移代码。建议先从 **"工具函数与配置"** 及 **"基础场景 Hook"** 开始。