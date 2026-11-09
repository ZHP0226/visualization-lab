const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { parseEdits, formatEdit, MAX_AGENT_TEXT } = require('./point-edit-data.cjs');
function scopeKey(projectId, agentId) {
  if (typeof projectId !== 'string' || !projectId || projectId.length > 100 || typeof agentId !== 'string' || !agentId || agentId.length > 80) throw new Error('请先选择项目和 Agent。');
  return JSON.stringify([projectId, agentId]);
}
class EditNotes {
  constructor(file) { this.file = file; this.queue = Promise.resolve(); }
  async lock() {
    // SQLite's OS lock also releases on process crashes; no stale lock file to reclaim.
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    for (let attempt = 0; attempt < 40; attempt++) {
      let db;
      try {
        db = new DatabaseSync(this.file + '.mutex.sqlite');
        db.exec('PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS notes_mutex (id INTEGER PRIMARY KEY); BEGIN IMMEDIATE;');
        return () => db.close();
      }
      catch (error) {
        db?.close();
        if (![5, 6].includes(error.errcode)) throw error;
        await new Promise(resolve => setTimeout(resolve, 75));
      }
    }
    throw new Error('修改意见正在由另一个窗口保存，请稍后重试。');
  }
  async read() {
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (data.version !== 1 || !data.scopes || typeof data.scopes !== 'object' || Array.isArray(data.scopes) || !Object.values(data.scopes).every(list => Array.isArray(list) && list.every(n => n && typeof n.id === 'string' && Number.isInteger(n.rev) && typeof n.request === 'string' && n.target && ['object', 'image'].includes(n.target.kind) && (n.target.kind !== 'object' || typeof n.target.object?.name === 'string') && n.view && ['pending', 'sent'].includes(n.status)))) throw new Error();
      return data;
    }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, scopes: {} }; throw new Error('修改意见记录无法读取，请保留记录文件并检查后重试。'); }
  }
  mutate(fn) {
    const result = this.queue.then(async () => {
      const release = await this.lock();
      try {
        const data = await this.read(), value = fn(data), temporary = this.file + '.' + randomUUID() + '.tmp';
        await fs.writeFile(temporary, JSON.stringify(data), { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporary, this.file); return value;
      } finally { await release(); }
    });
    this.queue = result.catch(() => {}); return result;
  }
  async list(projectId, agentId) { await this.queue; return (await this.read()).scopes[scopeKey(projectId, agentId)] || []; }
  save(projectId, agentId, value) {
    const key = scopeKey(projectId, agentId);
    if (!value || typeof value.request !== 'string' || !value.request.trim() || value.request.length > 3000 || !value.view || JSON.stringify(value).length > 500000) throw new Error('请输入有效的修改意见。');
    if (value.target?.projectId !== projectId) throw new Error('修改意见与当前项目不一致。');
    parseEdits(formatEdit(value.target, value.request));
    return this.mutate(data => {
      const notes = data.scopes[key] ||= [], previous = value.id ? notes.find(n => n.id === value.id) : null;
      if (value.id && (!previous || previous.rev !== value.rev)) throw new Error('这条意见已经变化，请重新选择后编辑。');
      const pending = notes.filter(n => n.status === 'pending' && n.id !== value.id);
      parseEdits([...pending, value].map(n => formatEdit(n.target, n.request)).join('\n\n'));
      const now = new Date().toISOString(), note = { id: previous?.id || randomUUID(), rev: (previous?.rev || 0) + 1, target: value.target, request: value.request.trim(), view: value.view, status: 'pending', createdAt: previous?.createdAt || now, updatedAt: now };
      if (previous) notes[notes.indexOf(previous)] = note; else notes.push(note);
      return note;
    });
  }
  remove(projectId, agentId, id) { return this.mutate(data => { const key = scopeKey(projectId, agentId); data.scopes[key] = (data.scopes[key] || []).filter(n => n.id !== id); }); }
  async prepare(projectId, agentId, versions, text) {
    if (typeof text !== 'string' || text.length > 12000 || !Array.isArray(versions) || versions.length > 8) throw new Error('本轮消息或修改意见无效。');
    const notes = await this.list(projectId, agentId), selected = versions.map(v => {
      if (!v || typeof v.id !== 'string' || !Number.isInteger(v.rev)) throw new Error('无效的修改意见编号。');
      const note = notes.find(n => n.id === v.id && n.rev === v.rev && n.status === 'pending');
      if (!note) throw new Error('待发送意见已变化，请检查列表后重新发送。'); return note;
    });
    if (new Set(selected.map(n => n.id)).size !== selected.length) throw new Error('重复的修改意见。');
    const command = [text.trim(), ...selected.map(n => formatEdit(n.target, n.request))].filter(Boolean).join('\n\n');
    const targets = parseEdits(command);
    if (!command || command.length > MAX_AGENT_TEXT) throw new Error('本轮内容过长，请减少修改意见后分批发送。');
    const display = selected.map((n,i) => `${i + 1}. ${n.target.kind === 'object' ? n.target.object.name : `成图 · ${n.target.fileName}`}：${n.request}`).join('\n');
    return { projectId, agentId, versions, command, display, context: { projectId, assetId: targets[0]?.assetId || null, ...(!targets[0]?.assetId && targets[0]?.renderId ? { renderId: targets[0].renderId } : {}), selectedStructure: targets.filter(t => t.kind === 'object').map(t => t.object.name).join('、') || null } };
  }
  markSent(batch) { return this.mutate(data => {
    const notes = data.scopes[scopeKey(batch.projectId, batch.agentId)] || [];
    for (const version of batch.versions) { const note = notes.find(n => n.id === version.id && n.rev === version.rev); if (note) { note.status = 'sent'; note.sentAt = new Date().toISOString(); } }
    return notes;
  }); }
}
module.exports = { EditNotes, scopeKey };
