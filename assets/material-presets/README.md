# 双软件材质库

六种外观预设各有 Blender / C4D 代码配方，界面统一使用 Blender 实际渲染的示意图。配方是外观起点，不代表实测光学常数；不要把球体、暗室与相机自动套入用户项目。

读取 `catalog.json` 的 materials，按 ID 取对应 spec。确认本次建模软件后，使用对应文件的 `create_material(spec)`，只给用户本轮指定的对象赋材质。颜色、粗糙度等按用户要求覆盖并保存参数，不需要导入大体积材质工程包。

```python
import json
from blender_materials import create_material  # C4D 使用 c4d_materials
spec = next(m for m in json.load(open('catalog.json'))['materials'] if m['id'] == 'M004')
material = create_material(spec)
# Blender: object.data.materials.append(material)
# C4D: document.InsertMaterial(material); TextureTag.SetMaterial(material)
```

C4D R21 使用 Python 2 兼容配方；必要时把代码、参数和原工程暂存到 ASCII 路径，完成后校验复制回项目。Blender 材质为 Principled BSDF；C4D 材质为原生 GGX / Fresnel / 透明通道，含独立透明反射层适配。C4D 的单独校准参数与 Blender 数值不要求相同。

`previews` 是原始 Blender PNG，`preview-sphere.glb` 是一份球体几何和六个材质变体，仅供选材。不是用户项目的模型或最终渲染。库不含原生工程、纹理大包或 EXR。

来源：用户在 2026-11-05 认可的 `material-lab/v004/review02` 六材质样片。参数与函数保留实际制作版本，示意图沿用固定 Blender 参照。布光选择是文字意图，具体灯光由 Agent 根据用户场景实现；选材不要求固定暗室和 45° 机位。
