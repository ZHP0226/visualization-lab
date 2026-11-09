const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ProjectStore, MANIFEST } = require('../electron/projects.cjs');
const { FileLibrary } = require('../electron/files.cjs');
const { restoreProjectCatalog } = require('../electron/project-catalog.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'project-catalog-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, store: new ProjectStore(new FileLibrary()) };
}
test('managed projects appear without a registry and restoration never writes project manifests', async t => {
  const { root, store } = await fixture(t), first = await store.create('第0期', root), second = await store.create('第1期', root);
  await fs.mkdir(path.join(root, '普通文件夹'));
  const before = await fs.readFile(path.join(first.directory, MANIFEST));
  store.write = () => { throw new Error('restoration must be read only'); };
  const projects = await restoreProjectCatalog(store, [], [root]);
  assert.deepEqual(projects.map(p => p.id).sort(), [first.id, second.id].sort());
  assert.deepEqual(await fs.readFile(path.join(first.directory, MANIFEST)), before);
});
test('saved projects outside managed roots persist, unavailable entries remain visible and retry recovers them', async t => {
  const { root, store } = await fixture(t), existing = await store.create('其他位置', root), missing = path.join(root, '待恢复');
  let catalog = await restoreProjectCatalog(store, [existing.directory, missing]);
  assert.equal(catalog.length, 2); assert.equal(catalog[1].name, '待恢复'); assert.equal(catalog[1].unavailable, true);
  const recovered = await store.create('待恢复', root);
  catalog = await restoreProjectCatalog(store, [existing.directory, missing]);
  assert.equal(catalog[1].id, recovered.id); assert.equal(catalog[1].unavailable, undefined);
});
test('registry and folder discovery deduplicate projects and preserve the first location for copied IDs', async t => {
  const { root, store } = await fixture(t), original = await store.create('原项目', root), copy = path.join(root, '复制项目');
  await fs.cp(original.directory, copy, { recursive: true });
  const catalog = await restoreProjectCatalog(store, [original.directory, original.directory], [root]);
  assert.equal(catalog.length, 1); assert.equal(store.projects.get(original.id), await fs.realpath(original.directory));
});
test('removed projects stay absent through root scans, path aliases and renamed folders until explicitly reopened',async t=>{
  const {root,store}=await fixture(t),project=await store.create('移除项目',root),other=await store.create('保留项目',root),excluded=[{id:project.id,directory:project.directory}],before=await fs.readFile(path.join(project.directory,MANIFEST));
  store.projects.delete(project.id);assert.deepEqual((await restoreProjectCatalog(store,[project.directory],[root],excluded)).map(p=>p.id),[other.id]);
  const moved=path.join(root,'改名但未重新打开');await fs.rename(project.directory,moved);assert.deepEqual((await restoreProjectCatalog(store,[],[root],excluded)).map(p=>p.id),[other.id]);assert.deepEqual(await fs.readFile(path.join(moved,MANIFEST)),before);
  await store.register(moved,{refresh:false});assert.equal((await restoreProjectCatalog(store,[moved],[root],[])).length,2);
});
