const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileLibrary } = require('../electron/files.cjs');
const { ProjectStore, MANIFEST } = require('../electron/projects.cjs');
const temporary = fs.mkdtemp(path.join(os.tmpdir(), 'workbench-projects-'));
after(async () => fs.rm(await temporary, { recursive: true, force: true }));
test('virtual categories, exact-prefix pairing, flat storage and durable links survive reopening', async () => {
  const base = await temporary; const source = path.join(base, 'source'); await fs.mkdir(source);
  for (const name of ['第1期.glb', '第1期.png', '第10期.png', '第2期.obj', '第2期.jpg', '第2期.webp']) await fs.writeFile(path.join(source, name), name);
  const store = new ProjectStore(new FileLibrary()); const project = await store.create('演示项目', base);
  let state = await store.import(project.id, ['第1期.glb', '第1期.png', '第10期.png', '第2期.obj', '第2期.jpg', '第2期.webp'].map(name => path.join(source, name)));
  assert.equal(Object.keys(state.links).length, 1);
  assert.equal(state.renders.find(item => item.id === state.links[state.models.find(item => item.name === '第1期.glb').id]).name, '第1期.png');
  assert.equal(state.links[state.models.find(item => item.name === '第2期.obj').id], undefined);
  for (const category of ['模型', '成片']) await assert.rejects(fs.stat(path.join(state.directory, category)), { code: 'ENOENT' });
  const model = state.models.find(item => item.name === '第2期.obj'); const render = state.renders.find(item => item.name === '第2期.webp');
  state = await store.bind(project.id, model.id, render.id);
  await assert.rejects(store.bind(project.id, model.id, Object.values(state.links)[0]), /其他模型/);
  const reopened = await new ProjectStore(new FileLibrary()).register(state.directory);
  assert.deepEqual(reopened.links, state.links); assert.equal((await fs.readdir(state.directory)).includes(MANIFEST), true);
});
test('import rejects conflicting file contents without overwriting a project file or source', async () => {
  const base = await temporary; const source = path.join(base, 'source'); const store = new ProjectStore(new FileLibrary());
  const project = await store.create('防覆盖项目', base);
  await store.import(project.id, [path.join(source, '第1期.glb')]);
  const other = path.join(base, 'other'); await fs.mkdir(other); await fs.writeFile(path.join(other, '第1期.glb'), 'different');
  await assert.rejects(store.import(project.id, [path.join(other, '第1期.glb')]), /同名/);
  assert.equal(await fs.readFile(path.join(project.directory, '第1期.glb'), 'utf8'), '第1期.glb');
  assert.equal(await fs.readFile(path.join(other, '第1期.glb'), 'utf8'), 'different');
});
test('glTF companion resources are copied locally and stay out of the virtual asset lists', async () => {
  const base = await temporary; const source = path.join(base, 'gltf-source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'sample.gltf'), JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'sample.bin' }], images: [{ uri: 'texture.png' }] }));
  await fs.writeFile(path.join(source, 'sample.bin'), 'bin'); await fs.writeFile(path.join(source, 'texture.png'), 'texture');
  const store = new ProjectStore(new FileLibrary()); const project = await store.create('带资源项目', base);
  const state = await store.import(project.id, [path.join(source, 'sample.gltf')]);
  assert.equal(state.models.length, 1); assert.equal(state.renders.length, 0);
  assert.equal(await fs.readFile(path.join(state.directory, 'sample.bin'), 'utf8'), 'bin');
  assert.equal((await store.refresh(project.id)).renders.length, 0);
});

test('model revisions are saved separately, survive reopen, and never reuse an old final render', async () => {
  const base = await temporary, source = path.join(base, 'revision-source'); await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'chip.glb'), 'original model'); await fs.writeFile(path.join(source, 'chip.png'), 'original image');
  const store = new ProjectStore(new FileLibrary()), project = await store.create('修改版本项目', base);
  const initial = await store.import(project.id, ['chip.glb', 'chip.png'].map(name => path.join(source, name)));
  const revision = await store.saveRevision(project.id, initial.models[0].id, Buffer.from('modified model'), { rows: 10, unitCount: 55 });
  assert.equal(await fs.readFile(path.join(initial.directory, 'chip.glb'), 'utf8'), 'original model');
  assert.equal(await fs.readFile(path.join(initial.directory, 'chip.png'), 'utf8'), 'original image');
  assert.equal(revision.model.renderUrl, null);
  assert.equal(revision.project.links[initial.models[0].id], initial.renders[0].id);
  const reopened = await new ProjectStore(new FileLibrary()).register(initial.directory);
  assert.equal(reopened.models.length, 2);
  assert.equal(reopened.models.find(x => x.id === revision.model.assetId).derivedFrom, initial.models[0].id);
  await assert.rejects(store.saveRevision(project.id, 'unregistered', Buffer.from('bad'), {}), /来源不在/);
});
