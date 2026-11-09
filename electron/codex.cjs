const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const { EventEmitter } = require('node:events');
const { TOOL_SPECS } = require('./model-edit.cjs');
const { DELIVERY_TOOLS, AGENT_INSTRUCTIONS } = require('./delivery.cjs');
const { MAX_AGENT_TEXT } = require('./point-edit-data.cjs');
const WORKBENCH_TOOLS = [...TOOL_SPECS, ...DELIVERY_TOOLS];

async function findCodex() {
  if (process.platform !== 'win32') return 'codex';
  try {
    const { stdout } = await promisify(execFile)('where.exe', ['codex.exe'], { windowsHide: true });
    const candidate = stdout.trim().split(/\r?\n/)[0];
    if (candidate) return candidate;
  } catch { /* Desktop installations may not be on the inherited PATH. */ }
  const directory = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  try {
    const candidates = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const executable = path.join(directory, entry.name, 'codex.exe');
      try { candidates.push({ executable, modified: (await fs.stat(executable)).mtimeMs }); } catch { /* Not a CLI build. */ }
    }
    candidates.sort((a, b) => b.modified - a.modified);
    if (candidates.length) return candidates[0].executable;
  } catch { /* Report an actionable error below. */ }
  throw new Error('未找到本机 Codex。请先安装并登录 Codex，再重新连接。');
}

class CodexChat extends EventEmitter {
  constructor({ cwd, spawnProcess = spawn, locate = findCodex, prefixArgs = [], toolHandler, prepareContext, completeContext, sessionPersistence }) {
    super();
    this.cwd = cwd;
    this.spawnProcess = spawnProcess;
    this.locate = locate;
    this.prefixArgs = prefixArgs;
    this.toolHandler = toolHandler;
    this.prepareContext = prepareContext;
    this.completeContext = completeContext;
    this.sessionPersistence = sessionPersistence;
    this.models = [];
    this.pending = new Map();
    this.nextId = 1;
    this.state = 'disconnected';
    this.threadId = null;
    this.threads = new Map();
    this.active = null;
    this.process = null;
    this.connecting = null;
  }
  publish(event) { this.emit('event', event); }
  status(state, label) {
    this.state = state;
    this.label = label;
    this.publish({ type: 'status', state, label, model: this.model || null });
  }
  snapshot() { return { state: this.state, label: this.label || '未连接', model: this.model || null, defaultModel: this.defaultModel, defaultEffort: this.defaultEffort || null, models: this.models }; }
  write(message) { this.process.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params, timeout = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Codex 响应超时，请重新连接后重试。'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  connect() {
    if (this.closed) return Promise.reject(new Error('工作台正在关闭。'));
    if (this.state === 'ready' && this.process) return Promise.resolve(this.snapshot());
    if (this.connecting) return this.connecting;
    this.connecting = this.start().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  async start() {
    this.status('connecting', '正在连接本机 Codex…');
    try {
      await fs.mkdir(this.cwd, { recursive: true });
      const executable = await this.locate();
      if (this.closed) throw new Error('工作台正在关闭。');
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const child = this.spawnProcess(executable, [...this.prefixArgs, 'app-server', '--listen', 'stdio://'], {
        cwd: this.cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
      });
      this.process = child;
      const lines = readline.createInterface({ input: child.stdout });
      lines.on('line', line => {
        if (this.process !== child) return;
        let message;
        try { message = JSON.parse(line); } catch { return; }
        this.receive(message);
      });
      child.stderr.on('data', () => {}); // Diagnostics may include local account details; never forward them to the renderer.
      child.stdin.on('error', () => this.disconnected(child, 'Codex 连接已断开，请重新连接。'));
      child.on('error', () => this.disconnected(child, '无法启动本机 Codex，请检查安装后重新连接。'));
      child.on('exit', () => { lines.close(); this.disconnected(child, 'Codex 已断开，请重新连接。'); });
      await this.request('initialize', { clientInfo: { name: 'visualization_workbench', title: 'Visualization Workbench', version: '0.8.0' }, capabilities: { experimentalApi: true } });
      this.write({ method: 'initialized', params: {} });
      const account = await this.request('account/read', { refreshToken: false });
      if (!account.account) throw new Error('Codex 尚未登录。请先在 Codex 中登录，再点击重新连接。');
      const models = []; let cursor;
      do {
        const result = await this.request('model/list', { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) });
        models.push(...result.data); cursor = result.nextCursor;
      } while (cursor);
      this.models = models.map(item => ({ model: item.model, name: item.displayName || item.model, description: item.description, defaultReasoningEffort: item.defaultReasoningEffort || null, supportedReasoningEfforts: item.supportedReasoningEfforts || [] }));
      const thread = await this.createThread('home', this.cwd);
      this.threadId = thread.thread.id;
      this.model = thread.model;
      this.defaultModel = thread.model;
      this.defaultEffort = thread.reasoningEffort || this.models.find(item => item.model === thread.model)?.defaultReasoningEffort || null;
      this.status('ready', account.account.type === 'chatgpt' ? '已连接 · Codex 登录' : '已连接 · 本机 Codex');
      this.publish({ type: 'models', models: this.models, defaultModel: this.defaultModel, defaultEffort: this.defaultEffort });
      return this.snapshot();
    } catch (error) {
      this.shutdown();
      this.status('error', error.message);
      throw error;
    }
  }
  async createThread(scope, cwd, conversationId) {
    const saved = conversationId && this.sessionPersistence?.get(conversationId);
    const params = {
      cwd, approvalPolicy: 'never', sandbox: 'danger-full-access',
      dynamicTools: this.toolHandler ? WORKBENCH_TOOLS : [], developerInstructions: AGENT_INSTRUCTIONS
    };
    const { dynamicTools, ...resumeParams } = params;
    const result = saved ? await this.request('thread/resume', { ...resumeParams, threadId: saved, excludeTurns: true })
      : await this.request('thread/start', { ...params, ephemeral: !conversationId });
    if (conversationId) this.sessionPersistence?.set(conversationId, result.thread.id);
    this.threads.set(scope, result.thread.id);
    return result;
  }
  receive(message) {
    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex 请求失败'));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      if (message.method === 'item/tool/call') this.runTool(message);
      else this.write({ id: message.id, error: { code: -32601, message: 'This client request is not implemented by the workbench UI.' } });
      return;
    }
    const p = message.params || {};
    const active = this.active;
    if (!active || p.threadId !== this.threadId) return;
    if (message.method === 'turn/started') {
      active.turnId = p.turn.id;
      this.interruptIfRequested();
    } else if (message.method === 'item/agentMessage/delta') {
      if (active.turnId && p.turnId !== active.turnId) return;
      active.items.set(p.itemId, (active.items.get(p.itemId) || '') + p.delta);
      this.publish({ type: 'message', requestId: active.id, text: [...active.items.values()].join('\n\n') });
    } else if (message.method === 'item/completed' && p.item?.type === 'agentMessage') {
      if (active.turnId && p.turnId !== active.turnId) return;
      active.items.set(p.item.id, p.item.text);
      this.publish({ type: 'message', requestId: active.id, text: [...active.items.values()].join('\n\n') });
    } else if (message.method === 'turn/completed' && (!active.turnId || active.turnId === p.turn.id)) {
      if (this.completeContext && p.turn.status === 'completed') this.completeTurn(active, p.turn);
      else this.finish(p.turn.status, p.turn.error?.message);
    } else if (message.method === 'item/started' && ['commandExecution', 'fileChange', 'mcpToolCall'].includes(p.item?.type)) {
      this.publish({ type: 'tool', requestId: active.id, kind: p.item.type, label: p.item.type === 'commandExecution' ? '正在执行本机命令…' : p.item.type === 'fileChange' ? '正在修改文件…' : '正在调用本机配置的工具…' });
    } else if (message.method === 'error' && !p.willRetry) {
      this.finish('failed', p.error?.message || 'Codex 生成失败，请重试。');
    }
  }
  async completeTurn(active, turn) {
    if (active.completing) return;
    active.completing = true;
    try {
      const update = await this.completeContext(active.prepared);
      if (this.active !== active) return;
      if (update) this.publish({ type: update.image ? 'image-updated' : 'model-updated', requestId: active.id, ...update });
      this.finish(turn.status, turn.error?.message);
    } catch (error) { if (this.active === active) this.finish('failed', `交付检查未通过：${error.message}`); }
  }
  async runTool(message) {
    const active = this.active, child = this.process, p = message.params || {};
    let result;
    try {
      if (!this.toolHandler || !active || active.stopRequested || p.threadId !== this.threadId || (active.turnId && p.turnId !== active.turnId) || !WORKBENCH_TOOLS.some(tool => tool.name === p.tool)) throw new Error('此工具调用无效或对话已停止');
      this.publish({ type: 'tool', requestId: active.id, label: p.tool === 'publish_workbench_image' ? '正在检查并登记图片…' : p.tool === 'save_workbench_structure_plan' ? '正在保存结构拆解与复现代码…' : p.tool === 'get_model_structure' ? '正在读取模型结构…' : p.tool === 'publish_workbench_result' ? '正在检查格式、命名和成图对应…' : p.tool === 'get_workbench_context' ? '正在读取项目与交付约定…' : '正在修改阵列并保存新版本…' });
      const value = await this.toolHandler(p.tool, p.arguments, active.context, () => this.active !== active || active.stopRequested, active.prepared);
      if (value.update) {
        active.context = { projectId: value.update.project.id, assetId: value.update.model?.assetId || null, ...(value.update.image ? { renderId: value.update.image.renderId } : {}) };
        this.publish({ type: value.update.image ? 'image-updated' : 'model-updated', requestId: active.id, ...value.update, edit: value.details });
      }
      result = { contentItems: [{ type: 'inputText', text: JSON.stringify(value.output || value) }], success: true };
    } catch (error) { result = { contentItems: [{ type: 'inputText', text: error.message }], success: false }; }
    if (this.process === child && child) this.write({ id: message.id, result });
  }
  async send(text, id, options = {}) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_AGENT_TEXT || typeof id !== 'string' || id.length > 80) throw new Error('消息或修改意见过长，请减少内容后分批发送。');
    if (this.active) throw new Error('请等待当前回复结束，或先停止生成。');
    if (options.model != null && (typeof options.model !== 'string' || options.model.length > 150)) throw new Error('无效的 AI 模型');
    if (options.effort != null && (typeof options.effort !== 'string' || options.effort.length > 80)) throw new Error('无效的思考强度');
    const context = options.context && typeof options.context.projectId === 'string' && (options.context.assetId == null || typeof options.context.assetId === 'string') ? { projectId: options.context.projectId, assetId: options.context.assetId || null, ...(typeof options.context.renderId === 'string' ? { renderId: options.context.renderId } : {}), ...(typeof options.context.renderHash === 'string' && /^[a-f0-9]{64}$/.test(options.context.renderHash) ? { renderHash: options.context.renderHash } : {}), ...(typeof options.context.selectedStructure === 'string' ? { selectedStructure: options.context.selectedStructure.slice(0, 200) } : {}) } : null;
    this.active = { id, context, turnId: null, items: new Map(), stopRequested: false, interrupting: false };
    const active = this.active;
    try {
      await this.connect();
      if (active.stopRequested) { this.finish('interrupted'); return; }
      const model = options.model || this.defaultModel;
      if (options.model && !this.models.some(item => item.model === options.model)) throw new Error('此 AI 模型未在当前 Codex 可选列表中');
      const modelInfo = this.models.find(item => item.model === model);
      const supported = modelInfo?.supportedReasoningEfforts || [];
      if (options.effort && !supported.some(item => item.reasoningEffort === options.effort)) throw new Error('当前模型不支持所选思考强度');
      let effort = options.effort || (!options.model ? this.defaultEffort : modelInfo?.defaultReasoningEffort);
      if (effort && supported.length && !supported.some(item => item.reasoningEffort === effort)) effort = modelInfo?.defaultReasoningEffort;
      this.model = model;
      active.prepared = this.prepareContext ? await this.prepareContext(context, text, options.conversationId) : null;
      if (this.active !== active || active.stopRequested) { if (this.active === active) this.finish('interrupted'); return; }
      const scope = options.conversationId || context?.projectId || 'home';
      if (!this.threads.has(scope)) await this.createThread(scope, active.prepared?.public.projectDirectory || this.cwd, options.conversationId);
      this.threadId = this.threads.get(scope);
      if (this.active !== active || active.stopRequested) { if (this.active === active) this.finish('interrupted'); return; }
      const contextNote = active.prepared ? '\n\n[工作台本轮上下文]\n' + JSON.stringify(active.prepared.public) : '\n\n[工作台状态：本轮未关联项目。]';
      const input = [{ type: 'text', text: text.trim() + contextNote }, ...(active.prepared?.images || []).map(path => ({ type: 'localImage', path }))];
      const result = await this.request('turn/start', { threadId: this.threadId, model, ...(effort ? { effort } : {}), cwd: active.prepared?.public.projectDirectory || this.cwd, sandboxPolicy: { type: 'dangerFullAccess' }, approvalPolicy: 'never', input });
      if (this.active !== active) return;
      active.turnId = result.turn.id;
      this.interruptIfRequested();
    } catch (error) {
      if (this.active === active) { this.shutdown(error.message); this.status('error', error.message); }
      throw error;
    }
  }
  async stop() {
    if (!this.active) return;
    this.active.stopRequested = true;
    await this.interruptIfRequested();
  }
  async interruptIfRequested() {
    const active = this.active;
    if (!active?.stopRequested || !active.turnId || active.interrupting || active.completing) return;
    active.interrupting = true;
    try { await this.request('turn/interrupt', { threadId: this.threadId, turnId: active.turnId }); }
    catch (error) { if (this.active === active) { this.shutdown(); this.status('error', error.message); } }
  }
  finish(status, error) {
    if (!this.active) return;
    const id = this.active.id;
    this.active = null;
    this.publish({ type: 'done', requestId: id, status, error: error || null });
  }
  disconnected(child, reason) {
    if (this.process !== child) return;
    this.shutdown(reason);
    this.status('error', reason);
  }
  shutdown(reason = 'Codex 连接已关闭。') {
    const child = this.process;
    this.process = null;
    this.threadId = null;
    this.threads.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(reason)); }
    this.pending.clear();
    this.finish('failed', reason);
    if (child) { child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.kill(); child.unref?.(); }
  }
  dispose() { this.closed = true; this.finish('interrupted','软件已关闭，未完成的任务未自动重试。'); this.shutdown(); }
}
module.exports = { CodexChat, findCodex };
