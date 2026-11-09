const library = require('../assets/visual-styles/library.json');

// Shared text instructions travel through the existing Agent protocols.
// No reference-image discovery, filesystem scanning or generation API is needed.
const VISUAL_STYLE_INSTRUCTIONS = [
  `\n[工作台内置文字视觉风格库 v${library.version}]`,
  `默认风格：${library.defaultStyleId}。这是生图任务的默认制作规则，不是要求每轮对话都生成图片。`,
  ...library.workflow.map((rule, index) => `${index + 1}. ${rule}`),
  ...library.styles.map(style => [
    `\n方案 ${style.id}｜${style.name}`,
    `适用：${style.useWhen}`,
    `提示词基础：${style.prompt}`,
    `检查：${style.checks.join('；')}`
  ].join('\n')),
  '\n[文字视觉风格库结束]'
].join('\n');

module.exports = { VISUAL_STYLE_INSTRUCTIONS };
