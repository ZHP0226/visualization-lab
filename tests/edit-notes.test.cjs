const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { EditNotes } = require('../electron/edit-notes.cjs');
const { parseEdits } = require('../electron/point-edit-data.cjs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const target = { version: 1, kind: 'object', projectId: 'p', assetId: 'a', fileName: '芯片.glb', object: { name: '单元', gltfNodeIndex: 0, hierarchy: [{ name: '单元', childIndex: 0, gltfNodeIndex: 0 }] } };
const value = (request = '改成三角形') => ({ request, target, view: { position: [1, 2, 3], target: [0, 0, 0], hidden: [2], presentation: 'structure' } });
async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-notes-')); t.after(() => fs.rm(root, { recursive: true, force: true })); const file = path.join(root, 'notes.json'); return { file, store: new EditNotes(file) }; }
test('notes persist separately from chat, retain view, and are assembled privately only for submission', async t => {
  const { file, store } = await fixture(t);
  const note = await store.save('p', 'codex', value());
  const reopened = new EditNotes(file), list = await reopened.list('p', 'codex');
  assert.deepEqual(list[0], note); assert.deepEqual(list[0].view.hidden, [2]);
  const batch = await reopened.prepare('p', 'codex', [{ id: note.id, rev: note.rev }], '保留其他部分');
  assert.ok(batch.command.startsWith('保留其他部分')); assert.equal(parseEdits(batch.command)[0].object.gltfNodeIndex, 0);
  assert.equal(batch.context.assetId, 'a'); assert.ok(!batch.command.includes('"hidden"'));
  assert.equal((await reopened.list('p', 'codex'))[0].status, 'pending');
  await reopened.markSent(batch); assert.equal((await reopened.list('p', 'codex'))[0].status, 'sent');
  assert.deepEqual(await reopened.list('p', 'claude'), []); assert.deepEqual(await reopened.list('other', 'codex'), []);
});
test('revision checks retain newer edits during completion; deleted records do not reappear', async t => {
  const { store } = await fixture(t), note = await store.save('p', 'codex', value());
  const batch = await store.prepare('p', 'codex', [{ id: note.id, rev: note.rev }], '');
  const edited = await store.save('p', 'codex', { ...value('改成蓝色'), id: note.id, rev: note.rev });
  await store.markSent(batch); assert.equal((await store.list('p', 'codex'))[0].status, 'pending');
  await assert.rejects(store.prepare('p', 'codex', [{ id: note.id, rev: note.rev }], ''), /已变化/);
  await assert.rejects(store.save('p', 'codex', { ...value(), id: note.id, rev: note.rev }), /已经变化/);
  await store.remove('p', 'codex', note.id); await store.markSent({ ...batch, versions: [{ id: edited.id, rev: edited.rev }] });
  assert.deepEqual(await store.list('p', 'codex'), []);
});
test('queued writes preserve all notes, bind their source and permit a full hidden prompt beyond the plain chat limit', async t => {
  const { store } = await fixture(t);
  const saved = await Promise.all(Array.from({ length: 5 }, (_, i) => store.save('p', 'codex', value(String(i) + '改'.repeat(2900)))));
  const batch = await store.prepare('p', 'codex', saved.map(({ id, rev }) => ({ id, rev })), '');
  assert.equal(parseEdits(batch.command).length, 5); assert.ok(batch.command.length > 12000);
  assert.throws(() => store.save('p', 'codex', { ...value(), target: { ...target, projectId: 'other' } }), /不一致/);
  await assert.rejects(store.save('p', 'codex', { ...value(), target: { ...target, assetId: 'other' } }), /另一个模型/);
  assert.equal((await store.list('p', 'codex')).length, 5);
});
test('a corrupted notes file is reported and preserved, never replaced with an empty list', async t => {
  const { file, store } = await fixture(t); await fs.writeFile(file, 'broken history');
  await assert.rejects(store.list('p', 'codex'), /无法读取/); await assert.rejects(store.save('p', 'codex', value()), /无法读取/);
  assert.equal(await fs.readFile(file, 'utf8'), 'broken history');
});

test('independent writers serialize updates to the shared file without losing each other records', async t => {
  const { file, store } = await fixture(t), other = new EditNotes(file);
  await Promise.all([store.save('p', 'codex', value('窗口一')), other.save('p', 'codex', value('窗口二'))]);
  assert.deepEqual((await store.list('p', 'codex')).map(n => n.request).sort(), ['窗口一', '窗口二']);
  await other.save('p', 'codex', value('锁已释放'));
  assert.equal((await store.list('p', 'codex')).length, 3);
});

test('terminating another process during a transaction does not leave opinion saving locked', async t => {
  const { file, store } = await fixture(t); await store.save('p', 'codex', value('原记录'));
  const child = spawn(process.execPath, ['-e', `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(file + '.mutex.sqlite')});db.exec('BEGIN IMMEDIATE');process.stdout.write('locked');setInterval(()=>{},1000);`], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await once(child.stdout, 'data'); const exited = once(child, 'exit'); child.kill(); await exited;
  await store.save('p', 'codex', value('恢复后记录'));
  assert.equal((await store.list('p', 'codex')).length, 2);
});
