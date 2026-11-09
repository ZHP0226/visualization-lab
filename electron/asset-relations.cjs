const path = require('node:path');
function subjectName(value) {
  return path.basename(value).replace(/\.(?:glb|gltf|fbx|obj|blend|c4d|png|jpe?g|webp)$/i,'').replace(/\.render$/i,'').replace(/_AI三角阵列_\d+$/i,'').replace(/_v\d+$/i,'').replace(/[_ -](?:参考|reference|concept)(?:[_ -].*)?$/i,'').replace(/_v\d+$/i,'').normalize('NFC').trim();
}
function safeName(value) {
  if (typeof value !== 'string') throw new Error('请提供图片或模型的主体名称');
  value = value.normalize('NFC').trim();
  if (!value || value.length > 80 || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) || value === '.') throw new Error('主体名称不能包含路径、保留名称或特殊文件字符');
  return value;
}
const key = value => subjectName(value).toLocaleLowerCase('en-US');
function imageRole(name) { return /(?:^|[_ -])(?:参考|reference|concept)(?:[_ .-]|$)/i.test(path.parse(name).name) ? 'reference' : 'render'; }
function inferSubject(request, fallback) {
  const quoted = /[“「『"]([^”」』"\n]{1,60})[”」』"]/.exec(request)?.[1];
  const named = /(?:主体|对象|命名|名字)(?:为|是|叫|[:：])\s*([^，。；\n]{1,60})/.exec(request)?.[1];
  const value = named || quoted;
  if (value) { try { return safeName(subjectName(value)); } catch {} }
  return subjectName(fallback) || '图片';
}
function ensureRelations(document) {
  for (const image of document.renders) {
    image.imageRole ||= imageRole(image.path);
    image.subject ||= subjectName(image.path);
  }
  for (const model of document.models) {
    model.subject ||= subjectName(model.path);
    if (!Array.isArray(model.referenceIds)) model.referenceIds = document.renders.filter(r => r.imageRole === 'reference' && key(r.subject) === key(model.subject)).map(r => r.id);
    model.referenceIds = [...new Set(model.referenceIds)].filter(id => document.renders.some(r => r.id === id && r.imageRole === 'reference'));
  }
}
function autoReference(document, image) {
  if (image.imageRole !== 'reference') return;
  for (const model of document.models) if (model.referenceBinding !== 'manual' && key(model.subject) === key(image.subject)) model.referenceIds = [...new Set([...(model.referenceIds || []),image.id])];
}
module.exports = { subjectName, safeName, key, imageRole, inferSubject, ensureRelations, autoReference };
