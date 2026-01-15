我要实现一个网页版本的3dm查看器，该查看器具有如下功能：
1、打开本地3dm文件并显示到网页上；

2、保留3dm文件中几何体的颜色；

3、模型点选和框选功能，选中的物体高亮，高亮显示模式为，模型的边线显示为黄色，且显示在WebGL渲染管线的最前面；

4、框选逻辑如下，用户按下Ctrl键及鼠标左键实现框选功能；
5、按shift按键，并点击鼠标实现物体多选；

6、按鼠标中键实现PanView

7、按鼠标左键实现视口旋转，鼠标松开时立即停止旋转；

8、Viewport背景颜色为渐变色，且可调节；

9、视口中模型的显示模式SketchupStyle，且亮度可调

10、WebGL坐标系和Rhino 3dm中的坐标系不同，在实现功能的时候需要注意，其之间的差异如下表所示：


| **Feature**          | **Rhino 3D (Standard)** | **WebGL (Standard/Default)** |
| -------------------------- | ----------------------------- | ---------------------------------- |
| **Up-Axis**          | **+Z**(Vertical)        | **+Y**(Vertical)             |
| **Horizontal Plane** | XY Plane (Floor)              | XZ Plane (Floor)                   |
| **Forward/Depth**    | +Y (usually)                  | -Z (into the screen)               |
| **Handedness**       | Right-Handed                  | Right-Handed (usually)*            |
