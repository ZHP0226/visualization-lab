// Internal Agent protocol. These instructions are not rendered in the product UI.
const MAX_AGENT_TEXT = 256000;
function imagePoint(rect, width, height, clientX, clientY) {
  if (!(width > 0 && height > 0 && rect.width > 0 && rect.height > 0)) return null;
  const scale = Math.min(rect.width / width, rect.height / height);
  const left = rect.left + (rect.width - width * scale) / 2, top = rect.top + (rect.height - height * scale) / 2;
  const u = (clientX - left) / (width * scale), v = (clientY - top) / (height * scale);
  if (u < 0 || v < 0 || u > 1 || v > 1) return null;
  return { x: Math.min(width - 1, Math.floor(u * width)), y: Math.min(height - 1, Math.floor(v * height)), width, height, u: +u.toFixed(6), v: +v.toFixed(6) };
}
function parseEdits(text) {
  text = text.replace(/\r\n/g, '\n');
  const blocks = [...text.matchAll(/^```workbench-edit[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm)];
  if ((text.match(/^```workbench-edit[ \t]*$/gm) || []).length !== blocks.length) throw new Error('局部修改定位块不完整，请撤销编辑或重新右击生成。');
  if (blocks.length > 8) throw new Error('每次最多汇总 8 条待发送修改意见。');
  const edits = blocks.map(block => {
    let t; try { t = JSON.parse(block[1]); } catch { throw new Error('局部修改定位信息不是有效 JSON，请重新右击生成。'); }
    if (t.version !== 1 || !['object', 'image'].includes(t.kind) || typeof t.projectId !== 'string' || !t.projectId || !(t.assetId === null || typeof t.assetId === 'string')) throw new Error('无效的局部修改来源。');
    if (t.kind === 'object' && (!t.assetId || !t.object || typeof t.object.name !== 'string' || !Array.isArray(t.object.hierarchy) || !t.object.hierarchy.length || t.object.hierarchy.length > 100)) throw new Error('缺少模型对象层级。');
    if (t.kind === 'image') {
      const p = t.point;
      if (typeof t.renderId !== 'string' || !p || ![p.width, p.height, p.x, p.y].every(Number.isInteger) || p.width < 1 || p.height < 1 || p.x < 0 || p.y < 0 || p.x >= p.width || p.y >= p.height || ![p.u, p.v].every(n => Number.isFinite(n) && n >= 0 && n <= 1) || Math.abs(p.x - p.u * p.width) > 1.01 || Math.abs(p.y - p.v * p.height) > 1.01) throw new Error('无效的成图定位坐标。');
    }
    return t;
  });
  if (edits.some(t => t.projectId !== edits[0].projectId || t.assetId !== edits[0].assetId)) throw new Error('当前待发送意见属于另一个模型，请先发送或删除这些意见，再添加。');
  if (edits[0]?.assetId === null && edits.some(t => t.renderId !== edits[0].renderId)) throw new Error('请按同一张独立图片分批发送修改意见。');
  return edits;
}
function formatEdit(target, request) {
  const label = target.kind === 'object' ? `模型对象「${target.object.name}」` : `成图位置（左起 ${(target.point.u * 100).toFixed(1)}%，上起 ${(target.point.v * 100).toFixed(1)}%；像素 ${target.point.x}, ${target.point.y}）`;
  return `局部修改｜${label}：${request.trim()}\n文件：${target.fileName}\n请按用户要求和本轮交付策略保存；版本规则以用户明确指示为准。${target.kind === 'image' ? '请先查看原成图，结合坐标判断对应结构；坐标以原图左上角为原点，不能直接当作三维对象编号。' : ''}\n\`\`\`workbench-edit\n${JSON.stringify({ ...target, request: request.trim() })}\n\`\`\``;
}
module.exports = { imagePoint, parseEdits, formatEdit, MAX_AGENT_TEXT };
