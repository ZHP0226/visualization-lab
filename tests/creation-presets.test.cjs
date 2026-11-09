const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DIRECTORY, publicOptions, previewFile, CREATION_INSTRUCTIONS } = require('../electron/creation-presets.cjs');
test('material choices ship six real previews and two native recipes with one shared GLB', () => {
  const categories = publicOptions();
  assert.deepEqual(categories.map(c => c.id), ['software', 'material', 'lighting']);
  assert.deepEqual(categories[0].options.map(o => o.id), ['blender', 'c4d']);
  const materials = categories[1].options;
  assert.equal(materials.length, 6);
  for (const m of materials) {
    assert.ok(m.description); assert.ok(m.preview.endsWith(`${m.id}.png`));
    assert.equal(fs.readFileSync(previewFile(m.id+'.png')).subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  }
  for (const software of ['blender','c4d']) assert.match(fs.readFileSync(path.join(DIRECTORY, software+'_materials.py'),'utf8'), /def create_material\(spec\)/);
  const glb = fs.readFileSync(path.join(DIRECTORY,'preview-sphere.glb'));
  const json = JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
  assert.equal(json.meshes.length,1); assert.equal(json.extensions.KHR_materials_variants.variants.length,6);
  assert.ok(!fs.readdirSync(DIRECTORY).some(n => /\.(?:blend|c4d|exr)$/i.test(n)));
});
test('preview lookup rejects arbitrary paths and unknown IDs', () => {
  for (const name of ['../catalog.json','M007.png','M001.png/../README.md','README.md',null]) assert.throws(() => previewFile(name));
});
test('both agent adapters receive material code paths and semantic default rules', () => {
  const rules = require('../electron/delivery.cjs').AGENT_INSTRUCTIONS;
  assert.ok(rules.includes(CREATION_INSTRUCTIONS));
  for (const text of ['不要重复询问','不要逐项追问','材质球','不能擅自替换整个场景','blender_materials.py','c4d_materials.py',DIRECTORY]) assert.ok(rules.includes(text),text);
  for (const file of ['codex.cjs','agents.cjs']) assert.match(fs.readFileSync(path.resolve(__dirname,'../electron',file),'utf8'), /AGENT_INSTRUCTIONS/);
});
test('lighting offers only two style goals with private adaptive rules and native previews', () => {
  const lighting = require('../electron/lighting-styles.cjs');
  const options = publicOptions().find(category => category.id === 'lighting').options;
  assert.deepEqual(options.map(o => o.label), ['白底棚', '暗室棚']);
  assert.deepEqual(options.map(o => o.id), ['white-studio', 'dark-studio']);
  for (const o of options) {
    assert.deepEqual(Object.keys(o).sort(), ['description','id','label','preview']);
    const data = fs.readFileSync(lighting.previewFile(o.id+'.png'));
    assert.equal(data.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(lighting.DIRECTORY,'provenance.json'),'utf8'));
  for (const o of options) assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(lighting.previewFile(o.id+'.png'))).digest('hex'), provenance.previews.find(p => p.id === o.id).sha256);
  const rules = require('../electron/delivery.cjs').AGENT_INSTRUCTIONS;
  assert.ok(rules.includes(lighting.LIGHTING_STYLE_INSTRUCTIONS));
  for (const phrase of ['实际包围盒','材质与布光独立','低成本试渲染并查看成图','不得照搬样片','纯生图时','未选风格时','不授权改变模型结构']) assert.ok(rules.includes(phrase),phrase);
  assert.ok(!rules.includes('“斜上逆侧单灯”保留唯一大面积灯'));
});
test('lighting preview whitelist rejects paths, arbitrary resources and unknown styles', () => {
  const lighting = require('../electron/lighting-styles.cjs');
  for (const name of ['../library.json','white-studio.png/../library.json','glass.png','WHITE-STUDIO.png','white-studio.png?x',null]) assert.throws(() => lighting.previewFile(name));
});
