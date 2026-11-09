const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readGLB } = require('./model-edit.cjs');
const VERSION = '1.0.0';
const DIRECTORY = path.resolve(__dirname, '../assets/modeling-framework');
const CODE = ['common.py', 'run.py', 'blender_adapter.py', 'c4d_adapter.py'];
const sha = data => createHash('sha256').update(data).digest('hex');
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
function validatePlan(p) {
  if (p?.schemaVersion !== 1 || p.coordinateSystem !== 'Z_UP_RIGHT_HANDED' || !p.subject?.trim() || !Array.isArray(p.assumptions) || p.assumptions.some(s => typeof s !== 'string')) throw new Error('结构方案需要主题、坐标系与明确的假设清单');
  if (!Array.isArray(p.materials) || !p.materials.length || new Set(p.materials.map(m => m.id)).size !== p.materials.length || p.materials.some(m => !m.id || !vector(m.color) || m.color.some(c => c < 0 || c > 1) || ['metallic','roughness'].some(k => m[k] !== undefined && (!Number.isFinite(m[k]) || m[k] < 0 || m[k] > 1)))) throw new Error('材质ID、颜色或参数无效');
  if (!Array.isArray(p.objects) || !p.objects.length || p.objects.length > 10000 || new Set(p.objects.map(o => o.id)).size !== p.objects.length || p.objects.some(o => !/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(o.id) || !['box','sphere','cylinder','custom'].includes(o.shape) || !p.materials.some(m => m.id === o.material) || !vector(o.position) || !vector(o.size) || o.size.some(s => s <= 0))) throw new Error('对象清单需要唯一稳定ID、形状、位置、尺寸与有效材质');
  const c = p.camera, r = p.render;
  if (!c || !vector(c.position) || !vector(c.target) || c.position.every((v,i) => v === c.target[i]) || !['perspective','orthographic'].includes(c.projection) || ['focalLength','scale'].some(k => c[k] !== undefined && (!Number.isFinite(c[k]) || c[k] <= 0))) throw new Error('相机参数无效');
  if (!r || !Number.isInteger(r.width) || !Number.isInteger(r.height) || r.width < 16 || r.width > 8192 || r.height < 16 || r.height > 8192 || !Number.isInteger(r.samples) || r.samples < 1 || r.samples > 4096 || !Number.isInteger(r.seed) || r.seed < 0 || r.seed >= 2147483647) throw new Error('渲染尺寸、采样与种子无效');
  if (!Array.isArray(p.lights) || !p.lights.length || p.lights.some(l => !vector(l.position) || !vector(l.color) || l.color.some(c => c < 0 || c > 1) || !Number.isFinite(l.power) || l.power <= 0 || !Number.isFinite(l.size) || l.size <= 0)) throw new Error('需要明确的灯光布局');
  if (!p.review || !['pending','reviewed'].includes(p.review.status) || !Array.isArray(p.review.differences) || p.review.differences.some(s => typeof s !== 'string')) throw new Error('需要记录成图核对状态与剩余差异，不得自动宣称视觉验收通过');
  return p;
}
function context(delivery) {
  return { version: VERSION, directory: DIRECTORY, required: !!delivery.reference,
    stages: ['拆解整体结构并保存structure.json', '复用代码建模、重开原工程、导出与实际渲染并核验audit.json'],
    guide: path.join(DIRECTORY, 'README.md'), example: path.join(DIRECTORY, 'example.structure.json'),
    sourceImage: delivery.reference || null, limitation: '基础适配器支持box/sphere/cylinder；复杂几何需项目脚本扩展并沿用审计。跨软件材质和渲染不承诺一致，单图隐藏结构为显式假设。' };
}
function folder(delivery) { return path.join(delivery.public.projectDirectory, delivery.stem + '_reproduction'); }
async function savePlan(delivery, raw) {
  if (!delivery || delivery.kind === 'image' || !delivery.stem || delivery.mode === 'render_only') throw new Error('先规划model_edit，再保存结构拆解方案');
  const plan = validatePlan(typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw));
  plan.frameworkVersion = VERSION; plan.reference = delivery.reference || null;
  const directory = folder(delivery); await fs.mkdir(directory, { recursive: true });
  for (const name of [...CODE, 'README.md', 'example.structure.json']) await fs.copyFile(path.join(DIRECTORY, name), path.join(directory, name));
  const file = path.join(directory, 'structure.json'); await fs.writeFile(file, JSON.stringify(plan, null, 2) + '\n');
  return { saved: true, stage: '结构拆解已保存，尚未建模或完成视觉验收', directory, plan: file, runner: path.join(directory, 'run.py'), outputStem: path.join(delivery.public.projectDirectory, delivery.stem), next: '选定软件后用run.py调用已安装软件；自定义建模复用common.py审计，生成audit.json后再登记。' };
}
async function verify(delivery, artifacts) {
  if (delivery.mode === 'render_only') return null;
  const directory = folder(delivery), auditFile = path.join(directory, 'audit.json');
  let audit;
  try { audit = JSON.parse(await fs.readFile(auditFile, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && !delivery.reference) return null; throw new Error('参考图建模需先保存结构拆解，并完成原工程重开与成图审计：缺少有效audit.json'); }
  const file = path.join(directory, 'structure.json'), data = await fs.readFile(file), p = validatePlan(JSON.parse(data));
  for (const name of CODE) if (sha(await fs.readFile(path.join(directory, name))) !== sha(await fs.readFile(path.join(DIRECTORY, name))) || audit.codeHashes?.[name] !== sha(await fs.readFile(path.join(directory, name)))) throw new Error('复现目录中的框架代码与当前版本不符；扩展请用独立项目脚本，保留基础工具原件');
  const scripts = (await fs.readdir(directory, { withFileTypes: true })).filter(e => e.isFile() && e.name.endsWith('.py')).map(e => e.name);
  if (!audit.projectCodeHashes || scripts.length !== Object.keys(audit.projectCodeHashes).length) throw new Error('项目复现脚本清单与审计不一致');
  for (const name of scripts) if (audit.projectCodeHashes[name] !== sha(await fs.readFile(path.join(directory, name)))) throw new Error('项目建模脚本已改变，请重新生成审计：' + name);
  if (audit.frameworkVersion !== VERSION || audit.planSha256 !== sha(data) || !audit.nativeReopened || !audit.softwareVersion || !['blender','c4d'].includes(audit.software)) throw new Error('框架版本、结构方案或原工程重开记录不一致');
  if (delivery.reference && (p.reference?.sha256 !== delivery.reference.sha256 || p.reference?.file !== delivery.reference.file || audit.reference?.sha256 !== delivery.reference.sha256 || sha(await fs.readFile(delivery.reference.file)) !== delivery.reference.sha256)) throw new Error('结构拆解的参考图片不一致或已变化');
  for (const key of ['model','native','render']) {
    const item = artifacts[key], record = audit.files?.[key];
    if (item ? record?.name !== item.name || record?.sha256 !== item.sha256 : !!record) throw new Error('模型、原工程或成图与审计哈希不一致：' + key);
  }
  if (!artifacts.native || !artifacts.native.name.endsWith(audit.software === 'blender' ? '.blend' : '.c4d')) throw new Error('框架建模必须交付对应软件的原工程');
  if (delivery.reference && !artifacts.render) throw new Error('参考图建模必须实际渲染PNG以核对成图');
  if (audit.renderSettings?.width !== p.render.width || audit.renderSettings?.height !== p.render.height) throw new Error('实际渲染设置与方案不符');
  const { json, binary: bin } = readGLB(artifacts.model.data), objects = json.nodes.filter(n => n.mesh !== undefined);
  if (objects.length !== p.objects.length || new Set(objects.map(n => n.extras?.workbench_id)).size !== p.objects.length || !Array.isArray(audit.geometry) || audit.geometry.length !== p.objects.length) throw new Error('实际GLB对象数或稳定ID与结构清单不一致');
  for (const o of p.objects) {
    const node = objects.find(n => n.extras?.workbench_id === o.id), check = audit.geometry.find(g => g.id === o.id);
    if (!node || !check || check.vertices < 3 || check.triangles < 1 || !Array.isArray(check.bounds) || !check.bounds.every(vector)) throw new Error('对象审计缺失：' + o.id);
    const primitive = json.meshes[node.mesh]?.primitives?.[0], accessor = json.accessors[primitive?.attributes?.POSITION], view = json.bufferViews[accessor?.bufferView];
    if (!accessor || accessor.componentType !== 5126 || accessor.type !== 'VEC3' || accessor.count !== check.triangles * 3 || !view || view.byteStride && view.byteStride !== 12) throw new Error('GLB三角网格与审计不符：' + o.id);
    const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity], offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    for (let i=0; i<accessor.count; i++) for (let j=0;j<3;j++) { const v=bin.readFloatLE(offset+i*12+j*4); if (!Number.isFinite(v)) throw new Error('GLB含非有限坐标'); low[j]=Math.min(low[j],v); high[j]=Math.max(high[j],v); }
    for (let j=0;j<3;j++) if (Math.abs(low[j]-check.bounds[0][j]) > Math.max(1e-5,o.size[j]*1e-5) || Math.abs(high[j]-check.bounds[1][j]) > Math.max(1e-5,o.size[j]*1e-5)) throw new Error('GLB几何包围盒与原工程审计不符：' + o.id);
  }
  return { version: VERSION, directory, plan: file, audit: auditFile, software: audit.software, review: p.review };
}
module.exports = { VERSION, DIRECTORY, CODE, validatePlan, context, savePlan, verify };
