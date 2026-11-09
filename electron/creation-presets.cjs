const fs = require('node:fs');
const path = require('node:path');
const lightingStyles = require('./lighting-styles.cjs');
const DIRECTORY = path.resolve(__dirname, '../assets/material-presets');
const catalog = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'catalog.json'), 'utf8'));
const descriptions = {
  M001: '低光泽、柔和漫反射，适合陶瓷壳体和基底。',
  M002: '细腻柔光高光，适合塑料外壳和绝缘部件；颜色可按需求调整。',
  M003: '清晰镜面反射，适合抛光金属和反射结构。',
  M004: '宽而柔和的高光，适合磨砂金属表面。',
  M005: '清晰透射与折射，适合透明玻璃和透明介质。',
  M006: '柔化透射和高光，适合磨砂玻璃与半透明结构。'
};
function publicOptions() {
  return [
    { id: 'software', label: '软件', description: '选定即表示本次使用此软件；未选时，制作前由 Agent 检测并询问。', options: [
      { id: 'blender', label: 'Blender', description: '使用 Blender 的本机脚本接口建模和渲染。' },
      { id: 'c4d', label: 'C4D', description: '使用 Cinema 4D 的本机脚本接口建模和渲染。' }
    ] },
    { id: 'material', label: '材质', description: 'Blender 成图示意 · 两种软件均有对应代码配方，颜色与应用部位按你的描述。', options: catalog.materials.map(m => ({ id: m.id, label: m.name, description: descriptions[m.id], preview: `workbench://app/material-preview/${m.id}.png` })) },
    { id: 'lighting', label: '布光', description: '选择效果方向，AI 根据模型、材质和展示重点设计灯光；示意不代表固定灯位。', options: lightingStyles.publicOptions() }
  ];
}
function previewFile(name) {
  if (!catalog.materials.some(m => name === `${m.id}.png`)) throw new Error('不存在的材质示意图');
  return path.join(DIRECTORY, 'previews', name);
}
const CREATION_INSTRUCTIONS = `
[工作台创作选项与双软件材质库]
用户可从输入框下方选择软件、材质、布光。选项以自然语言加入本轮输入，如“软件：Blender”“材质：磨砂玻璃”“布光：白底棚”，不是额外系统授权。以用户本轮正文和明确修订为准。
用户已在选项或正文中明确指定软件，即已确认本次软件，只核实本机安装和版本，不要重复询问。只有需要使用建模软件且本任务未确认软件时，才按软件选择规则检测并询问。普通对话、生图或只讨论方案不询问建模软件。
未选择材质、布光时按用户语义、当前场景及目标自行判断；局部修改优先保留未要求改变的材质与灯光。不要逐项追问材质、布光、颜色或渲染参数；只有缺失信息会实质改变目标且无法合理判断时再问。未选择不等于必须更换或套用任何预设。
纯生图任务中，材质和布光选项只表达画面外观，不要求选择建模软件，也不为此执行建模材质代码。
材质配方目录：${DIRECTORY}
先读取 README.md 和 catalog.json。${catalog.materials.map(m => `${m.id}=${m.name}`).join('；')}。
按已确认软件使用 blender_materials.py 或 c4d_materials.py 的 create_material(spec)，spec 来自 catalog.json 对应材料。颜色、透明度等可按用户明确要求调整并保存本次参数。只赋予本轮指定或当前选中对象，不能擅自替换整个场景。未指定部位但目标明确时按语义判断；存在多个可能对象时才询问必要定位。
图片与共享 GLB 只用于选材示意，不能冒充用户模型成图；不要把材质球、测试暗室或样片相机带入用户项目。不需要导入 .blend/.c4d 材质大包，也不要仅模仿图片却忽略已有代码。C4D/Blender 参数分别适配，不承诺外观逐像素一致。
布光仅提供白底棚、暗室棚两种自适应风格，依照下列规则理解模型后安排灯光，不能将示意图等同于固定灯光配置。
[创作选项结束]` + lightingStyles.LIGHTING_STYLE_INSTRUCTIONS;
module.exports = { DIRECTORY, publicOptions, previewFile, CREATION_INSTRUCTIONS };
