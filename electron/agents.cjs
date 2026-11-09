const { EventEmitter } = require('node:events');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { CodexChat, findCodex } = require('./codex.cjs');
const { AGENT_INSTRUCTIONS } = require('./delivery.cjs');
const { MAX_AGENT_TEXT } = require('./point-edit-data.cjs');
const { APIChat } = require('./api-chat.cjs');
const exec = promisify(execFile);
const SPECS = [
  { id: 'claude', name: 'Claude Code', command: 'claude', package: '@anthropic-ai/claude-code', protocol: 'claude', args: ['--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--permission-mode', 'bypassPermissions'] },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', package: '@google/gemini-cli', protocol: 'acp', args: ['--acp', '--approval-mode', 'yolo'] },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', package: 'opencode-ai', protocol: 'acp', args: ['acp'] }
];

async function commandPath(command) {
  if (process.platform === 'win32') {
    try { const { stdout } = await exec('where.exe', [command], { windowsHide: true, timeout: 3000 }); return stdout.trim().split(/\r?\n/).find(Boolean); } catch { return null; }
  }
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(directory, command); try { await fs.access(candidate, 1); return candidate; } catch {}
  }
  return null;
}
async function locateAgent(spec, preferred) {
  const candidates = preferred ? [preferred] : [await commandPath(spec.command)];
  for (const directory of preferred ? [] : [path.join(os.homedir(), '.local/bin'), path.join(process.env.APPDATA || '', 'npm')]) {
    for (const extension of process.platform === 'win32' ? ['.exe', '.cmd'] : ['']) candidates.push(path.join(directory, spec.command + extension));
  }
  for (const candidate of candidates.filter(Boolean)) {
    try {
      if (!(await fs.stat(candidate)).isFile()) continue;
      if (process.platform !== 'win32' || /\.(exe|com)$/i.test(candidate)) return { ...spec, executable: candidate, prefixArgs: [] };
      // Resolve npm's known package entry point; no shell interpolation is used.
      const packageRoot = path.join(path.dirname(candidate), 'node_modules', spec.package);
      const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8'));
      const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.[spec.command];
      if (!bin) continue;
      const entry = path.resolve(packageRoot, bin); await fs.access(entry);
      const node = await commandPath(process.platform === 'win32' ? 'node.exe' : 'node');
      if (node) return { ...spec, executable: node, prefixArgs: [entry] };
    } catch { /* An incomplete installation must not appear as usable. */ }
  }
  return null;
}
async function resolveManualAgent(value) {
  const spec = value?.id === 'codex' ? {id:'codex',name:'Codex',command:'codex',package:'@openai/codex',protocol:'codex'} : SPECS.find(s=>s.id===value?.id);
  if(!spec)throw new Error('请选择支持的本机 AI 类型');
  if(typeof value.executable!=='string'||!path.isAbsolute(value.executable)||value.executable.length>2000)throw new Error('请选择本机程序的完整路径');
  if(!Array.isArray(value.prefixArgs)||value.prefixArgs.length>30||value.prefixArgs.some(v=>typeof v!=='string'||v.length>4000||v.includes('\0')))throw new Error('启动参数须为 JSON 字符串数组');
  const file=await fs.stat(value.executable).catch(()=>null);if(!file?.isFile())throw new Error('程序文件不存在，请检查路径');
  let resolved;
  if(/\.[cm]?js$/i.test(value.executable)){
    const node=await commandPath(process.platform==='win32'?'node.exe':'node');if(!node)throw new Error('未找到 Node.js；请选择 node.exe 并在参数数组中填写脚本路径');
    resolved={...spec,executable:node,prefixArgs:[value.executable]};
  }else resolved=await locateAgent(spec,value.executable);
  if(!resolved)throw new Error('无法解析此启动脚本；请选择程序本体，或指定 node.exe 并提供脚本路径');
  return {...resolved,prefixArgs:[...(resolved.prefixArgs || []),...value.prefixArgs],manual:true};
}
async function detectAgents() {
  const results = await Promise.all([findCodex().then(executable => ({ id: 'codex', name: 'Codex', executable, protocol: 'codex' })).catch(() => locateAgent({ id:'codex',name:'Codex',command:'codex',package:'@openai/codex',protocol:'codex' })), ...SPECS.map(locateAgent)]);
  return results.filter(Boolean);
}
const instructions = AGENT_INSTRUCTIONS.replace('中的 Codex', '中的本机 AI 助手') + '\n如果本 agent 没有提供 get_workbench_context / plan_workbench_delivery / publish_workbench_result 这些工作台专用工具，不要虚构调用；按本轮上下文的output操作，无计划时先理解用户需求并从deliveryOptions选择相应路径：model_edit默认下一版，render_only只补当前版PNG，keep_version仅在明确授权时可用。用原生命令/脚本工具完成，结束后工作台自动按实际文件检查、登记；不使用电脑操控作为默认执行方式。';
const flatten = options => (options || []).flatMap(o => Array.isArray(o.options) ? flatten(o.options) : [o]);

class NativeAgentChat extends EventEmitter {
  constructor({ spec, cwd, spawnProcess = spawn, prepareContext, completeContext, sessionPersistence }) {
    super(); Object.assign(this, { spec, cwd, spawnProcess, prepareContext, completeContext, sessionPersistence });
    this.state = 'disconnected'; this.models = []; this.pending = new Map(); this.sessions = new Map(); this.config = []; this.counter = 0; this.scope = 'home';
  }
  publish(event) { this.emit('event', event); }
  status(state, label) { this.state = state; this.label = label; this.publish({ type: 'status', state, label, model: this.model || null }); }
  snapshot() { return { state: this.state, label: this.label, model: this.model, models: this.models, defaultModel: this.defaultModel, defaultEffort: this.defaultEffort }; }
  write(packet) { this.child.stdin.write(JSON.stringify(packet) + '\n'); }
  request(method, params = {}, timeout = 30000) {
    const id = String(++this.counter), claude = this.spec.protocol === 'claude';
    return new Promise((resolve, reject) => {
      const timer = timeout ? setTimeout(() => { this.pending.delete(id); reject(new Error(`${this.spec.name} 响应超时，请重新连接。`)); }, timeout) : null;
      this.pending.set(id, { resolve, reject, timer });
      try { this.write(claude ? { type: 'control_request', request_id: id, request: { subtype: method, ...params } } : { jsonrpc: '2.0', id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  spawnChild(cwd, resume) {
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const args = [...(this.spec.prefixArgs || []), ...this.spec.args, ...(resume ? ['--resume', resume] : [])];
    const child = this.spawnProcess(this.spec.executable, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout });
    lines.on('line', line => { if (this.child !== child) return; try { this.receive(JSON.parse(line)); } catch { /* Ignore non-protocol diagnostic lines. */ } });
    child.stderr.on('data', () => {});
    const lost = () => { if (this.child === child) { this.closeChild(); this.finish('failed', `${this.spec.name} 已断开，请重新连接。`); this.status('error', `${this.spec.name} 已断开`); } };
    child.on('error', lost); child.on('exit', lost); child.stdin.on('error', lost);
    child.once('exit', () => lines.close());
  }
  async initializeClaude(cwd, resume) {
    this.spawnChild(cwd, resume);
    const result = await this.request('initialize', { hooks: {}, sdkMcpServers: [], appendSystemPrompt: instructions });
    this.models = (result.models || []).map(m => ({ model: m.value, name: m.displayName || m.value, description: m.description, resolvedModel: m.resolvedModel, supportedReasoningEfforts: (m.supportedEffortLevels || []).map(value => ({ reasoningEffort: value, description: value })) }));
    // Older CLIs do not expose resolved defaults. Keep their native configuration in that case.
    try { const result = await this.request('get_settings', {}, 5000); this.defaultModel = result.settings?.model || result.model || null; } catch {}
    this.currentEffort = null;
  }
  async connect() {
    if (this.closed) throw new Error('工作台正在关闭');
    if (this.state === 'ready' && this.child) return this.snapshot();
    if (this.connecting) return this.connecting;
    this.connecting = this.start().finally(() => { this.connecting = null; }); return this.connecting;
  }
  async start() {
    this.status('connecting', `正在连接 ${this.spec.name}…`);
    this.conversationId = null;
    try {
      await fs.mkdir(this.cwd, { recursive: true });
      if (this.spec.protocol === 'claude') { this.scope = 'home'; await this.initializeClaude(this.cwd, this.sessions.get('home')); }
      else {
        this.sessions.clear(); this.defaultModel = this.defaultEffort = null;
        this.spawnChild(this.cwd);
        const initialized = await this.request('initialize', { protocolVersion: 1, clientInfo: { name: 'visualization-workbench', version: '0.18.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
        this.canLoadSession = !!initialized.agentCapabilities?.loadSession;
        await this.acpSession('home', this.cwd);
      }
      this.status('ready', `已连接 · ${this.spec.name}`); this.publishModels(); return this.snapshot();
    } catch (error) { this.closeChild(); this.status('error', error.message); throw error; }
  }
  publishModels() { this.publish({ type: 'models', models: this.models, defaultModel: this.defaultModel, defaultEffort: this.defaultEffort }); }
  updateConfig(config, legacyModels) {
    if (config) this.config = config;
    const modelOption = this.config.find(o => o.category === 'model' && o.type === 'select');
    const thought = this.config.find(o => o.category === 'thought_level' && o.type === 'select');
    const efforts = flatten(thought?.options).map(o => ({ reasoningEffort: o.value, description: o.name || o.value }));
    if (modelOption) {
      this.models = flatten(modelOption.options).map(o => ({ model: o.value, name: o.name || o.value, description: o.description, supportedReasoningEfforts: efforts, defaultReasoningEffort: thought?.currentValue || null }));
      this.model = modelOption.currentValue;
    } else if (legacyModels) {
      this.models = (legacyModels.availableModels || []).map(m => ({ model: m.modelId, name: m.name || m.modelId, description: m.description, supportedReasoningEfforts: efforts }));
      this.model = legacyModels.currentModelId;
    }
    this.defaultModel ??= this.model; this.defaultEffort ??= thought?.currentValue;
  }
  async acpSession(scope, cwd, conversationId) {
    let session = this.sessions.get(scope);
    if (!session) {
      const saved = conversationId && this.sessionPersistence?.get(conversationId);
      if (saved && !this.canLoadSession) throw new Error('此 Agent 未提供历史会话恢复能力；记录和草稿仍保留，可使用新聊天。');
      session = await this.request(saved ? 'session/load' : 'session/new', { cwd, mcpServers: [], ...(saved ? { sessionId: saved } : {}) });
      if (saved) session.sessionId ||= saved;
      if (conversationId) this.sessionPersistence?.set(conversationId, session.sessionId);
      this.sessions.set(scope, session);
    }
    this.sessionId = session.sessionId; this.scope = scope; this.config = session.configOptions || [];
    this.defaultModel = session.workbenchDefaults?.model ?? null;
    this.defaultEffort = session.workbenchDefaults?.effort ?? null;
    this.updateConfig(this.config, session.models); this.publishModels();
    session.workbenchDefaults ||= { model: this.defaultModel, effort: this.defaultEffort };
  }
  async configureModel(model, context = {}) {
    if (this.spec.protocol !== 'acp') return;
    if (this.active) throw new Error('当前任务执行中，暂不能切换模型');
    await this.connect(); await this.acpSession(context.conversationId || context.projectId || 'home', context.directory || this.cwd, context.conversationId);
    const value = model || this.defaultModel;
    if (value && !this.models.some(m => m.model === value)) throw new Error('此 Agent / 项目未提供所选模型');
    const option = this.config.find(o => o.category === 'model' && o.type === 'select');
    if (value && option && value !== option.currentValue) {
      const result = await this.request('session/set_config_option', { sessionId: this.sessionId, configId: option.id, value });
      this.updateConfig(result.configOptions); const session = this.sessions.get(this.scope); if (session) session.configOptions = this.config;
    } else if (value && !option && this.model !== value) { await this.request('session/set_model', { sessionId: this.sessionId, modelId: value }); this.model = value; }
    this.publishModels();
  }
  receive(packet) {
    const claude = this.spec.protocol === 'claude';
    const response = claude && packet.type === 'control_response' ? packet.response : null;
    if (response || (!claude && packet.id != null && !packet.method)) {
      const id = String(response ? response.request_id : packet.id), pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(id);
      if (response?.subtype === 'error' || packet.error) pending.reject(new Error(response?.error || packet.error.message || 'Agent 请求失败'));
      else pending.resolve(response ? response.response || {} : packet.result || {});
      return;
    }
    if ((claude && packet.type === 'control_request') || (!claude && packet.id != null && packet.method)) {
      const request = claude ? packet.request : packet.params;
      if (claude) {
        const ask = request?.tool_name === 'AskUserQuestion' || !this.active || this.active.stopped;
        const result = ask ? { behavior: 'deny', message: '请用普通文字向用户提问并等待下一轮答复；无当前用户任务时不执行操作。' } : { behavior: 'allow', updatedInput: request?.input || {} };
        if (request?.subtype === 'can_use_tool') this.write({ type: 'control_response', response: { subtype: 'success', request_id: packet.request_id, response: result } });
        else this.write({ type: 'control_response', response: { subtype: 'error', request_id: packet.request_id, error: '请使用 agent 自带的工具能力，必要信息请用普通文字询问用户。' } });
      } else if (packet.method === 'session/request_permission') {
        const option = this.active && !this.active.stopped && request.sessionId === this.sessionId ? (request.options || []).find(o => o.kind === 'allow_once') : null;
        this.write({ jsonrpc: '2.0', id: packet.id, result: { outcome: option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' } } });
      } else this.write({ jsonrpc: '2.0', id: packet.id, error: { code: -32601, message: 'Use native agent tools; ask the user in plain text when input is needed.' } });
      return;
    }
    const active = this.active;
    if (claude && packet.type === 'system' && packet.subtype === 'init') {
      this.model = packet.model; this.sessions.set(this.scope, packet.session_id); this.saveClaudeSession(packet.session_id); return;
    }
    if (!claude && packet.method === 'session/update') {
      const p = packet.params || {}, u = p.update || {};
      if (p.sessionId !== this.sessionId) return;
      if (u.sessionUpdate === 'config_option_update') { this.updateConfig(u.configOptions); this.publishModels(); const session = this.sessions.get(this.scope); if (session) session.configOptions = this.config; }
      if (!active) return;
      if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') { active.items.set('reply', (active.items.get('reply') || '') + u.content.text); this.publishReply(); }
      if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') this.publish({ type: 'tool', requestId: active.id, label: u.title || 'Agent 正在执行本机任务…' });
      return;
    }
    if (!active || !claude) return;
    if (packet.type === 'stream_event') {
      const e = packet.event;
      if (e?.type === 'message_start') active.messageId = e.message?.id || 'reply';
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') { const key = active.messageId || 'reply'; active.items.set(key, (active.items.get(key) || '') + e.delta.text); this.publishReply(); }
    } else if (packet.type === 'assistant') {
      const message = packet.message || {}, text = (message.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (text) { active.items.set(message.id || active.messageId || 'reply', text); this.publishReply(); }
      if ((message.content || []).some(c => c.type === 'tool_use')) this.publish({ type: 'tool', requestId: active.id, label: 'Agent 正在执行本机任务…' });
    } else if (packet.type === 'result') {
      if (packet.session_id) { this.sessions.set(this.scope, packet.session_id); this.saveClaudeSession(packet.session_id); }
      if (!active.items.size && packet.result) { active.items.set('reply', packet.result); this.publishReply(); }
      if (active.stopped) this.finish('interrupted');
      else if (packet.is_error) this.finish('failed', packet.result || 'Agent 执行失败');
      else this.complete(active);
    }
  }
  publishReply() { const a = this.active; if (a) this.publish({ type: 'message', requestId: a.id, text: [...a.items.values()].join('\n\n') }); }
  saveClaudeSession(id) {
    if (this.conversationId && id) {
      try { this.sessionPersistence?.set(this.conversationId, id); }
      catch (error) { this.finish('failed', `会话保存失败：${error.message}`); }
    }
  }
  async send(text, id, options = {}) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_AGENT_TEXT || typeof id !== 'string' || id.length > 80) throw new Error('消息或修改意见过长，请减少内容后分批发送');
    if (this.active) throw new Error('请等待当前回复结束，或先停止生成');
    if (options.model && !this.models.some(m => m.model === options.model)) throw new Error('所选模型不在此 Agent 的列表中');
    const active = { id, items: new Map(), context: options.context || null }; this.active = active;
    try {
      await this.connect();
      active.prepared = this.prepareContext ? await this.prepareContext(active.context, text, options.conversationId) : null;
      if (active.stopped) return this.finish('interrupted');
      const cwd = active.prepared?.public.projectDirectory || this.cwd, scope = options.conversationId || active.context?.projectId || 'home';
      this.conversationId = options.conversationId;
      if (this.spec.protocol === 'claude' && scope !== this.scope) {
        const resume = this.sessions.get(scope) || (options.conversationId && this.sessionPersistence?.get(options.conversationId)); this.closeChild(); this.scope = scope; await this.initializeClaude(cwd, resume);
      } else if (this.spec.protocol === 'acp') await this.acpSession(scope, cwd, options.conversationId);
      if (options.model && !this.models.some(m => m.model === options.model)) throw new Error('此项目的 Agent 不支持所选模型');
      if (this.spec.protocol === 'claude') {
        await this.request('set_model', { model: options.model || 'default' });
        const info = this.models.find(m => m.model === (options.model || this.defaultModel));
        if (options.effort && !info?.supportedReasoningEfforts.some(e => e.reasoningEffort === options.effort)) throw new Error('当前模型不支持所选思考强度');
        if (options.effort || this.currentEffort) await this.request('apply_flag_settings', { settings: { effortLevel: options.effort || null } });
        this.currentEffort = options.effort || null;
      } else {
        const set = async (option, value) => { const r = await this.request('session/set_config_option', { sessionId: this.sessionId, configId: option.id, value }); this.updateConfig(r.configOptions); const s = this.sessions.get(scope); if (s) s.configOptions = this.config; this.publishModels(); };
        const m = this.config.find(o => o.category === 'model' && o.type === 'select');
        const model = options.model || this.defaultModel;
        if (model && m && m.currentValue !== model) await set(m, model);
        else if (model && !m && this.model !== model) { await this.request('session/set_model', { sessionId: this.sessionId, modelId: model }); this.model = model; }
        const thought = this.config.find(o => o.category === 'thought_level' && o.type === 'select');
        const effort = options.effort || (thought && flatten(thought.options).some(e => e.value === this.defaultEffort) ? this.defaultEffort : thought?.currentValue);
        if (effort && (!thought || !flatten(thought.options).some(e => e.value === effort))) throw new Error('此 Agent / 模型未提供所选思考强度');
        if (thought && effort && thought.currentValue !== effort) await set(thought, effort);
        this.publishModels();
      }
      if (active.stopped) return this.finish('interrupted');
      const prompt = text.trim() + '\n\n[工作台本轮上下文]\n' + JSON.stringify(active.prepared?.public || { project: null }) + (this.spec.protocol === 'acp' ? '\n\n[工作台约定]\n' + instructions : '');
      if (this.spec.protocol === 'claude') this.write({ type: 'user', message: { role: 'user', content: prompt }, parent_tool_use_id: null, session_id: this.sessions.get(scope) || '' });
      else {
        this.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text: prompt }] }, 0).then(result => { if (this.active === active) active.stopped || result.stopReason === 'cancelled' ? this.finish('interrupted') : this.complete(active); }).catch(error => { if (this.active === active) this.finish('failed', error.message); });
      }
    } catch (error) { if (this.active === active) this.finish('failed', error.message); throw error; }
  }
  async complete(active) {
    if (active.completing) return; active.completing = true;
    try { const update = this.completeContext ? await this.completeContext(active.prepared) : null; if (this.active !== active) return; if (update) this.publish({ type: update.image ? 'image-updated' : 'model-updated', requestId: active.id, ...update }); this.finish('completed'); }
    catch (error) { if (this.active === active) this.finish('failed', `交付检查未通过：${error.message}`); }
  }
  async stop() {
    if (!this.active) return; this.active.stopped = true;
    if (this.active.completing) return;
    if (this.spec.protocol === 'claude') await this.request('interrupt');
    else this.write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId: this.sessionId } });
  }
  finish(status, error) { if (!this.active) return; const id = this.active.id; this.active = null; this.publish({ type: 'done', requestId: id, status, error: error || null }); }
  closeChild() { const child = this.child; this.child = null; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`${this.spec.name} 连接已关闭`)); } this.pending.clear(); if (child) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill(); child.unref?.(); } }
  dispose() { this.closed = true; this.finish('interrupted','软件已关闭，未完成的任务未自动重试。'); this.closeChild(); }
}

class AgentManager extends EventEmitter {
  constructor(options) { super(); this.options = options; this.detect = options.detect || detectAgents; this.instances = new Map(); this.agents = []; }
  async discover() {
    if([...this.instances.values()].some(instance=>instance.active))throw new Error('请先等待当前任务结束，再更新 AI 连接');
    const detected=await this.detect(), configured=this.options.configuredAgents?await this.options.configuredAgents():[];
    const merged=new Map(detected.map(spec=>[spec.id,spec]));for(const spec of configured)merged.set(spec.id,spec);this.agents=[...merged.values()];
    for(const [id,instance] of this.instances){const spec=merged.get(id);if(!spec||JSON.stringify(instance.spec)!==JSON.stringify(spec)){instance.dispose();this.instances.delete(id);if(this.current===instance)this.current=null;}}
    return this.agents.map(a => ({id:a.id,name:a.name,...a.protocol==='api'?{kind:'api',localTools:a.connection.localTools}:{}}));
  }
  async connect(id) {
    if (this.current?.active) throw new Error('请先等待当前任务结束或停止生成，再切换 Agent');
    if (!this.agents.length) await this.discover();
    const spec = this.agents.find(a => a.id === id) || (!id ? this.agents.find(a => a.id === 'codex') || this.agents[0] : null);
    if (!spec) throw new Error('未找到可连接的本机 Agent。请先安装并登录，再重新检测。');
    let instance = this.instances.get(spec.id);
    if (!instance) {
      const options = { ...this.options, cwd: path.join(this.options.cwd, spec.id), spec, prefixArgs:spec.prefixArgs || [], locate: async () => spec.executable };
      instance = spec.protocol === 'api' ? new APIChat(options) : spec.id === 'codex' ? new CodexChat(options) : new NativeAgentChat(options);
      instance.spec=spec;
      instance.on('event', event => { if (this.current === instance) this.emit('event', { ...event, agentId: spec.id, agentName: spec.name }); });
      this.instances.set(spec.id, instance);
    }
    this.current = instance; this.selectedId = spec.id;
    const snapshot = await instance.connect();
    // A cached connection still needs to repopulate the selectors after switching back.
    this.emit('event', { type: 'status', ...snapshot, agentId: spec.id, agentName: spec.name });
    this.emit('event', { type: 'models', models: snapshot.models, defaultModel: snapshot.defaultModel, defaultEffort: snapshot.defaultEffort, agentId: spec.id, agentName: spec.name });
    return { ...snapshot, agentId: spec.id, agentName: spec.name };
  }
  async send(text, id, options) { if (!this.current) await this.connect(); return this.current.send(text, id, options); }
  configureModel(model, context) { return this.current?.configureModel?.(model, context); }
  stop() { return this.current?.stop(); }
  dispose() { for (const instance of this.instances.values()) instance.dispose(); }
}
module.exports = { AgentManager, NativeAgentChat, detectAgents, locateAgent, resolveManualAgent };
