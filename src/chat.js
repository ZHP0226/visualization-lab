import { setNotesScope, pendingNotes, notesLoading, noteSubmission, finishNotes, notesError } from './edit-notes.js';
import { setupCreationOptions } from './creation-options.js';
import { setupAIConnections } from './ai-connections.js';
const api = window.workbench;
const $ = id => document.getElementById(id);
const input = $('chat-input'), send = $('chat-send'), stop = $('chat-stop'), connect = $('chat-connect');
const creationOptions = setupCreationOptions(input);
const status = $('chat-status'), log = $('chat-messages'), modelSelect = $('codex-model'), effortSelect = $('agent-effort'), agentSelect = $('agent-select');
let active = null, connecting = true, configuring = false, connection = 'disconnected', agents = [], models = [], preferences = {}, defaultModel = null, defaultEffort = null;
let conversation = null, conversationScope = '', loadingChat = false, chatTicket = 0, draftTicket = 0;
let submitting = null;
const threadSelect = $('chat-thread'), newChat = $('chat-new'), saveStatus = $('chat-save-status');
const scopeKey = () => `${agentSelect.value}/${window.workbenchModelContext?.()?.projectId || 'home'}`;
const effortName = value => ({ none: '不推理', minimal: '最少', low: '低', medium: '中', high: '高', xhigh: '超高', max: '最大', ultra: 'Ultra' }[value] || value);
const agentName = () => agents.find(a => a.id === agentSelect.value)?.name || 'Agent';
function selectedModel() { return models.find(m => m.model === (modelSelect.value || defaultModel) || !modelSelect.value && m.resolvedModel === defaultModel); }
function controls() {
  creationOptions.refresh();
  send.disabled = !!active || !!submitting || connecting || configuring || loadingChat || !conversation || conversationScope !== scopeKey() || notesLoading() || (!input.value.trim() && !pendingNotes().length) || !agentSelect.value;
  send.hidden = !!active; stop.hidden = !active;
  connect.disabled = connecting || configuring || !!active || !!submitting;
  agentSelect.disabled = !!active || !!submitting || connecting || configuring || !agents.length;
  $('agent-refresh').disabled = !!active || !!submitting || connecting || configuring;
  $('open-ai-connections').disabled = !!active || !!submitting || connecting || configuring;
  $('settings-ai-connections').disabled = !!active || !!submitting || connecting || configuring;
  modelSelect.disabled = connection !== 'ready' || !!active || !!submitting || configuring || !models.length;
  effortSelect.disabled = connection !== 'ready' || !!active || !!submitting || configuring || !selectedModel()?.supportedReasoningEfforts?.length;
  newChat.disabled = !!active || !!submitting || loadingChat || !agentSelect.value;
  threadSelect.disabled = !!active || !!submitting || loadingChat || !conversation || conversationScope !== scopeKey();
  input.disabled = !!submitting || loadingChat || !conversation || conversationScope !== scopeKey();
}
function savingError(error) { saveStatus.textContent = '保存失败'; saveStatus.title = errorText(error); saveStatus.classList.add('error'); }
async function saveDraft() {
  if (!conversation || loadingChat || submitting?.chatId === conversation.id) return;
  const id = conversation.id, text = input.value, ticket = ++draftTicket;
  saveStatus.textContent = '保存中…'; saveStatus.classList.remove('error');
  try {
    await api.saveChatDraft(id,text);
    if (conversation?.id === id && ticket === draftTicket) { saveStatus.textContent = '已保存'; saveStatus.title = '聊天和草稿保存在本机'; }
  } catch (error) { if (conversation?.id === id) savingError(error); throw error; }
}
function chatOptions(chats) {
  threadSelect.replaceChildren(...chats.map(chat => new Option(`${chat.title} · ${new Date(chat.created).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}`,chat.id)));
  threadSelect.value = conversation.id;
}
function renderConversation() {
  log.replaceChildren();
  for (const record of conversation.messages) {
    const reply = message(record.role, record.text || (record.status === 'running' ? `正在等待 ${agentName()}…` : record.role === 'assistant' ? '未收到回复。' : ''));
    reply.note.textContent = record.note; reply.note.classList.toggle('error', record.status === 'failed');
    reply.row.classList.toggle('waiting',record.status === 'running');
    if (active?.chatId === conversation.id && active.id === record.request && record.role === 'assistant') active.reply = reply;
  }
  if (!log.childNodes.length) { const p = document.createElement('p'); p.id = 'chat-welcome'; p.className = 'chat-welcome'; p.textContent = '在这里，把创意变成可以查看的结构'; log.append(p); }
  scrollToBottom();
}
async function showConversation(id = null, create = false) {
  const next = scopeKey(), project = window.workbenchModelContext?.()?.projectId || null, agent = agentSelect.value;
  setNotesScope(window.workbenchModelContext?.()?.projectId || null, agentSelect.value);
  if (!agent || !loadingChat && next === conversationScope && !id && !create) return;
  const ticket = ++chatTicket, previous = conversation, draft = input.value;
  loadingChat = true; controls(); creationOptions.close();
  try {
    if (previous && submitting?.chatId !== previous.id) await api.saveChatDraft(previous.id,draft);
    const view = create ? await api.createChat(project,agent) : await api.openChat(project,agent,id);
    if (ticket !== chatTicket) return;
    conversation = view.chat; conversationScope = next; input.value = conversation.draft; document.dispatchEvent(new CustomEvent('workbench:draft-restored'));
    chatOptions(view.chats); renderConversation(); creationOptions.refresh(); saveStatus.textContent = '已保存'; saveStatus.classList.remove('error');
  } catch (error) { if (ticket === chatTicket) { savingError(error); threadSelect.value = conversation?.id || ''; } }
  finally { if (ticket === chatTicket) { loadingChat = false; controls(); } }
}
async function refreshChatOptions() {
  if (!conversation) return;
  const id = conversation.id, project = conversation.project === 'home' ? null : conversation.project;
  try { const view = await api.listChats(project,conversation.agent); if (conversation?.id === id) chatOptions(view.chats); }
  catch (error) { savingError(error); }
}
newChat.addEventListener('click', () => showConversation(null,true));
threadSelect.addEventListener('change', () => showConversation(threadSelect.value));
window.addEventListener('beforeunload', event => {
  if (conversation && !loadingChat && submitting?.chatId !== conversation.id) {
    const error = api.flushChatDraft(conversation.id,input.value);
    if (error) { savingError(new Error(error)); event.preventDefault(); event.returnValue = ''; }
  }
});
function refreshEfforts(preferred = effortSelect.value) {
  const info = selectedModel(), choices = info?.supportedReasoningEfforts || [];
  const fallback = !modelSelect.value ? defaultEffort || info?.defaultReasoningEffort : info?.defaultReasoningEffort;
  const apiMode=agents.find(a=>a.id===agentSelect.value)?.kind==='api';
  effortSelect.replaceChildren(new Option(fallback ? `默认 · ${effortName(fallback)}` : apiMode?'服务默认':'沿用本机配置', ''));
  for (const choice of choices) { const option = new Option(effortName(choice.reasoningEffort), choice.reasoningEffort); option.title = choice.description || ''; effortSelect.append(option); }
  if (choices.some(c => c.reasoningEffort === preferred)) effortSelect.value = preferred;
  effortSelect.title = choices.length ? '由当前 Agent 返回的原生思考强度，下一条消息生效' : '此 Agent / 默认模型未公开可选思考强度，沿用本机配置';
  controls();
}
async function persistChoice() {
  const value = { model: modelSelect.value, effort: effortSelect.value };
  preferences[agentSelect.value] = value;
  try { await api.setAgentPreferences(agentSelect.value, value); } catch (error) { status.title = `当前选择有效，但未能保存偏好：${errorText(error)}`; }
}
function scrollToBottom() { log.scrollTop = log.scrollHeight; }
function message(role, text) {
  $('chat-welcome')?.remove();
  const row = document.createElement('div'); row.className = `chat-message ${role}`;
  const speaker = document.createElement('span'); speaker.className = 'chat-speaker'; speaker.textContent = role === 'user' ? '你' : agentName();
  const body = document.createElement('div'); body.className = 'chat-message-body'; body.textContent = text;
  const note = document.createElement('span'); note.className = 'chat-message-note';
  row.append(speaker, body, note); log.append(row); scrollToBottom(); return { row, body, note };
}
function errorText(error) { return error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
function finish(event) {
  if (!active || active.id !== event.requestId) return;
  const reply = active.reply;
  finishNotes(event);
  if (active.chatId === conversation?.id) {
    reply.row.classList.remove('waiting');
    if (!active.hasText) reply.body.textContent = event.status === 'interrupted' ? '已停止生成。' : event.error ? '未能收到回复。' : 'Agent 未返回文字。';
    reply.note.textContent = event.error || (event.status === 'interrupted' ? '已停止' : ''); reply.note.classList.toggle('error', !!event.error);
  }
  $('chat-announcement').textContent = `${agentName()}：${event.error || reply.body.textContent}`;
  active = null; stop.disabled = false; stop.textContent = '停止生成'; controls(); scrollToBottom(); refreshChatOptions();
}
api.onCodexEvent(event => {
  if (event.agentId && event.agentId !== agentSelect.value) return;
  if (event.type === 'storage-error') { savingError(new Error(event.error)); finish({ ...event,status:'failed' }); return; }
  if (event.type === 'status') {
    connection = event.state; connecting = event.state === 'connecting';
    status.dataset.state = event.state; status.textContent = event.label; status.title = [event.label, event.model].filter(Boolean).join(' · ');
    $('agent-title').textContent = event.agentName || agentName();
    const selected=agents.find(a=>a.id===event.agentId);
    document.querySelector('#chat-title .full-access').textContent = selected?.kind==='api' ? selected.localTools?'API · 本机任务':'API · 对话' : ['codex','claude'].includes(event.agentId) ? '完全访问' : '本机 Agent';
    document.querySelector('#chat-title .full-access').title=selected?.kind==='api'?selected.localTools?'此 API 可执行本机任务':'此 API 仅用于文本对话':'使用所选本机 AI 的原生执行能力';
    connect.hidden = event.state === 'ready'; connect.textContent = '重新连接'; controls();
  } else if (event.type === 'models') {
    const previous = preferences[agentSelect.value] || { model: modelSelect.value, effort: effortSelect.value };
    models = event.models || []; defaultModel = event.defaultModel; defaultEffort = event.defaultEffort;
    const defaultName = models.find(m => m.model === defaultModel)?.name || defaultModel;
    modelSelect.replaceChildren(new Option(defaultName ? `默认 · ${defaultName}` : '沿用本机配置', ''));
    for (const item of models) { const option = new Option(item.name, item.model); option.title = item.description || ''; modelSelect.append(option); }
    if (models.some(m => m.model === previous.model)) modelSelect.value = previous.model;
    modelSelect.title = '由当前 AI 连接提供的模型列表，下一条消息生效'; refreshEfforts(previous.effort);
  } else if (event.type === 'tool' && active?.id === event.requestId && active.chatId === conversation?.id) active.reply.note.textContent = event.label;
  else if (event.type === 'image-updated' && active?.id === event.requestId && active.chatId === conversation?.id) active.reply.note.textContent = '图片已校验并保存，可继续预览和添加修改意见';
  else if (event.type === 'model-updated' && active?.id === event.requestId && active.chatId === conversation?.id) active.reply.note.textContent = event.delivery?.mode === 'render_only' ? '当前版本成图已校验并配对，未新增模型版本' : event.delivery?.mode === 'in_place' ? '当前版本已校验并更新，版本号保持不变' : event.delivery?.renderIncluded ? '新版本模型与成图已校验并配对' : '新版本模型已校验并保存';
  else if (event.type === 'message' && active?.id === event.requestId && active.chatId === conversation?.id) {
    const nearBottom = log.scrollHeight - log.clientHeight - log.scrollTop < 48;
    active.hasText = !!event.text; active.reply.row.classList.remove('waiting'); active.reply.body.textContent = event.text; if (nearBottom) scrollToBottom();
  } else if (event.type === 'done') finish(event);
});
async function connectSelected() {
  connecting = true; controls(); await showConversation();
  try { await api.connectCodex(agentSelect.value); }
  catch (error) { connection = 'error'; status.dataset.state = 'error'; status.textContent = errorText(error); status.title = status.textContent; connect.hidden = false; }
  finally { connecting = false; controls(); }
}
async function discover(desiredId) {
  connecting = true; controls();
  try {
    const result = await api.listAgents(); const previous = agentSelect.value;
    agents = result.agents; preferences = result.preferences || {};
    agentSelect.replaceChildren(...agents.map(a => new Option(a.name, a.id)));
    agentSelect.value = typeof desiredId==='string'&&agents.some(a=>a.id===desiredId)?desiredId:agents.some(a => a.id === previous) ? previous : result.selectedId;
    if (!agents.length) { agentSelect.append(new Option('未配置 AI', '')); throw new Error('未检测到本机 AI，请打开“AI 接入”配置 API 或本机程序路径。'); }
    await connectSelected();
  } catch (error) { connection = 'error'; status.dataset.state = 'error'; status.textContent = errorText(error); status.title = status.textContent; }
  finally { connecting = false; controls(); }
}
agentSelect.addEventListener('change', async () => { models = []; defaultModel = defaultEffort = null; modelSelect.replaceChildren(new Option('沿用本机配置', '')); refreshEfforts(''); await connectSelected(); });
$('agent-refresh').addEventListener('click', discover); connect.addEventListener('click', connectSelected);
modelSelect.addEventListener('change', async () => {
  refreshEfforts(); configuring = true; controls();
  try { await persistChoice(); await api.configureAgentModel(modelSelect.value, { ...window.workbenchModelContext?.(), conversationId: conversation?.id }); await persistChoice(); }
  catch (error) { status.textContent = errorText(error); status.title = status.textContent; }
  finally { configuring = false; controls(); }
}); effortSelect.addEventListener('change', persistChoice);
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault(); const sentDraft = input.value, text = sentDraft.trim(), submission = noteSubmission();
  if ((!text && !submission.versions.length) || active || submitting || connecting || configuring || loadingChat || !conversation || conversationScope !== scopeKey() || notesLoading() || !agentSelect.value) return;
  const flushError = api.flushChatDraft(conversation.id,sentDraft);
  if (flushError) { savingError(new Error(flushError)); return; }
  const context = window.workbenchModelContext?.() || null;
  creationOptions.close();
  const display = [text, submission.display ? `修改意见：\n${submission.display}` : ''].filter(Boolean).join('\n\n');
  notesError(null); message('user', display); const reply = message('assistant', `正在等待 ${agentName()}…`); reply.row.classList.add('waiting');
  const sentConversation = conversation.id;
  const id = crypto.randomUUID(); active = { id, chatId: sentConversation, reply, hasText: false }; submitting = { chatId: sentConversation }; controls();
  try {
    await api.sendCodex(text, id, { model: modelSelect.value, effort: effortSelect.value, context, editNotes: submission.versions, conversationId: sentConversation, sentDraft });
    if (conversation?.id === sentConversation && input.value === sentDraft) { input.value = ''; document.dispatchEvent(new CustomEvent('workbench:draft-restored')); }
  } catch (error) {
    if (conversation?.id === sentConversation && (!input.value || input.value === sentDraft)) { input.value = sentDraft; await api.saveChatDraft(sentConversation,sentDraft).catch(savingError); }
    finish({ requestId: id, status: 'failed', error: errorText(error) });
  } finally { submitting = null; controls(); if (!input.disabled) input.focus(); refreshChatOptions(); }
});
input.addEventListener('input', () => { controls(); saveDraft().catch(() => {}); });
document.addEventListener('workbench:notes', controls);
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!send.disabled) $('chat-form').requestSubmit(); } });
stop.addEventListener('click', async () => { if (!active) return; stop.disabled = true; stop.textContent = '正在停止…'; try { await api.stopCodex(); } catch (error) { if (active) { active.reply.note.textContent = errorText(error); stop.disabled = false; stop.textContent = '停止生成'; } } });
document.addEventListener('workbench:model', event => {
  const label = $('chat-model-context'); const detail = event.detail;
  label.textContent = detail?.projectId ? detail.assetId ? `当前模型：${detail.name}` : detail.renderId ? `${detail.imageRole === 'reference' ? '当前参考' : '当前图片'}：${detail.name}` : `当前项目：${detail.name}` : '创意首页 · 可直接对话';
  label.title = `${label.textContent}\nEnter 发送 · Shift + Enter 换行`; showConversation();
});
window.workbenchChatState = () => ({ connection, busy: !!active || !!submitting, agent: agentSelect.value, model: modelSelect.value, effort: effortSelect.value, modelCount: models.length, reasoningOptions: selectedModel()?.supportedReasoningEfforts || [], conversationId: conversation?.id || null, loadingChat, scope: conversationScope });
document.addEventListener('workbench:plot',event=>{$('chat-model-context').textContent=`当前数据图：${event.detail.name}`;});
setupAIConnections({onSaved:discover});
discover();
