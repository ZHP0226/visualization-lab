const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readGLB } = require('./model-edit.cjs');
const sha = data => createHash('sha256').update(data).digest('hex');
const FILE = 'component-workflow.json';
const stable = value => JSON.stringify(value, (_key, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function validateComponents(plan) {
  const parts = plan.components, seen = new Set(), ids = new Set(), known = new Set(plan.objects.map(o => o.id));
  if (!Array.isArray(parts) || !parts.length || parts.length > 64) throw new Error('先拆分独立部件：components 需要部件 ID、名称与 objectIds');
  for (const part of parts) {
    if (!part || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(part.id) || ids.has(part.id.toLowerCase()) || !part.name?.trim() || !Array.isArray(part.objectIds) || !part.objectIds.length) throw new Error('独立部件需要唯一 ID、名称和对象清单');
    ids.add(part.id.toLowerCase());
    for (const id of part.objectIds) {
      if (!known.has(id) || seen.has(id)) throw new Error('部件对象必须完整、不重复地覆盖结构清单');
      seen.add(id);
    }
  }
  if (seen.size !== known.size || known.size > 1 && parts.length < 2) throw new Error('多个对象必须拆成至少两个独立部件，不能把整场冒充一个部件');
  return parts;
}
async function checkedFile(root, item, extension) {
  if (!item || typeof item.file !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('独立建模文件记录缺失');
  const file = path.resolve(item.file), rel = path.relative(root, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || extension && !file.endsWith(extension) || await fs.realpath(file) !== file) throw new Error('部件文件必须保存在本轮复现目录中，不能借用外部文件');
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error('独立部件文件无效或过大');
  const data = await fs.readFile(file);
  if (sha(data) !== item.sha256) throw new Error('部件文件已经变化，请重新核验：' + path.basename(file));
  return data;
}
async function verifyStage(root, item, software, code, version, validatePlan, validateImage, imagesRequired) {
  if (item?.software !== software) throw new Error('独立部件使用的软件与最终原工程不一致');
  const planData = await checkedFile(root, item.files?.plan, '.json'), plan = validatePlan(JSON.parse(planData));
  const audit = JSON.parse(await checkedFile(root, item.files?.audit, '.json'));
  if (!audit.nativeReopened || audit.frameworkVersion !== version || audit.software !== software || audit.planSha256 !== sha(planData) || !audit.softwareVersion) throw new Error('部件缺少真实原工程重开及对应方案审计');
  const directory = path.dirname(item.files.plan.file);
  for (const name of code) {
    const data = await fs.readFile(path.join(directory, name));
    if (audit.codeHashes?.[name] !== sha(data) || sha(data) !== sha(await fs.readFile(path.join(__dirname, '../assets/modeling-framework', name)))) throw new Error('部件复现代码与当前版本不一致');
  }
  const scripts = (await fs.readdir(directory, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.py')).map(e => e.name);
  if (scripts.length !== Object.keys(audit.projectCodeHashes || {}).length) throw new Error('部件项目脚本清单不一致');
  for (const name of scripts) if (audit.projectCodeHashes[name] !== sha(await fs.readFile(path.join(directory, name)))) throw new Error('部件脚本变化后尚未重新核验');
  for (const [role, extension] of [['native', software === 'blender' ? '.blend' : '.c4d'], ['model', '.glb'], ['render', '.png']]) {
    if (role === 'render' && !item.files.render && !imagesRequired) continue;
    const data = await checkedFile(root, item.files[role], extension), record = audit.files?.[role];
    if (record?.sha256 !== sha(data) || record.name !== path.basename(item.files[role].file)) throw new Error('部件原工程、预览或 GLB 与审计不一致');
    if (role === 'render' && (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || !validateImage(data))) throw new Error('部件预览必须是实际可解码的 PNG');
    if (role === 'model') {
      const { json, binary } = readGLB(data), nodes = json.nodes.filter(n => n.mesh !== undefined);
      if (nodes.length !== plan.objects.length || audit.geometry?.length !== plan.objects.length) throw new Error('部件实际几何数与独立方案不符');
      for (const object of plan.objects) {
        const node = nodes.find(n => n.extras?.workbench_id === object.id), geometry = audit.geometry.find(g => g.id === object.id);
        if (!node || !geometry || geometry.vertices < 3 || geometry.triangles < 1) throw new Error('部件的实际对象 ID 缺失');
        const primitive = json.meshes[node.mesh]?.primitives?.[0], accessor = json.accessors[primitive?.attributes?.POSITION], view = json.bufferViews[accessor?.bufferView];
        if (!accessor || !view || accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.count !== geometry.triangles * 3 || view.byteStride && view.byteStride !== 12) throw new Error('部件 GLB 与三角网格审计不一致');
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
        for (let i = 0; i < accessor.count; i++) for (let j = 0; j < 3; j++) {
          const v = binary.readFloatLE(offset + i * 12 + j * 4); if (!Number.isFinite(v)) throw new Error('部件含非有限坐标'); low[j] = Math.min(low[j], v); high[j] = Math.max(high[j], v);
        }
        for (let j = 0; j < 3; j++) if (!Number.isFinite(geometry.bounds?.[0]?.[j]) || !Number.isFinite(geometry.bounds?.[1]?.[j]) || Math.abs(low[j] - Math.fround(geometry.bounds[0][j])) > Math.max(1e-5, object.size[j] * 1e-5) || Math.abs(high[j] - Math.fround(geometry.bounds[1][j])) > Math.max(1e-5, object.size[j] * 1e-5)) throw new Error('部件 GLB 与原工程几何包围盒不一致');
      }
    }
  }
  if (stable(item.objectIds?.slice().sort()) !== stable(plan.objects.map(o => o.id).sort())) throw new Error('独立工程记录的对象清单不一致');
  return { plan, audit };
}
async function verifyWorkflow(directory, delivery, plan, audit, artifacts, code, version, validatePlan, validateImage) {
  const parts = validateComponents(plan), file = path.join(directory, FILE);
  let data;
  try { data = await fs.readFile(file); } catch { throw new Error('缺少独立部件建模记录 component-workflow.json；不能直接用整场工程交付'); }
  if (await fs.realpath(file) !== file || data.length > 2 * 1024 * 1024) throw new Error('部件流程记录路径或大小无效');
  const record = JSON.parse(data), imagesRequired = !!artifacts.render;
  if (record.schemaVersion !== 1 || record.frameworkVersion !== version || record.planSha256 !== sha(await fs.readFile(path.join(directory, 'structure.json'))) || record.software !== audit.software) throw new Error('拆分建模记录与当前结构方案或软件不一致');
  const gray = await verifyStage(directory, record.blockout, audit.software, code, version, validatePlan, validateImage, imagesRequired);
  const grayObjects = plan.objects.map(o => ({ ...o, material: 'blockout_gray', ...(o.shape === 'custom' ? { shape: 'box' } : {}) }));
  if (stable(gray.plan.objects) !== stable(grayObjects) || stable(gray.plan.camera) !== stable(plan.camera)) throw new Error('灰模构图、对象或锁定相机与最终结构不一致');
  if (!Array.isArray(record.components) || record.components.length !== parts.length || new Set(record.components.map(c => c.id)).size !== parts.length) throw new Error('每个独立部件都须保存自己的工程与检查记录');
  const sources = [], nativeHashes = new Set();
  for (const part of parts) {
    const entry = record.components.find(c => c.id === part.id), result = await verifyStage(directory, entry, audit.software, code, version, validatePlan, validateImage, imagesRequired);
    const objects = plan.objects.filter(o => part.objectIds.includes(o.id)), materials = plan.materials.filter(m => objects.some(o => o.material === m.id));
    if (stable(result.plan.objects) !== stable(objects) || stable(result.plan.materials) !== stable(materials) || stable(entry.objectIds?.slice().sort()) !== stable(part.objectIds.slice().sort()) || stable(result.plan.reference || null) !== stable(plan.reference || null)) throw new Error('部件几何、材质或参考来源与当前拆分不一致：' + part.id);
    const hash = entry.files.native.sha256;
    if (nativeHashes.has(hash)) throw new Error('不能把同一整场工程的副本当成多个独立部件');
    nativeHashes.add(hash); sources.push({ id: part.id, objectIds: part.objectIds, nativeSha256: hash });
  }
  const expected = { method: 'native-component-import', sources };
  if (stable(audit.assembly) !== stable(expected) || stable(record.assembly?.sources) !== stable(sources) || record.assembly?.method !== expected.method || stable(record.assembly?.files) !== stable(audit.files)) throw new Error('最终场景必须由已保存的独立原工程组装，组装来源与当前部件不符');
  if (record.blockout.files.render && sha(await fs.readFile(path.join(directory, 'blockout.png'))) !== record.blockout.files.render.sha256) throw new Error('灰模预览与独立灰模工程不一致');
  return { record: file, componentCount: parts.length, stages: ['拆解参考', '建立灰模', '分别建模', '组装渲染并完善细节'] };
}
module.exports = { FILE, stable, validateComponents, verifyWorkflow };
