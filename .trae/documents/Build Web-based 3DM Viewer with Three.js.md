I will build a React-based web application using **Vite**, **Three.js**, and **rhino3dm** to implement the 3DM viewer.

### Tech Stack
-   **Framework**: React 18 + TypeScript (via Vite)
-   **3D Engine**: Three.js
-   **Loader**: rhino3dm + 3DMLoader
-   **UI Controls**: Custom React components or `lil-gui` for settings.

### Implementation Steps

#### Phase 1: Project Initialization & Setup
1.  Initialize a new Vite project (`react-ts`).
2.  Install dependencies: `three`, `@types/three`, `rhino3dm`.
3.  Configure `rhino3dm` library path (needs to copy wasm files to public directory).

#### Phase 2: Core 3D Scene & Coordinate System
1.  Set up the Three.js scene.
2.  **Coordinate System**: Configure `THREE.Object3D.DefaultUp.set(0, 0, 1)` to match Rhino's Z-Up system.
3.  Implement `OrbitControls` with mouse mapping:
    -   Left Mouse: Rotate (Default).
    -   Middle Mouse: Pan (Default).
    -   Right Mouse: Zoom (Default).

#### Phase 3: 3DM Loader & Sketchup Style
1.  Implement `FileLoader` component to read local `.3dm` files.
2.  Use `3DMLoader` to parse the file.
3.  **Style Processing**:
    -   Traverse loaded objects.
    -   Preserve original materials/colors.
    -   Generate `EdgesGeometry` for every mesh to simulate Sketchup style (black edges).
4.  Implement "Brightness" control (adjusting Scene Light intensity).

#### Phase 4: Selection System (The Complex Part)
1.  **State Management**: Track `selectedUUIDs` set.
2.  **Interaction Logic**:
    -   **Click**: Raycast from mouse.
    -   **Box Select (Ctrl + Drag)**:
        -   Detect `Ctrl` key down -> Disable `OrbitControls` rotation -> Enable custom Box Selection overlay.
        -   Calculate frustum selection.
    -   **Shift Modifier**: Toggle selection instead of replace.
3.  **Highlight Rendering**:
    -   Create a separate "Highlight Layer" or specialized objects.
    -   For selected items: Render `EdgesGeometry` with **Yellow** color.
    -   **Always on Top**: Set `material.depthTest = false`, `material.renderOrder = 9999`.

#### Phase 5: UI & Final Polish
1.  **Background**: Implement CSS-based gradient background (overlaying transparent canvas) to allow easy color adjustment.
2.  **Control Panel**: Add UI for:
    -   Gradient Top/Bottom colors.
    -   Brightness slider.
    -   File Open button.
3.  Verify all requirements against the checklist.

### Verification Plan
-   I will provide a simple `test.3dm` generation script or instructions if you don't have one, but primarily I will rely on code correctness.
-   I will verify the coordinate axes visually (Z should be up).
