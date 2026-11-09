const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { NativeAgentChat, AgentManager } = require('../electron/agents.cjs');

async function fixture(t, protocol, hold = false, options = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-agents-'));
  const requests = [], children = [], events = [];
  let sessionCount = 0;
  const chat = new NativeAgentChat({ cwd, sessionPersistence: options.sessionPersistence, spec: { name: protocol, protocol, executable: 'native-agent.exe', args: [] },
    prepareContext: async context => context ? { public: { projectDirectory: cwd, projectId: context.projectId } } : null,
    completeContext: async value => value ? { source: { projectId: value.public.projectId, assetId: null }, project: { id: value.public.projectId }, model: { name: 'generated.glb' } } : null,
    spawnProcess: (_exe, args, spawnSettings) => {
      assert.equal(spawnSettings.windowsHide, true); assert.equal(spawnSettings.shell, undefined);
      const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.args = args;
      child.kill = () => child.emit('exit', 0); child.deliver = p => child.stdout.write(JSON.stringify(p) + '\n');
      let buffer = '', model = 'native-a', effort = 'brief';
      const config = () => [
        { id: 'model-choice', category: 'model', type: 'select', currentValue: model, options: [{ value: 'native-a', name: 'Native A' }, { value: 'native-b', name: 'Native B' }] },
        { id: 'thinking', category: 'thought_level', type: 'select', currentValue: effort, options: (model === 'native-a' ? ['brief', 'deep'] : ['deep']).map(value => ({ value, name: value })) }
      ];
      child.stdin.on('data', chunk => {
        buffer += chunk.toString();
        while (buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), packet = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); requests.push(packet);
          const method = protocol === 'claude' ? packet.request?.subtype : packet.method;
          const p = protocol === 'claude' ? packet.request : packet.params;
          const reply = result => queueMicrotask(() => child.deliver(protocol === 'claude' ? { type: 'control_response', response: { subtype: 'success', request_id: packet.request_id, response: result } } : { jsonrpc: '2.0', id: packet.id, result }));
          if (method === 'initialize') reply(protocol === 'claude' ? { models: [{ value: 'native-a', displayName: 'Native A', supportedEffortLevels: ['low', 'xhigh'] }, { value: 'native-b', displayName: 'Native B', supportedEffortLevels: ['medium'] }] } : { protocolVersion: 1, agentCapabilities:{loadSession:!!options.loadSession} });
          else if (method === 'get_settings') reply({ settings: { model: 'native-a' } });
          else if (method === 'set_model') { model = p.model; reply({}); }
          else if (method === 'apply_flag_settings') reply({});
          else if (method === 'session/new') { model = p.cwd.endsWith('project-b') ? 'native-b' : 'native-a'; effort = model === 'native-b' ? 'deep' : 'brief'; reply({ sessionId: 'session-' + ++sessionCount, configOptions: config() }); }
          else if (method === 'session/load') reply({sessionId:p.sessionId,configOptions:config()});
          else if (method === 'session/set_config_option') { if (p.configId === 'model-choice') { model = p.value; if (model === 'native-b') effort = 'deep'; } else effort = p.value; reply({ configOptions: config() }); }
          else if (method === 'interrupt') { reply({}); queueMicrotask(() => child.deliver({ type: 'result', result: '', session_id: 'claude-session' })); }
          else if (method === 'session/cancel') { const pending = requests.findLast(r => r.method === 'session/prompt'); if (pending) queueMicrotask(() => child.deliver({ jsonrpc: '2.0', id: pending.id, result: { stopReason: 'cancelled' } })); }
          else if (method === 'session/prompt' && !hold) {
            queueMicrotask(() => child.deliver({ method: 'session/update', params: { sessionId: p.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ACP 回复' } } } })); reply({ stopReason: 'end_turn' });
          } else if (packet.type === 'user') {
            queueMicrotask(() => {
              child.deliver({ type: 'system', subtype: 'init', session_id: 'claude-session-' + children.length, model });
              child.deliver({ type: 'stream_event', event: { type: 'message_start', message: { id: 'message-1' } } });
              child.deliver({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Claude 回复' } } });
              child.deliver({ type: 'assistant', message: { id: 'message-1', content: [{ type: 'text', text: 'Claude 回复' }] } });
              if (!hold) child.deliver({ type: 'result', result: 'Claude 回复', session_id: 'claude-session-' + children.length });
            });
          }
        }
      }); children.push(child); return child;
    }
  });
  chat.on('event', e => events.push(e));
  t.after(async () => { chat.dispose(); await fs.rm(cwd, { recursive: true, force: true }); });
  return { chat, requests, children, events };
}
const done = chat => new Promise(resolve => { const listener = e => { if (e.type === 'done') { chat.off('event', listener); resolve(e); } }; chat.on('event', listener); });

test('Claude discovers native models, applies the chosen effort, reconciles streams and registers project output', async t => {
  const { chat, requests, events } = await fixture(t, 'claude');
  const connected = await chat.connect(); assert.deepEqual(connected.models[0].supportedReasoningEfforts.map(x => x.reasoningEffort), ['low', 'xhigh']);
  const result = done(chat); await chat.send('构建项目', 'claude-1', { model: 'native-a', effort: 'xhigh', context: { projectId: 'p1' } });
  assert.equal((await result).status, 'completed');
  assert.equal(requests.findLast(p => p.request?.subtype === 'set_model').request.model, 'native-a');
  assert.equal(requests.findLast(p => p.request?.subtype === 'apply_flag_settings').request.settings.effortLevel, 'xhigh');
  assert.equal(events.filter(e => e.type === 'message').at(-1).text, 'Claude 回复');
  assert.ok(events.some(e => e.type === 'model-updated' && e.source.projectId === 'p1'));
});
test('ACP model changes refresh native reasoning options before the next prompt and never invent effort values', async t => {
  const { chat, requests, events } = await fixture(t, 'acp'); await chat.connect();
  await chat.configureModel('native-b');
  assert.deepEqual(events.filter(e => e.type === 'models').at(-1).models[0].supportedReasoningEfforts.map(e => e.reasoningEffort), ['deep']);
  const result = done(chat); await chat.send('任务', 'acp-1', { model: 'native-b', effort: 'deep' }); assert.equal((await result).status, 'completed');
  assert.ok(requests.some(r => r.method === 'session/set_config_option' && r.params.value === 'native-b'));
  const count = requests.filter(r => r.method === 'session/prompt').length;
  await assert.rejects(chat.send('错配', 'acp-invalid', { model: 'native-b', effort: 'brief' }), /未提供/);
  assert.equal(requests.filter(r => r.method === 'session/prompt').length, count);
});
for (const protocol of ['claude', 'acp']) test(`${protocol} cancellation releases the busy state`, async t => {
  const { chat } = await fixture(t, protocol, true); await chat.connect(); await chat.send('长任务', 'stop');
  const result = done(chat); await chat.stop(); assert.equal((await result).status, 'interrupted'); assert.equal(chat.active, null);
});
for (const protocol of ['claude', 'acp']) test(`${protocol} receives the same automatic text styles and keeps the original request`, async t => {
  const { chat, requests } = await fixture(t, protocol);
  await chat.connect();
  const text = '请给光学器件生成参考图，用水彩风格和中文说明，只给提示词，不实际生图。';
  const completed = done(chat);
  await chat.send(text, 'text-styles');
  assert.equal((await completed).status, 'completed');
  const turn = protocol === 'claude' ? requests.find(r => r.type === 'user').message.content : requests.find(r => r.method === 'session/prompt').params.prompt[0].text;
  const rules = protocol === 'claude' ? requests.find(r => r.request?.subtype === 'initialize').request.appendSystemPrompt : turn;
  for (const part of ['工作台内置文字视觉风格库', '默认风格：nature-scientific', '科普插画', '科技封面', '不能被预设覆盖', '本轮没有生成图片']) assert.ok(rules.includes(part), part);
  assert.ok(turn.startsWith(text));
  assert.ok(!rules.includes('Nature概念图100'));
  if (protocol === 'acp') assert.deepEqual(requests.find(r => r.method === 'session/prompt').params.prompt.map(p => p.type), ['text']);
});

test('agent discovery does not advertise missing installations and refuses switching during a running task', async t => {
  const manager = new AgentManager({ cwd: os.tmpdir(), detect: async () => [{ id: 'codex', name: 'Codex', executable: 'test.exe' }] });
  assert.deepEqual(await manager.discover(), [{ id: 'codex', name: 'Codex' }]);
  await assert.rejects(manager.connect('missing'), /未找到/);
  manager.current = { active: {} }; await assert.rejects(manager.connect('codex'), /等待当前任务/);
});

test('switching agents refreshes each native catalog and restores a cached connection', async t => {
  const claude = await fixture(t, 'claude'), acp = await fixture(t, 'acp');
  const manager = new AgentManager({ cwd:os.tmpdir(), detect:async()=>[
    {id:'claude',name:'Claude Code',protocol:'claude',executable:'claude',args:[]},
    {id:'gemini',name:'Gemini CLI',protocol:'acp',executable:'gemini',args:[]}
  ], spawnProcess:(exe,...rest)=>(exe==='claude'?claude.chat:acp.chat).spawnProcess(exe,...rest) });
  t.after(()=>manager.dispose()); const events=[]; manager.on('event',e=>events.push(e));
  await manager.connect('claude'); await manager.connect('gemini'); await manager.connect('claude');
  const catalog=events.filter(e=>e.type==='models').at(-1);
  assert.equal(catalog.agentId,'claude'); assert.deepEqual(catalog.models[0].supportedReasoningEfforts.map(e=>e.reasoningEffort),['low','xhigh']);
  assert.equal(claude.children.length,1); assert.equal(acp.children.length,1);
});

test('ACP session-specific defaults follow project configuration and restore when returning home', async t => {
  const {chat}=await fixture(t,'acp');await chat.connect();
  const directory=path.join(chat.cwd,'project-b');await fs.mkdir(directory);
  await chat.configureModel('',{projectId:'project-b',directory});assert.equal(chat.defaultModel,'native-b');assert.equal(chat.defaultEffort,'deep');
  await chat.configureModel('',{});assert.equal(chat.defaultModel,'native-a');assert.equal(chat.defaultEffort,'brief');
});

for (const protocol of ['claude','acp']) test(`${protocol} restores recorded sessions in a new adapter and keeps new chats independent`, async t => {
  const sessions=new Map(),sessionPersistence={get:id=>sessions.get(id),set:(id,value)=>sessions.set(id,value)},options={sessionPersistence,loadSession:true};
  const a=await fixture(t,protocol,false,options);const first=done(a.chat);await a.chat.send('第一轮','one',{conversationId:'old'});await first;const saved=sessions.get('old');assert.ok(saved);a.chat.dispose();
  const b=await fixture(t,protocol,false,options);const second=done(b.chat);await b.chat.send('继续','two',{conversationId:'old'});await second;
  if(protocol==='claude'){const args=b.children.at(-1).args;assert.equal(args[args.indexOf('--resume')+1],saved);}
  else assert.equal(b.requests.find(r=>r.method==='session/load').params.sessionId,saved);
  const next=done(b.chat);await b.chat.send('新话题','three',{conversationId:'new'});await next;
  if(protocol==='claude')assert.ok(!b.children.at(-1).args.includes('--resume'));
  else assert.equal(b.requests.filter(r=>r.method==='session/load').length,1);
  assert.ok(sessions.has('new'));
});
test('ACP without native resume support preserves history instead of silently starting a replacement', async t => {
  const {chat,requests}=await fixture(t,'acp',false,{sessionPersistence:{get:()=> 'saved-session',set:()=>assert.fail('must not replace saved session')}});
  await assert.rejects(chat.send('继续','r',{conversationId:'old'}),/未提供历史会话恢复/);
  assert.equal(requests.filter(r=>r.method==='session/prompt').length,0);
});
