const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const FILE = 'look-review.json';
const STAGES = [
  { file: 'blockout.png', label: '灰模与机位' },
  { file: 'first-render.png', label: '首轮成图' }
];
const categories = { lighting: '灯光', material: '材质', effects: '光效', camera: '机位' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
const validDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

async function readReview(directory) {
  const file = path.join(directory, FILE);
  const real = await fs.realpath(file);
  const stat = await fs.stat(real);
  if (real !== file || !stat.isFile() || stat.size > 65536) throw new Error('复刻过程记录必须保存在复现目录');
  const review = JSON.parse(await fs.readFile(real, 'utf8'));
  const { anchors, trials, referenceSha256, finalSha256, summary } = review || {};
  if (review?.schemaVersion !== 1 || !validDigest(referenceSha256) || !validDigest(finalSha256) ||
      !Array.isArray(anchors) || !anchors.length || anchors.length > 16 || !anchors.every(validText) || !validText(summary) ||
      !Array.isArray(trials) || trials.length < 2 || trials.length > 12 ||
      trials.some(t => !t || !/^trial-[a-z0-9][a-z0-9-]{0,59}\.png$/.test(t.file) ||
        !Object.hasOwn(categories, t.category) || !validText(t.change) || !validText(t.observation)) ||
      new Set(trials.map(t => t.file)).size !== trials.length ||
      !Object.keys(categories).some(key => trials.filter(t => t.category === key).length >= 2)) {
    throw new Error('复刻过程需要原图观察、同类参数的至少两张候选图和最终对照结论');
  }
  return review;
}

async function verifyReview(directory, reference, final, validateImage) {
  const review = await readReview(directory).catch(error => {
    if (error.code === 'ENOENT') throw new Error('单图复刻缺少 look-review.json，请先保存试渲染与对照记录');
    throw error;
  });
  if (review.referenceSha256 !== reference.sha256 || review.finalSha256 !== final.sha256)
    throw new Error('复刻过程与本轮参考图或正式成图不一致');
  const seen = new Set([reference.sha256, final.sha256]);
  for (const { file } of [...STAGES, ...review.trials]) {
    const expected = path.join(directory, file);
    const real = await fs.realpath(expected).catch(() => null);
    if (real !== expected) throw new Error('缺少试渲染或路径无效：' + file);
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error('试渲染文件无效：' + file);
    const data = await fs.readFile(real);
    if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || !validateImage(data))
      throw new Error('试渲染不是可解码的 PNG：' + file);
    const sha = digest(data);
    if (seen.has(sha)) throw new Error('试渲染必须保留独立阶段的图像：' + file);
    seen.add(sha);
  }
  return path.join(directory, FILE);
}

async function previews(library, rootId, relative, renderHash, references) {
  if (!renderHash || !references.length) return null;
  const folder = path.parse(relative).name + '_reproduction';
  try {
    const directory = await library.resolve(rootId, folder);
    const review = await readReview(directory);
    const reference = references.find(r => r.renderSha256 === review.referenceSha256);
    if (renderHash !== review.finalSha256 || !reference) return null;
    const trials = review.trials.map(t => ({ file: t.file, label: categories[t.category] + ' · ' + t.change, note: t.observation }));
    const components = [];
    try {
      const workflow = JSON.parse(await fs.readFile(path.join(directory, 'component-workflow.json'), 'utf8'));
      if (workflow.schemaVersion === 1 && workflow.assembly?.files?.render?.sha256 === renderHash) for (const part of workflow.components || []) {
        const image = part.files?.render;
        if (!image) continue;
        const file = path.relative(directory, image.file).split(path.sep).join('/');
        if (!file || file.startsWith('..') || path.isAbsolute(file)) continue;
        const actual = await library.resolve(rootId, folder + '/' + file);
        if (digest(await fs.readFile(actual)) !== image.sha256) continue;
        components.push({ file, label: '独立部件 · ' + part.name, note: '单独建模并保存原工程后的实渲样片' });
      }
    } catch { /* Historical projects keep their existing process previews. */ }
    const entries = await Promise.all([STAGES[0], ...components, STAGES[1], ...trials].map(async item => {
      const real = await library.resolve(rootId, folder + '/' + item.file);
      if (real !== path.join(directory, item.file) || !(await fs.stat(real)).isFile()) throw new Error('试渲染已移动');
      return { label: item.label, note: item.note || '', url: `workbench://app/model/${rootId}/${encodeURIComponent(folder)}/${item.file.split('/').map(encodeURIComponent).join('/')}` };
    }));
    return { entries, summary: review.summary, referenceUrl: reference.renderUrl };
  } catch { return null; }
}

module.exports = { FILE, STAGES, verifyReview, previews };
