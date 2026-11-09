const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { imagePoint, formatEdit, parseEdits } = require('../electron/point-edit-data.cjs');
const { FileLibrary } = require('../electron/files.cjs');
const { ProjectStore } = require('../electron/projects.cjs');
const { DeliveryManager } = require('../electron/delivery.cjs');
const base = { version: 1, kind: 'object', projectId: 'project', assetId: 'asset', fileName: '芯片.glb', object: { name: '同名单元', hierarchy: [{ name: '同名单元', childIndex: 2, gltfNodeIndex: 0 }] } };

test('image coordinates account for contain letterboxing, edge pixels and CSS scaling', () => {
  const rect = { left: 100, top: 30, width: 400, height: 400 };
  assert.equal(imagePoint(rect, 800, 400, 300, 90), null);
  assert.deepEqual(imagePoint(rect, 800, 400, 300, 230), { x: 400, y: 200, width: 800, height: 400, u: .5, v: .5 });
  assert.deepEqual(imagePoint(rect, 800, 400, 500, 330), { x: 799, y: 399, width: 800, height: 400, u: 1, v: 1 });
  assert.equal(imagePoint(rect, 0, 0, 300, 230), null);
  assert.equal(imagePoint({ left: 0, top: 0, width: 200, height: 100 }, 800, 400, 50, 25).x, 200);
});

test('visible instructions retain node zero and distinguish duplicates; removed blocks leave no hidden target', () => {
  const first = formatEdit(base, '保留位置，改成三角形'), second = formatEdit({ ...base, object: { ...base.object, hierarchy: [{ name: '同名单元', childIndex: 3, gltfNodeIndex: 1 }] } }, '改蓝色');
  assert.match(first.split('\n')[0], /同名单元.*保留位置，改成三角形/);
  assert.equal(parseEdits(first)[0].object.hierarchy[0].gltfNodeIndex, 0);
  assert.equal(parseEdits(first + '\n' + second)[1].object.hierarchy[0].gltfNodeIndex, 1);
  assert.deepEqual(parseEdits('只讨论，不修改'), []);
  assert.equal(parseEdits(formatEdit({ ...base, object: { ...base.object, name: '```workbench-edit' } }, '测试名称'))[0].object.name, '```workbench-edit');
  assert.throws(() => parseEdits(first.slice(0, -3)), /不完整/);
  assert.throws(() => parseEdits(first + '\n\n' + formatEdit({ ...base, assetId: 'other' }, 'x')), /另一个模型/);
  assert.equal(parseEdits(first.replaceAll('\n', '\r\n'))[0].assetId, base.assetId);
});

test('delivery resolves trusted project files, pins source nodes, includes original image and rejects stale/mismatched targets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'point-edit-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = new FileLibrary(), projects = new ProjectStore(library), project = await projects.create('点改', root);
  const manager = new DeliveryManager({ projects, library, backupDirectory: path.join(root, 'backups'), imageSize: () => ({ width: 256, height: 256 }) });
  await fs.copyFile(path.join(__dirname, '../assets/library/示例模型/光子芯片.glb'), path.join(project.directory, '芯片.glb'));
  await fs.copyFile(path.join(__dirname, '../assets/icon.png'), path.join(project.directory, '芯片.png'));
  const snapshot = await projects.refresh(project.id), assetId = snapshot.models[0].id, renderId = snapshot.renders[0].id;
  const model = await projects.model(project.id, assetId), context = { projectId: project.id, assetId };
  const target = { ...base, ...context, sourceHash: model.sha256 };
  const prepared = await manager.prepare(context, formatEdit(target, '改为三角形'));
  assert.equal(prepared.public.editTargets[0].sourceNodeIndex, 0);
  assert.equal(prepared.public.editTargets[0].modelPath, path.join(project.directory, '芯片.glb'));
  await assert.rejects(manager.prepare(context, formatEdit({ ...target, sourceHash: 'outdated' }, 'x')), /发生变化/);
  await assert.rejects(manager.prepare({ projectId: project.id }, formatEdit(target, 'x')), /不一致/);
  await assert.rejects(manager.prepare(context, formatEdit({ ...target, object: { ...base.object, hierarchy: [{ gltfNodeIndex: 999999 }] } }, 'x')), /节点不存在/);
  const image = { version: 1, kind: 'image', ...context, renderId, fileName: '无关路径.png', point: { width: 256, height: 256, x: 64, y: 128, u: .25, v: .5 } };
  const rendered = await manager.prepare(context, formatEdit(image, '这个位置改成红色'));
  assert.deepEqual(rendered.images, [path.join(project.directory, '芯片.png')]);
  assert.equal(rendered.public.editTargets[0].fileName, '芯片.png');
  assert.equal(rendered.renderRequired, true); assert.equal(rendered.protectedFiles.length, 2);
  const modelOnly = await manager.prepare(context, formatEdit(image, '把这里改成三角形，不渲染'));
  assert.equal(modelOnly.renderRequired, false); assert.equal(modelOnly.mode, 'revision');
  await assert.rejects(manager.prepare(context, formatEdit({ ...image, renderId: '../outside.png' }, 'x')), /配对已变化/);
  await assert.rejects(manager.prepare(context, formatEdit({ ...image, renderHash: 'stale-image' }, 'x')), /成图文件发生变化/);
  await assert.rejects(manager.prepare(context, formatEdit({ ...image, point: { ...image.point, width: 512, x: 128 } }, 'x')), /尺寸发生变化/);
  assert.throws(() => parseEdits(formatEdit({ ...image, point: { ...image.point, u: -.1 } }, 'x')), /坐标/);
  await fs.copyFile(path.join(__dirname, '../assets/icon.png'), path.join(project.directory, '未配对.png'));
  const refreshed = await projects.refresh(project.id), orphan = refreshed.renders.find(r => r.name === '未配对.png');
  const descriptor = await projects.render(project.id, orphan.id); assert.ok(descriptor.renderSha256);
  const unpaired = await manager.prepare({ projectId: project.id }, formatEdit({ ...image, assetId: null, renderId: orphan.id, renderHash: descriptor.renderSha256 }, '先确认对应结构'));
  assert.equal(unpaired.public.inputModel, null); assert.equal(unpaired.images[0], path.join(project.directory, '未配对.png'));
});
