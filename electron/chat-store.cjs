const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class ChatStore {
  constructor(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, project TEXT NOT NULL, agent TEXT NOT NULL,
        title TEXT NOT NULL, draft TEXT NOT NULL DEFAULT '', session TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chat_scopes (project TEXT NOT NULL, agent TEXT NOT NULL, selected TEXT NOT NULL, PRIMARY KEY(project,agent));
      CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat TEXT NOT NULL, request TEXT NOT NULL,
        role TEXT NOT NULL, text TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, owner INTEGER NOT NULL,
        UNIQUE(chat,request,role));
      CREATE INDEX IF NOT EXISTS messages_by_chat ON chat_messages(chat,id);`);
    // Only recover work owned by a process that no longer exists; another open window stays intact.
    for (const row of this.db.prepare("SELECT DISTINCT owner FROM chat_messages WHERE status='running'").all()) {
      let alive = true; try { process.kill(row.owner, 0); } catch (error) { alive = error.code !== 'ESRCH'; }
      if (!alive) this.db.prepare("UPDATE chat_messages SET status='interrupted',note='上次任务已中断，可继续对话；未自动重新执行。' WHERE owner=? AND status='running'").run(row.owner);
    }
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  scope(project, agent) {
    if (project != null && (typeof project !== 'string' || !project || project.length > 100)) throw new Error('无效的项目');
    if (!['codex','claude','gemini','opencode'].includes(agent) && !/^api_[a-f0-9-]{36}$/.test(agent)) throw new Error('无效的 Agent');
    return { project: project || 'home', agent };
  }
  require(id, project, agent) {
    if (typeof id !== 'string' || id.length > 100) throw new Error('无效的聊天');
    const row = this.db.prepare('SELECT * FROM chats WHERE id=?').get(id);
    if (!row) throw new Error('聊天不存在，原记录未修改');
    if (arguments.length > 1) {
      const scope = this.scope(project, agent);
      if (row.project !== scope.project || row.agent !== scope.agent) throw new Error('聊天不属于当前项目或 Agent');
    }
    return row;
  }
  list(project, agent) {
    const scope = this.scope(project, agent);
    const chats = this.db.prepare('SELECT id,title,created,updated FROM chats WHERE project=? AND agent=? ORDER BY updated DESC,rowid DESC').all(scope.project, scope.agent);
    const selected = this.db.prepare('SELECT selected FROM chat_scopes WHERE project=? AND agent=?').get(scope.project, scope.agent)?.selected;
    return { chats, selectedId: selected || chats[0]?.id || null };
  }
  create(project, agent) {
    const scope = this.scope(project, agent), id = randomUUID(), now = Date.now();
    this.transaction(() => {
      this.db.prepare('INSERT INTO chats(id,project,agent,title,created,updated) VALUES(?,?,?,?,?,?)').run(id,scope.project,agent,'新聊天',now,now);
      this.select(id,scope.project,agent);
    });
    return this.open(project,agent,id);
  }
  select(id, project, agent) {
    this.db.prepare('INSERT INTO chat_scopes(project,agent,selected) VALUES(?,?,?) ON CONFLICT(project,agent) DO UPDATE SET selected=excluded.selected').run(project,agent,id);
  }
  open(project, agent, id) {
    const scope = this.scope(project, agent);
    id ||= this.list(project,agent).selectedId;
    if (!id) return this.create(project,agent);
    const row = this.require(id,project,agent);
    this.select(id,scope.project,agent);
    const { session, ...chat } = row;
    return { ...this.list(project,agent), chat: { ...chat, messages: this.db.prepare('SELECT request,role,text,note,status FROM chat_messages WHERE chat=? ORDER BY id').all(id) } };
  }
  draft(id, text) {
    this.require(id);
    if (typeof text !== 'string' || text.length > 12000) throw new Error('草稿不能超过12000字');
    this.db.prepare('UPDATE chats SET draft=? WHERE id=?').run(text,id);
  }
  getSession(id) { return this.require(id).session || null; }
  apiHistory(id) {
    this.require(id);
    return this.db.prepare("SELECT role,text FROM chat_messages AS m WHERE chat=? AND EXISTS (SELECT 1 FROM chat_messages AS a WHERE a.chat=m.chat AND a.request=m.request AND a.role='assistant' AND a.status='completed') ORDER BY id").all(id).map(row=>({role:row.role,content:row.text}));
  }
  setSession(id, session) {
    this.require(id);
    if (typeof session !== 'string' || !session || session.length > 300) throw new Error('Agent 会话标识无效');
    this.db.prepare('UPDATE chats SET session=? WHERE id=?').run(session,id);
  }
  begin(id, request, text, display, sentDraft) {
    if (typeof request !== 'string' || !request || request.length > 80) throw new Error('无效的消息标识');
    if (typeof display !== 'string' || display.length > 50000) throw new Error('聊天消息过长');
    this.transaction(() => {
      const chat = this.require(id);
      if (this.db.prepare("SELECT id FROM chat_messages WHERE chat=? AND status='running'").get(id)) throw new Error('此聊天仍有任务正在执行，请先等待或停止');
      const insert = this.db.prepare('INSERT INTO chat_messages(chat,request,role,text,status,owner) VALUES(?,?,?,?,?,?)');
      insert.run(id,request,'user',display,'completed',process.pid);
      insert.run(id,request,'assistant','','running',process.pid);
      const title = chat.title === '新聊天' ? (text.trim() || '修改意见').split(/\r?\n/)[0].slice(0,40) : chat.title;
      this.db.prepare('UPDATE chats SET title=?,updated=?,draft=CASE WHEN draft=? THEN \'\' ELSE draft END WHERE id=?').run(title,Date.now(),sentDraft,id);
    });
  }
  event(id, event) {
    if (event.type === 'message') this.db.prepare("UPDATE chat_messages SET text=? WHERE chat=? AND request=? AND role='assistant' AND status='running'").run(event.text,id,event.requestId);
    if (event.type === 'done') this.db.prepare("UPDATE chat_messages SET status=?,note=? WHERE chat=? AND request=? AND role='assistant' AND status='running'").run(event.status,event.error || (event.status === 'interrupted' ? '已停止；可继续对话。' : ''),id,event.requestId);
  }
  close() {
    this.db.prepare("UPDATE chat_messages SET status='interrupted',note='软件已关闭，未完成的任务未自动重试。' WHERE owner=? AND status='running'").run(process.pid);
    this.db.close();
  }
}
module.exports = { ChatStore };
