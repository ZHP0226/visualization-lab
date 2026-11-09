const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileLibrary } = require('../electron/files.cjs');
const temporary = fs.mkdtemp(path.join(os.tmpdir(), 'workbench-files-'));
after(async () => fs.rm(await temporary, { recursive: true, force: true }));
test('file browser includes folders and supported model files, hides sidecars and other files', async () => {
  const root = await temporary;
  await fs.mkdir(path.join(root, '模型目录'));
  for (const name of ['模型.GLB', 'object.obj', 'scene.gltf', 'mesh.fbx', 'notes.txt', 'texture.png', 'mesh.bin', 'object.mtl']) await fs.writeFile(path.join(root, name), 'fixture');
  const library = new FileLibrary(); const grant = await library.grant(root);
  const entries = await library.list(grant.id);
  assert.equal(entries[0].directory, true);
  assert.deepEqual(entries.filter(entry => !entry.directory).map(entry => entry.extension).sort(), ['.fbx', '.glb', '.gltf', '.obj']);
  const model = await library.model(grant.id, '模型.GLB');
  assert.equal(model.name, '模型.GLB'); assert.match(model.url, /%E6%A8%A1%E5%9E%8B.GLB$/);
  await assert.rejects(library.model(grant.id, 'notes.txt'), /仅支持/);
});
test('a same-name final render is associated with a model but hidden in the file browser', async () => {
  const root = await temporary;
  await fs.writeFile(path.join(root, '模型.render.png'), 'image fixture');
  const library = new FileLibrary(); const grant = await library.grant(root);
  const model = await library.model(grant.id, '模型.GLB');
  assert.match(model.renderUrl, /\.render\.png$/);
  assert.equal((await library.list(grant.id)).some(entry => entry.name.endsWith('.png')), false);
  assert.equal((await library.model(grant.id, 'mesh.fbx')).renderUrl, null);
});
test('asset access is scoped to the granted directory and rejects parent traversal', async () => {
  const library = new FileLibrary(); const grant = await library.grant(path.join(await temporary, '模型目录'));
  await assert.rejects(library.resolve(grant.id, '../notes.txt'), /超出/);
  await assert.rejects(library.resolve('unknown', ''), /无效/);
  assert.equal((await library.grant(grant.path)).id, grant.id);
});
