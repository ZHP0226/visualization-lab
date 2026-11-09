const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const API_ID = /^api_[a-f0-9-]{36}$/;
const LOCAL_IDS = ['codex', 'claude', 'gemini', 'opencode'];

function normalizeAPI(value) {
  if (!value || typeof value !== 'object') throw new Error('无效的 API 配置');
  const name = String(value.name || '').trim(), model = String(value.model || '').trim();
  if (!name || name.length > 60) throw new Error('请填写连接名称（最多60字）');
  if (model.length > 150 || /[\r\n]/.test(model)) throw new Error('模型 ID 无效');
  let url; try { url = new URL(value.baseURL); } catch { throw new Error('请填写完整的 http:// 或 https:// 服务地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('服务地址须为 HTTP(S)，不要在地址中放密钥或查询参数');
  url.pathname = url.pathname.replace(/\/(chat\/completions|models)\/?$/, '').replace(/\/$/, '') || '/v1';
  return { name, model, baseURL: url.toString().replace(/\/$/, ''), localTools: value.localTools === true };
}
function headers(key) { return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }; }
async function requestAPI(config, key, suffix, options = {}) {
  let response;
  try { response = await fetch(config.baseURL + suffix, { ...options, headers: { ...headers(key), ...options.headers }, redirect: 'error', signal: options.signal || AbortSignal.timeout(15000) }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new Error('无法连接 API，请检查服务地址、网络或证书'); }
  if (!response.ok) {
    await response.body?.cancel();
    const advice = ({401:'请检查 API Key',403:'请检查权限',404:'请检查服务地址；如不提供模型列表，可手填模型 ID',429:'服务限流或额度不足'})[response.status] || '请检查服务配置';
    throw Object.assign(new Error(`API 返回 HTTP ${response.status}，${advice}`), { status: response.status });
  }
  return response;
}
async function listModels(config, key, signal) {
  const response = await requestAPI(config, key, '/models', { signal });
  const value = await response.json().catch(() => { throw Object.assign(new Error('服务未返回有效的模型列表'),{catalogUnavailable:true}); });
  if (!Array.isArray(value.data)) throw Object.assign(new Error('服务未返回兼容的模型列表，可手填模型 ID'),{catalogUnavailable:true});
  const ids = [...new Set(value.data.map(row => row?.id).filter(id => typeof id === 'string' && id.trim() && id.length <= 150))];
  if (!ids.length) throw Object.assign(new Error('服务返回了空模型列表，请手填模型 ID'),{catalogUnavailable:true});
  return ids.map(model => ({ model, name: model, supportedReasoningEfforts: [] }));
}

class AIConnections {
  constructor(file, encryption) { this.file = file; this.encryption = encryption; this.queue = Promise.resolve(); }
  async read() {
    try { const data = JSON.parse(await fs.readFile(this.file, 'utf8')); if (data.schema !== 1 || !Array.isArray(data.apis) || !data.local) throw new Error(); return data; }
    catch (error) { if (error.code === 'ENOENT') return { schema: 1, apis: [], local: {} }; throw new Error('AI 配置文件无法读取，原文件未覆盖'); }
  }
  change(fn) {
    const op = this.queue.then(async () => {
      const data = await this.read(), result = await fn(data);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      try { await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, this.file); }
      finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      return result;
    }); this.queue = op.catch(() => {}); return op;
  }
  publicAPI(row) { const { keyCipher, ...publicValue } = row; return { ...publicValue, hasKey: !!keyCipher }; }
  async publicConfig() { const data = await this.read(); return { apis: data.apis.map(row => this.publicAPI(row)), local: data.local }; }
  async encrypt(key) {
    const e = this.encryption, available = e.isAsyncEncryptionAvailable ? await e.isAsyncEncryptionAvailable() : e.isEncryptionAvailable();
    if (!available) throw new Error('系统密钥保护当前不可用，未保存 API Key，请稍后重试');
    return (e.encryptStringAsync ? await e.encryptStringAsync(key) : e.encryptString(key)).toString('base64');
  }
  async decrypt(row) {
    if (!row.keyCipher) return '';
    try { const e = this.encryption, data = Buffer.from(row.keyCipher, 'base64'); const value=e.decryptStringAsync?(await e.decryptStringAsync(data)).result:e.decryptString(data);if(typeof value!=='string')throw new Error();return value; }
    catch { throw new Error('API Key 无法解密，请在 AI 接入中重新填写'); }
  }
  async keyFor(input, data) {
    if (input.clearKey) return '';
    if (typeof input.key === 'string' && input.key) { if (input.key.length > 8000 || /[\r\n]/.test(input.key)) throw new Error('API Key 格式无效'); return input.key; }
    const old = data.apis.find(row => row.id === input.id); return old ? this.decrypt(old) : '';
  }
  async saveAPI(input) {
    const value = normalizeAPI(input);
    return this.change(async data => {
      if (input.id && (!API_ID.test(input.id) || !data.apis.some(row => row.id === input.id))) throw new Error('连接不存在，请重新选择');
      const old = data.apis.find(row => row.id === input.id), key = await this.keyFor(input, data);
      const row = { id: old?.id || 'api_' + randomUUID(), ...value, keyCipher: key ? await this.encrypt(key) : null };
      const index = data.apis.findIndex(p => p.id === row.id); if (index >= 0) data.apis[index] = row; else data.apis.push(row);
      return this.publicAPI(row);
    });
  }
  async saveLocal(spec) {
    if (!LOCAL_IDS.includes(spec.id)) throw new Error('不支持的本机 AI 协议');
    return this.change(data => { data.local[spec.id] = spec; return spec; });
  }
  async remove(id) { return this.change(data => { if (LOCAL_IDS.includes(id)) delete data.local[id]; else if (API_ID.test(id)) data.apis = data.apis.filter(row => row.id !== id); else throw new Error('无效的连接'); }); }
  async specs() {
    const data = await this.read();
    return [...Object.values(data.local), ...data.apis.map(row => ({ id: row.id, name: row.name, protocol: 'api', connection: row }))];
  }
  async test(input) { const config = normalizeAPI(input), key = await this.keyFor(input, await this.read()); return { models: await listModels(config, key) }; }
}
module.exports = { AIConnections, API_ID, LOCAL_IDS, normalizeAPI, listModels, requestAPI };
