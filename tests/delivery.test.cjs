const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileLibrary } = require('../electron/files.cjs');
const { ProjectStore } = require('../electron/projects.cjs');
const { DeliveryManager, baseName, renderRequested, AGENT_INSTRUCTIONS } = require('../electron/delivery.cjs');
const { deliveryIntent } = require('../electron/delivery-policy.cjs');
const { readGLB } = require('../electron/model-edit.cjs');
function movedModel(buffer) {
  const { json, binary } = readGLB(buffer); json.nodes[0].translation = [0.125, 0, 0];
  const text = Buffer.from(JSON.stringify(json)), body = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32); text.copy(body);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + body.length + binary.length, 8); header.writeUInt32LE(body.length, 12); header.writeUInt32LE(0x4e4f534a, 16); binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, body, binHeader, binary]);
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-delivery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = new FileLibrary(), projects = new ProjectStore(library), project = await projects.create('芯片测试', root);
  const manager = new DeliveryManager({ projects, library, backupDirectory: path.join(root, 'backups') });
  const glb = await fs.readFile(path.join(__dirname, '../assets/library/示例模型/光子芯片.glb'));
  const png = await fs.readFile(path.join(__dirname, '../assets/icon.png'));
  return { root, projects, project, manager, glb, png };
}
test('format, same-stem pairing, native project and version rules are enforced before registration', async t => {
  const { projects, project, manager, glb, png } = await fixture(t);
  const delivery = await manager.prepare({ projectId: project.id }, '新建芯片并渲染');
  assert.equal(delivery.stem, '芯片测试_v001'); assert.equal(delivery.renderRequired, true);
  await fs.writeFile(delivery.output.model, glb);
  await fs.writeFile(path.join(project.directory, 'wrong-name.png'), png);
  await assert.rejects(manager.publish(delivery, 'none'), /缺少交付文件.*v001.png/);
  assert.equal((await projects.snapshot(project.id)).models.length, 0);
  await fs.writeFile(delivery.output.render, png);
  await assert.rejects(manager.publish(delivery, 'blend'), /缺少交付文件.*blend/);
  await fs.writeFile(delivery.output.blend, Buffer.from('BLENDER-v500test-native-header'));
  const update = await manager.publish(delivery, 'blend');
  assert.equal(update.delivery.renderIncluded, true);
  assert.equal(update.project.models[0].nativeSource, '芯片测试_v001.blend');
  assert.equal(update.project.links[update.model.assetId], update.project.renders[0].id);
  assert.ok(new URL(update.model.renderUrl).pathname.endsWith('v001.png'));
  const next = await manager.prepare({ projectId: project.id, assetId: update.model.assetId }, '只修改模型，不渲染');
  assert.equal(next.stem, '芯片测试_v002'); assert.equal(next.renderRequired, false);
  assert.equal(next.protectedFiles.length, 3);
  await fs.writeFile(next.output.model, movedModel(glb));
  const second = await manager.publish(next, 'none');
  assert.equal(second.model.renderUrl, null);
  assert.equal(second.project.models.length, 2);
  assert.equal(second.project.renders.length, 1);
});
test('a standalone concept reference registers only an image and never creates or pairs a model', async t => {
  const { projects, project, manager, png } = await fixture(t);
  const delivery = await manager.prepare({ projectId: project.id }, '先制作一张 Nature 风格概念参考图，暂时不要建模');
  await fs.writeFile(delivery.output, png);
  assert.ok((await manager.finish(delivery)).image);
  const after = await projects.snapshot(project.id);
  assert.equal(after.models.length, 0);
  assert.equal(after.references.length, 1);
  assert.deepEqual(after.links, {});
  assert.deepEqual((await fs.readdir(project.directory)).filter(name => /\.(glb|blend|c4d)$/i.test(name)), []);
});

test('invalid geometry, fake PNG and a changed original are rejected; the original backup survives', async t => {
  const { projects, project, manager, glb, png } = await fixture(t);
  const delivery = await manager.prepare({ projectId: project.id }, '渲染');
  await fs.writeFile(delivery.output.model, 'not a model');
  await assert.rejects(manager.publish(delivery), /GLB/);
  await fs.writeFile(delivery.output.model, glb); await fs.writeFile(delivery.output.render, 'not a PNG');
  await assert.rejects(manager.publish(delivery), /PNG/);
  await fs.writeFile(delivery.output.render, png);
  const original = await manager.publish(delivery);
  const next = await manager.prepare({ projectId: project.id, assetId: original.model.assetId }, '修改模型');
  await fs.writeFile(next.output.model, glb);
  await fs.writeFile(delivery.output.model, 'overwritten');
  await assert.rejects(manager.publish(next), /输入原件发生变化/);
  assert.deepEqual(await fs.readFile(next.protectedFiles[0].backup), glb);
  assert.equal((await projects.snapshot(project.id)).models.length, 1);
});
test('completed native commands can be auto-registered only after required outputs exist', async t => {
  const { project, manager, glb, png } = await fixture(t);
  const delivery = await manager.prepare({ projectId: project.id }, '渲染');
  assert.equal(await manager.finish(delivery), null);
  await fs.writeFile(path.join(project.directory, 'wrong.gltf'), '{}');
  await assert.rejects(manager.finish(delivery), /规范命名的 GLB/);
  await fs.writeFile(delivery.output.model, glb);
  await assert.rejects(manager.finish(delivery), /缺少交付文件/);
  await fs.writeFile(delivery.output.render, png);
  assert.equal((await manager.finish(delivery)).delivery.renderIncluded, true);
  assert.equal(await manager.finish(delivery), null);
});
test('existing AI names become versioned subject names and explicit no-render requests stay optional', () => {
  assert.equal(baseName('第2期_金块布光_AI三角阵列_123456.glb'), '第2期_金块布光');
  assert.equal(baseName('芯片_v012.glb'), '芯片');
  assert.equal(baseName('版本1.0'), '版本1.0');
  assert.equal(renderRequested('修改并渲染成图'), true);
  assert.equal(renderRequested('先不需要渲染'), false);
});

async function seeded(t, rendered = false) {
  const f = await fixture(t), first = await f.manager.prepare({ projectId: f.project.id }, '新建芯片');
  await fs.writeFile(first.output.model, f.glb);
  await fs.writeFile(first.output.blend, Buffer.from('BLENDER-v500original-native'));
  if (rendered) await fs.writeFile(first.output.render, f.png);
  const update = await f.manager.publish(first, 'blend');
  return { ...f, first, update, context: { projectId: f.project.id, assetId: update.model.assetId } };
}

test('conversation, environment checks and software confirmation do not create or register versions', async t => {
  const { manager, projects, project, context } = await seeded(t);
  for (const text of ['你好', '解释当前结构', '先检查一下环境', '用Blender']) {
    const delivery = await manager.prepare(context, text);
    assert.equal(delivery.mode, 'none'); assert.equal(delivery.public.output, null); assert.equal(delivery.stem, null);
    assert.equal(await manager.finish(delivery), null);
  }
  assert.equal((await projects.snapshot(project.id)).models.length, 1);
  assert.ok(!(await fs.readdir(project.directory)).some(name => /_v002/.test(name)));
  assert.equal((await manager.prepare(context, '把模型改为三角形')).stem, '芯片测试_v002');
});

test('render-only fills the current-version PNG with no duplicate GLB or native project export', async t => {
  const { manager, projects, project, context, first, glb, png } = await seeded(t);
  const delivery = await manager.prepare(context, '只渲染一下成图，不要修改模型');
  assert.equal(delivery.mode, 'render_only'); assert.equal(delivery.stem, '芯片测试_v001');
  assert.deepEqual(Object.keys(delivery.public.output), ['render']);
  await fs.writeFile(delivery.output.render, png);
  const result = await manager.finish(delivery), after = await projects.snapshot(project.id);
  assert.equal(after.models.length, 1); assert.equal(result.model.assetId, context.assetId); assert.equal(after.renders[0].path, '芯片测试_v001.png');
  assert.equal(result.delivery.mode, 'render_only'); assert.deepEqual(await fs.readFile(first.output.model), glb);
  const repeat = await manager.prepare(context, '重新渲染'); assert.equal(await manager.finish(repeat), null);
  await fs.writeFile(repeat.output.render, png); await fs.utimes(repeat.output.render, new Date(), new Date(Date.now() + 1000));
  assert.equal((await manager.finish(repeat)).model.assetId, context.assetId);
  assert.equal((await projects.snapshot(project.id)).models.length, 1);
  assert.ok(!(await fs.readdir(project.directory)).some(n => /_v002/.test(n)));
});

test('explicit same-version model edits update the original entry, back up inputs and invalidate old renders durably', async t => {
  const { manager, projects, project, context, first, glb, png, update } = await seeded(t, true);
  const delivery = await manager.prepare(context, '在这一版基础上修改，不改版本号，不需要渲染');
  assert.equal(delivery.mode, 'in_place'); assert.equal(delivery.output.model, first.output.model);
  await fs.writeFile(delivery.output.model, movedModel(glb));
  await fs.writeFile(delivery.output.blend, Buffer.from('BLENDER-v500modified-native'));
  const result = await manager.finish(delivery);
  assert.equal(result.model.assetId, context.assetId); assert.equal(result.model.name, '芯片测试_v001.glb'); assert.equal(result.model.renderUrl, null);
  assert.equal(result.delivery.renderInvalidated, true);
  const refreshed = await projects.refresh(project.id); assert.equal(refreshed.models.length, 1); assert.equal(refreshed.links[context.assetId], undefined);
  assert.equal(refreshed.renders[0].stale, true); assert.deepEqual(await fs.readFile(first.output.render), png);
  assert.deepEqual(await fs.readFile(delivery.protectedFiles.find(p => p.file === first.output.model).backup), glb);
  assert.notEqual(result.model.url, update.model.url);
  const render = await manager.prepare(context, '补渲染成图'); await fs.writeFile(render.output.render, png); await fs.utimes(render.output.render, new Date(), new Date(Date.now() + 1000));
  const rendered = await manager.finish(render); assert.equal(rendered.model.renderStale, false); assert.equal((await projects.snapshot(project.id)).models.length, 1);
  assert.equal(new URL(rendered.model.url).searchParams.get('revision'), rendered.model.sha256);
});

test('a pending explicit keep-version task survives a software-choice round trip and clears after actual delivery', async t => {
  const { manager, context, glb, png } = await seeded(t);
  const task = await manager.prepare(context, '修改模型，保持当前版本并渲染');
  assert.equal(task.mode, 'in_place'); assert.equal(await manager.finish(task), null);
  const continued = await manager.prepare(context, 'Blender');
  assert.equal(continued.mode, 'in_place'); assert.equal(continued.renderRequired, true);
  await fs.writeFile(continued.output.model, movedModel(glb)); await fs.writeFile(continued.output.render, png);
  await manager.finish(continued);
  assert.equal((await manager.prepare(context, '你好')).mode, 'none');
  assert.equal((await manager.prepare(context, '再把模型改成圆形')).mode, 'revision');
});

test('byte-identical model copies do not manufacture revisions, and a copied-model render stays on the source version', async t => {
  const { manager, context, project, projects, glb, png } = await seeded(t);
  const noop = await manager.prepare(context, '修改模型'); await fs.writeFile(noop.output.model, glb);
  assert.equal(await manager.finish(noop), null); await assert.rejects(fs.stat(noop.output.model), { code: 'ENOENT' });
  const rendered = await manager.prepare(context, '修改模型并渲染'); await fs.writeFile(rendered.output.model, glb); await fs.writeFile(rendered.output.render, png);
  const result = await manager.finish(rendered); assert.equal(result.delivery.mode, 'render_only'); assert.equal(result.model.assetId, context.assetId);
  assert.equal((await projects.snapshot(project.id)).models.length, 1); assert.ok(!(await fs.readdir(project.directory)).some(n => /_v002/.test(n)));
});

test('render-only never authorizes geometry changes and ordinary edits cannot overwrite the source', async t => {
  const { manager, context, first, glb } = await seeded(t);
  for (const request of ['只渲染', '修改模型，不要覆盖当前模型']) {
    const delivery = await manager.prepare(context, request); assert.equal(delivery.keepAuthorized, false);
    await fs.writeFile(first.output.model, movedModel(glb));
    await assert.rejects(manager.finish(delivery), /输入原件发生变化/); await fs.writeFile(first.output.model, glb);
  }
});

test('user intent overrides generated wrappers, and script-first delivery rules cover both render and model operations', () => {
  assert.equal(deliveryIntent('修改模型，不要覆盖当前模型').keepVersion, false);
  assert.equal(deliveryIntent('在这一版基础上修改，不改版本号').keepVersion, true);
  assert.equal(deliveryIntent('不新增一个版本，只修改模型').keepVersion, true);
  assert.equal(deliveryIntent('不要修改模型，只渲染').operation, 'render_only');
  assert.ok(AGENT_INSTRUCTIONS.includes('--background/--python'));
  assert.ok(AGENT_INSTRUCTIONS.includes('不要默认使用computer-use'));
  assert.ok(AGENT_INSTRUCTIONS.includes('不增加模型版本'));
});

test('direct GLB in-place changes never silently render the now-outdated native project', async t => {
  const { manager, context, glb, project, projects } = await seeded(t, true);
  const change = await manager.prepare(context, '修改模型，不改版本号，不渲染');
  await fs.writeFile(change.output.model, movedModel(glb)); await manager.finish(change);
  assert.equal((await projects.snapshot(project.id)).models[0].nativeStale, true);
  const render = await manager.prepare(context, '只渲染');
  assert.equal(render.public.nativeSource, null); assert.equal(render.public.nativeSourceStale, true); assert.ok(render.public.staleNativeReference.endsWith('.blend'));
});

test('same-version PNG collisions cannot overwrite an image paired to another model, including identical-model normalization', async t => {
  const { manager, context, project, projects, glb, png, first } = await seeded(t, true);
  await fs.writeFile(path.join(project.directory, '其他模型.glb'), glb); await fs.writeFile(path.join(project.directory, '其他图片.png'), png);
  let current = await projects.refresh(project.id), second = current.models.find(m => m.name === '其他模型.glb'), originalImage = current.renders.find(r => r.name === '芯片测试_v001.png'), otherImage = current.renders.find(r => r.name === '其他图片.png');
  await projects.bind(project.id, context.assetId, otherImage.id); await projects.bind(project.id, second.id, originalImage.id);
  const before = (await fs.stat(first.output.render, { bigint: true })).mtimeNs;
  await assert.rejects(manager.prepare(context, '只渲染'), /配对其他模型/);
  const edit = await manager.prepare(context, '修改模型并渲染'); await fs.writeFile(edit.output.model, glb); await fs.writeFile(edit.output.render, png);
  await assert.rejects(manager.finish(edit), /配对其他模型/);
  assert.equal((await fs.stat(first.output.render, { bigint: true })).mtimeNs, before); assert.deepEqual(await fs.readFile(first.output.render), png);
});

test('an explicit save-as-new-version request can intentionally duplicate an unchanged model', async t => {
  const { manager, context, glb, projects, project } = await seeded(t);
  const copy = await manager.prepare(context, '另存为v002');
  assert.equal(copy.mode, 'revision'); assert.equal(copy.intent.forceRevision, true);
  await fs.writeFile(copy.output.model, glb); const result = await manager.finish(copy);
  assert.notEqual(result.model.assetId, context.assetId); assert.equal((await projects.snapshot(project.id)).models.length, 2);
});

test('semantic plan choices require a real user version quote and cannot fabricate overwrite consent', async t => {
  const { manager, context } = await seeded(t);
  const task = await manager.prepare(context, '修改模型，但别碰版本这个标签');
  manager.plan(task, 'model_edit', { keepVersion: true, userQuote: '别碰版本这个标签' });
  assert.equal(task.mode, 'in_place');
  const ordinary = await manager.prepare(context, '你好');
  assert.throws(() => manager.plan(ordinary, 'model_edit', { keepVersion: true, userQuote: '不改版本号' }), /逐字引用/);
});
