# 可视化实验室 · 拆分建模与原生组装 1.1

新建模型执行四步：**拆解参考 → 建立灰模 → 分别建模 → 组装渲染并完善细节**。不能先一次生成整场，再复制整场工程冒充独立素材。只有一个几何对象时可以只有一个部件；多个对象至少拆成两个有意义的部件。重复阵列可作为一个部件，不必每颗球各建一个文件。

本目录随软件提供，复制到本轮 `<交付前缀>_reproduction`，保存原图、方案、灰模、独立原工程、样片和组装记录。文件审计不是视觉或科学验收，单图也不能唯一确定遮挡结构。

## 1. 拆解并保存方案

按 example.structure.json 保存 structure.json。固定右手 Z 向上坐标、对象稳定 ID、尺寸位置、分组、材质、灯光、相机、渲染参数和种子。无法确定的背面、尺度和厚度写入 assumptions。

components 按可独立制作的元素拆分，每项有 id、name、objectIds，完整且不重复地覆盖全部几何对象，例如“基底”“阵列”“配位单元”“分子组”。先 plan_workbench_delivery，再 save_workbench_structure_plan，采用返回的真实输出前缀。无专用工具时按同格式复制代码、保存方案和审计。

## 2. 建立灰模，匹配相机

先核实用户本次已选择的软件与后台程序，默认不操控桌面。以下用 C4D，Blender 换 software 和对应程序路径：

```text
python run.py --software c4d --executable "G:/Maxon Cinema 4D R21/c4dpy.exe" --plan structure.json --stem "D:/项目/主体_v001" --stage blockout
python run.py --software blender --executable "D:/Blender 5.2/blender.exe" --plan structure.json --stem "D:/项目/主体_v001" --stage blockout
```

灰模保存在 stages/blockout，真实 PNG 同时保留为 blockout.png。custom 几何在内置灰模中用包围盒占位，只用于构图。查看灰模并对齐画幅、轮廓、前后遮挡和占比；需要时调整方案重做本阶段，锁定相机后再做部件。

## 3. 每个部件分别建模

```text
python run.py --software c4d --executable "已选软件的后台程序" --plan structure.json --stem "D:/项目/主体_v001" --stage components
```

每个 components/<id> 有独立 structure.json、.blend 或 .c4d、GLB、实渲 PNG、audit.json。原工程保存后重新打开，再读取实际网格和渲染。不得用生图、截图或整场副本替代。部件相机单独取景，灯光按尺寸调整；可在部件中显式指定 camera。几何保留整场坐标，不为拍样片永久移动对象。

查看各个样片，先调代表性的材质、高光和暗部，再扩展同类元素。基础构造器只支持 box、sphere、cylinder。复杂结构使用独立项目脚本：用 component_plan() 获取部件方案，复制 common.CODE 到该部件目录，保留基础工具原件，以 geometry_audit、write_glb、write_audit 保存真实结果。完成后登记：

```python
from component_workflow import record_component
record_component(main_plan_file, component_id, part_plan_file,
                 part_output_stem, 'c4d')  # 或 blender
```

此函数只登记与方案匹配的既有原生输出，不能跳过建模。复杂曲面、布尔、透明材质、光效的实现及拓扑检查由项目脚本负责，内置基础构造器不会自动构建任意复杂结构。

## 4. 导入部件组装，再完善渲染

```text
python run.py --software c4d --executable "已选软件的后台程序" --plan structure.json --stem "D:/项目/主体_v001" --stage assemble
```

组装实际读取各独立原工程的对象与材质，排除样片相机和灯光，采用整图机位与布光。保存、重开主工程，输出 GLB、真实 PNG、audit.json 和 component-workflow.json。缺少部件、部件变化或相机与灰模不符时停止，不能直接登记整场。

省略 stage 会按顺序运行全部阶段；Agent 仍须实际查看输出并改进差异。分阶段执行适合先检查灰模与材质。全图灯光或分辨率变化可复用几何和材质未变的部件再 assemble；部件几何或材质改变时先重建对应部件记录。

参考图新建模还要保留 first-render.png、至少同类参数的两张不同低清试片和 look-review.json，见 example.look-review.json。候选类别为 camera、lighting、material、effects。固定其他变量，记录真实参数、观察和剩余差异，再出高清图，不能用选中的低清候选冒充高清图。review.status 默认 pending，实际看过才可改 reviewed；它不是用户验收。

「对照」保留结构、成图和参考三者；「复刻过程」显示灰模、独立部件样片、首轮和试片，只显示匹配当前最终图的记录。文字与放大框可以后期排版，明确原生结构和后期图的编辑边界。

## 原流程与软件范围

已有模型局部修改、仅渲染保留原路径；独立图片修改不走建模。用户明确不渲染时可加 --no-render，保存灰模、独立部件与组装原工程/GLB，不伪造 PNG 或宣称完成材质对照。要求参考图成图的任务仍须真实 PNG 与对照。--replay-output 新PNG路径只重渲既有原工程，不重写模型和审计。

Blender 基线为 Cycles CPU、固定采样与种子、Standard 色彩，支持透视/正交；C4D R21 为 Standard CPU、透视、固定抗锯齿和基本颜色/高光材质。两者参数语义不同，C4D 正交或复杂材质需单独实现和验证，不默默近似。GLB 供结构查看，原生外观以真实 PNG 为准。不承诺跨软件、硬件或版本的像素一致性，审计也不是防恶意伪造的安全证明。
