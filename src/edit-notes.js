const api = window.workbench, $ = id => document.getElementById(id);
let projectId = null, agentId = '', notes = [], loading = false, ticket = 0, ready = Promise.resolve();
const changed = () => document.dispatchEvent(new Event('workbench:notes'));
export const pendingNotes = () => notes.filter(n => n.status === 'pending');
export const notesLoading = () => loading;
export const noteLabel = note => note.target.kind === 'object' ? note.target.object.name : `成图 · ${note.target.fileName}`;
export function notesError(error) { $('edit-notes-error').textContent = error?.message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '') || ''; }
function render() {
  const pending = pendingNotes().length;
  $('edit-notes-count').textContent = notes.length ? `${pending} 条待发送 · 共 ${notes.length} 条` : '0 条';
  const list = $('edit-notes-list'); list.replaceChildren();
  if (!notes.length) { const p = document.createElement('p'); p.className = 'edit-notes-empty'; p.textContent = loading ? '正在读取修改意见…' : '右击模型部件或成图位置，添加修改意见'; list.append(p); }
  notes.forEach((note, index) => {
    const row = document.createElement('div'); row.className = `edit-note-row ${note.status}`;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'edit-note-select';
    button.disabled = loading;
    const title = document.createElement('span'); title.className = 'edit-note-title'; title.textContent = `${index + 1}. ${noteLabel(note)}`;
    const request = document.createElement('span'); request.className = 'edit-note-request'; request.textContent = note.request;
    const status = document.createElement('span'); status.className = 'edit-note-status'; status.textContent = note.status === 'pending' ? '待发送' : '已发送';
    button.append(title, request, status); button.title = '恢复当时的画面并继续编辑这条意见';
    button.addEventListener('click', () => { $('edit-notes-menu').open = false; document.dispatchEvent(new CustomEvent('workbench:edit-note', { detail: structuredClone(note) })); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'edit-note-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `删除第${index + 1}条修改意见`);
    remove.addEventListener('click', async () => {
      const p = projectId, a = agentId; remove.disabled = true;
      try { await api.removeEditNote(p, a, note.id); if (p === projectId && a === agentId) { notes = notes.filter(n => n.id !== note.id); render(); } }
      catch (error) { notesError(error); remove.disabled = false; }
    });
    row.append(button, remove); list.append(row);
  });
  changed();
}
export function setNotesScope(project, agent) {
  if (projectId === project && agentId === agent) return;
  projectId = project; agentId = agent; notes = []; notesError(null); $('edit-notes-menu').open = false;
  const current = ++ticket; loading = !!project && !!agent; render();
  ready = loading ? api.listEditNotes(project, agent).then(result => { if (current === ticket) notes = result; }).catch(error => { if (current === ticket) notesError(error); }).finally(() => { if (current === ticket) { loading = false; render(); } }) : Promise.resolve();
}
export async function saveNote(value) {
  await ready; const p = projectId, a = agentId;
  if (!p || !a || p !== value.target.projectId) throw new Error('请先选择对应项目和 Agent。');
  const note = await api.saveEditNote(p, a, value);
  if (p === projectId && a === agentId) { const index = notes.findIndex(n => n.id === note.id); if (index < 0) notes.push(note); else notes[index] = note; notesError(null); render(); }
  return note;
}
export function noteSubmission() {
  const pending = pendingNotes();
  return { versions: pending.map(n => ({ id: n.id, rev: n.rev })), display: pending.map((n, i) => `${i + 1}. ${noteLabel(n)}：${n.request}`).join('\n') };
}
export function finishNotes(event) {
  if (event.editNotes && event.notesProjectId === projectId && event.agentId === agentId) { notes = event.editNotes; render(); }
  if (event.notesWarning) notesError(new Error(event.notesWarning));
}
document.addEventListener('click', event => { if (!event.target.closest('#edit-notes-menu')) $('edit-notes-menu').open = false; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') $('edit-notes-menu').open = false; });
$('edit-notes-menu').addEventListener('toggle', () => {
  if (!$('edit-notes-menu').open || !projectId || !agentId || loading) return;
  const current = ++ticket, p = projectId, a = agentId; loading = true; render();
  ready = api.listEditNotes(p, a).then(result => { if (current === ticket) { notes = result; notesError(null); } }).catch(error => { if (current === ticket) notesError(error); }).finally(() => { if (current === ticket) { loading = false; render(); } });
});
window.workbenchNotesState = () => ({ loading, projectId, agentId, count: notes.length, pending: pendingNotes().length, entries: notes.map(n => ({ id: n.id, rev: n.rev, request: n.request, status: n.status, label: noteLabel(n) })) });
