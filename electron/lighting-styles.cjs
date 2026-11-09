const path = require('node:path');
const library = require('../assets/lighting-styles/library.json');
const DIRECTORY = path.resolve(__dirname, '../assets/lighting-styles');

function publicOptions() {
  return library.styles.map(style => ({ id: style.id, label: style.name, description: style.description, preview: `workbench://app/lighting-preview/${style.preview}` }));
}
function previewFile(name) {
  if (!library.styles.some(style => name === style.preview)) throw new Error('不存在的布光示意图');
  return path.join(DIRECTORY, 'previews', name);
}
const LIGHTING_STYLE_INSTRUCTIONS = [
  `\n[工作台自适应布光风格 v${library.version}]`,
  ...library.workflow.map((rule, index) => `${index + 1}. ${rule}`),
  ...library.styles.map(style => [
    `\n用户选择“布光：${style.name}”时：${style.goal}`,
    ...style.guidance,
    `效果检查：${style.checks.join('；')}`
  ].join('\n')),
  '[自适应布光风格结束]'
].join('\n');

module.exports = { DIRECTORY, publicOptions, previewFile, LIGHTING_STYLE_INSTRUCTIONS };
