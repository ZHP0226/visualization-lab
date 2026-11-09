const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { FileLibrary } = require('../electron/files.cjs');
const { ProjectStore } = require('../electron/projects.cjs');
const { DeliveryManager } = require('../electron/delivery.cjs');
const { formatEdit, parseEdits } = require('../electron/point-edit-data.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');
test('image generation and explicit image-to-model requests take different routes', () => {
  const { modelingRequested } = require('../electron/image-delivery.cjs');
  assert.equal(modelingRequested('把这张图做成一个三维模型'), true);
  assert.equal(modelingRequested('生成一张模型参考图'), false);
  assert.equal(modelingRequested('创建三维示意图'), false);
  assert.equal(modelingRequested('create a 3D model from this image'), true);
  assert.equal(modelingRequested('现在完成第一版可编辑模型和暗场成图'), true);
  assert.equal(modelingRequested('新建一个 C4D 三维模型'), true);
  assert.equal(modelingRequested('完成一张模型参考图'), false);
  assert.equal(modelingRequested('生成这个模型的概念参考图'), false);
  assert.equal(modelingRequested('不要建模，只生成一张暗场图片'), false);
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-images-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = new FileLibrary(), projects = new ProjectStore(library), project = await projects.create('独立图片', root);
  const manager = new DeliveryManager({ projects, library, backupDirectory: path.join(root, 'backups'), validateImage: b => b.length > 24 && b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', imageSize: b => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) }) });
  const png = await fs.readFile(path.join(__dirname, '../assets/icon.png'));
  return { root, library, projects, project, manager, png };
}
async function firstImage(f) {
  const d = await f.manager.prepare({ projectId: f.project.id }, '生成一张光学芯片插图');
  await fs.writeFile(d.output, f.png);
  return f.manager.finish(d);
}

test('completing an editable model from a selected reference prepares a model delivery', async t => {
  const f = await fixture(t);
  const reference = path.join(f.root, 'chip-reference.png');
  await fs.writeFile(reference, f.png);
  const project = await f.projects.import(f.project.id, [reference], {kind:'reference'});
  const image = project.references[0];
  const delivery = await f.manager.prepare({projectId:project.id,renderId:image.id}, '方案确认，软件就用本机 Cinema 4D。现在完成第一版可编辑模型和暗场成图。');
  assert.notEqual(delivery.kind, 'image');
  assert.equal(delivery.reference.renderId, image.id);
  assert.equal(delivery.public.inputModel, null);
});
test('fresh image generation registers and previews a standalone PNG without creating a model or pairing', async t => {
  const f = await fixture(t), update = await firstImage(f);
  assert.equal(update.project.models.length, 0); assert.equal(update.project.renders.length, 1);
  assert.deepEqual(update.project.links, {}); assert.equal(update.image.assetId, null);
  assert.ok(update.image.renderUrl.includes('?revision='));
  assert.equal(update.image.name,'独立图片.png');
  assert.equal(update.project.renders[0].standalone, true);
  assert.deepEqual((await fs.readdir(f.project.directory)).filter(n => /\.(glb|blend|c4d)$/i.test(n)), []);
});
test('unpaired image notes retain locator and regenerate under a stable name and resource ID', async t => {
  const f = await fixture(t), first = await firstImage(f), source = path.join(f.project.directory, first.image.name);
  const target = { version: 1, kind: 'image', projectId: f.project.id, assetId: null, renderId: first.image.renderId, renderHash: hash(f.png), point: { x: 0, y: 0, width: f.png.readUInt32BE(16), height: f.png.readUInt32BE(20), u: 0, v: 0 } };
  const d = await f.manager.prepare({ projectId: f.project.id, renderId: first.image.renderId }, formatEdit(target, '把这里改成蓝色，保留其他部分'));
  assert.equal(d.kind, 'image'); assert.equal(d.public.imageOnly, true); assert.equal(d.public.inputModel, null);
  assert.deepEqual(d.images, [source]); assert.equal(d.public.editTargets[0].renderId, target.renderId);
  assert.ok(d.output.endsWith('.png')); assert.notEqual(d.output,source);
  await assert.rejects(f.manager.finish(d), /没有交付新图片/);
  await fs.writeFile(d.output, f.png); const next = await f.manager.finish(d);
  assert.equal(next.project.models.length, 0); assert.equal(next.project.renders.length, 1);
  assert.equal(next.image.renderId, first.image.renderId); assert.equal(next.image.name,first.image.name);
  assert.equal(hash(await fs.readFile(source)), hash(f.png));
  assert.deepEqual((await f.projects.refresh(f.project.id)).links, {});
  await fs.appendFile(source, 'changed');
  await assert.rejects(f.manager.prepare({ projectId: f.project.id }, formatEdit(target, '再次修改')), /原图片已变化/);
});
test('explicit same-version image updates preserve the resource ID, back up inputs, and reject unchanged old output', async t => {
  const f = await fixture(t), first = await firstImage(f);
  const d = await f.manager.prepare({ projectId: f.project.id, renderId: first.image.renderId }, '修改图片颜色，不改版本号');
  assert.equal(d.inPlace, true); assert.notEqual(d.output,path.join(f.project.directory,first.image.name));
  await assert.rejects(f.manager.finish(d), /没有交付新图片/);
  await fs.writeFile(d.output, Buffer.concat([f.png, Buffer.from('fixture-new-output')]));
  const update = await f.manager.finish(d);
  assert.equal(update.image.renderId, first.image.renderId); assert.equal(update.project.renders.length, 1);
  const saved = d.protectedFiles.find(p => p.file === d.source);
  assert.equal(hash(await fs.readFile(saved.backup)), hash(f.png));
});
test('image context discussion and prompt-only requests create no artifacts, and distinct images cannot share one note batch', async t => {
  const f = await fixture(t), first = await firstImage(f);
  for (const text of ['先解释这张图片，不做修改', '只给提示词，不实际生图']) {
    const d = await f.manager.prepare({ projectId: f.project.id, renderId: first.image.renderId }, text);
    assert.equal(d.requiresOutput, false); assert.equal(await f.manager.finish(d), null);
  }
  const target = { version: 1, kind: 'image', projectId: f.project.id, assetId: null, renderId: first.image.renderId, point: { x: 0, y: 0, width: 10, height: 10, u: 0, v: 0 } };
  assert.throws(() => parseEdits(formatEdit(target, '修改') + '\n\n' + formatEdit({ ...target, renderId: 'another' }, '修改')), /同一张独立图片/);
});
