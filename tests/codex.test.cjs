const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { CodexChat } = require('../electron/codex.cjs');

async function fixture(t, options = {}) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-chat-'));
  const requests = [], children = [], events = [];
  let heldTurn;
  const chat = new CodexChat({ cwd, sessionPersistence: options.sessionPersistence, toolHandler: options.toolHandler, prepareContext: options.prepareContext, locate: async () => 'codex.exe', spawnProcess: (_executable, _args, settings) => {
    assert.equal(settings.windowsHide, true);
    const child = new EventEmitter();
    let threadCount = 0;
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.killed = true; child.emit('exit', 0); };
    child.deliver = data => child.stdout.write(JSON.stringify(data) + '\n');
    let buffer = '';
    child.stdin.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        requests.push(message);
        if (message.id === undefined) continue;
        const reply = result => queueMicrotask(() => child.deliver({ id: message.id, result }));
        if (message.method === 'initialize') reply({});
        else if (message.method === 'account/read') reply({ account: options.unauthenticated ? null : { type: 'chatgpt', email: 'not-forwarded@example.test' } });
        else if (message.method === 'model/list') reply({ data: [{ model: 'configured-model', displayName: 'Default', defaultReasoningEffort: 'low', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }] }, { model: 'alternative-model', displayName: 'Alternative', defaultReasoningEffort: 'medium', supportedReasoningEfforts: [{ reasoningEffort: 'medium' }, { reasoningEffort: 'ultra' }] }], nextCursor: null });
        else if (message.method === 'thread/start') { threadCount++; reply({ thread: { id: `thread-${children.length}${threadCount === 1 ? '' : '-scope-' + threadCount}` }, model: 'configured-model', reasoningEffort: 'high' }); }
        else if (message.method === 'thread/resume') {
          if(options.resumeError)queueMicrotask(()=>child.deliver({id:message.id,error:{message:'保存的会话不可恢复'}}));
          else reply({thread:{id:message.params.threadId},model:'configured-model'});
        }
        else if (message.method === 'turn/start') {
          const start = () => { child.deliver({ method: 'turn/started', params: { threadId: chat.threadId, turn: { id: 'turn-1' } } }); reply({ turn: { id: 'turn-1' } }); };
          if (options.holdTurn) heldTurn = start; else start();
        } else if (message.method === 'turn/interrupt') {
          reply({});
          queueMicrotask(() => child.deliver({ method: 'turn/completed', params: { threadId: chat.threadId, turn: { id: 'turn-1', status: 'interrupted' } } }));
        }
      }
    });
    children.push(child);
    return child;
  } });
  chat.on('event', event => events.push(event));
  t.after(async () => { chat.dispose(); await fs.rm(cwd, { recursive: true, force: true }); });
  return { chat, requests, children, events, release: () => heldTurn() };
}

test('Codex receives validated image paths as native localImage inputs', async t => {
  const { chat, requests } = await fixture(t, { prepareContext: async () => ({ public: { imageInputs: ['D:/项目/成图.png'] }, images: ['D:/项目/成图.png'] }) });
  await chat.send('修改图片中的指定位置', 'image');
  const input = requests.find(r => r.method === 'turn/start').params.input;
  assert.equal(input[0].type, 'text');
  assert.deepEqual(input[1], { type: 'localImage', path: 'D:/项目/成图.png' });
});

test('image requests inherit the text style library without rewriting user input or attaching reference images', async t => {
  const { chat, requests } = await fixture(t);
  const text = '生成一张光学芯片概念参考图，使用白色背景和中文标签，暂时不要建模。';
  await chat.send(text, 'text-style');
  const rules = requests.find(r => r.method === 'thread/start').params.developerInstructions;
  for (const part of ['工作台内置文字视觉风格库', '默认风格：nature-scientific', '科普插画', '科技封面', '不能被预设覆盖', '不自行启动生图', '本轮没有生成图片', '不为参考图复制 GLB']) assert.ok(rules.includes(part), part);
  const input = requests.find(r => r.method === 'turn/start').params.input;
  assert.equal(input.length, 1);
  assert.equal(input[0].type, 'text');
  assert.ok(input[0].text.startsWith(text));
  assert.ok(!input[0].text.includes('工作台内置文字视觉风格库'));
  assert.ok(!rules.includes('Nature概念图100'));
});

test('internally assembled note batches can exceed the plain chat field limit without truncation', async t => {
  const { chat, requests } = await fixture(t), text = '修改意见内容'.repeat(3000);
  await chat.send(text, 'batch');
  assert.ok(text.length > 12000);
  assert.ok(requests.find(r => r.method === 'turn/start').params.input[0].text.startsWith(text));
});

test('streams UTF-8 across chunks, reconciles the final item, and preserves conversation without forwarding account data', async t => {
  const { chat, requests, children, events } = await fixture(t);
  await chat.send('保留换行\n`$() 字符', 'first');
  await assert.rejects(chat.send('同时发送', 'overlap'), /等待当前回复/);
  const child = children[0];
  const packet = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { threadId: chat.threadId, turnId: 'turn-1', itemId: 'answer', delta: '你好' } }) + '\n');
  const index = packet.indexOf(Buffer.from('你')) + 1;
  child.stdout.write(packet.subarray(0, index)); child.stdout.write(packet.subarray(index));
  child.deliver({ method: 'item/completed', params: { threadId: chat.threadId, turnId: 'turn-1', item: { type: 'agentMessage', id: 'answer', text: '你好' } } });
  child.deliver({ method: 'turn/completed', params: { threadId: chat.threadId, turn: { id: 'turn-1', status: 'completed' } } });
  assert.equal(events.filter(x => x.type === 'message').at(-1).text, '你好');
  assert.equal(chat.active, null);
  await chat.send('继续', 'second');
  assert.equal(requests.filter(x => x.method === 'thread/start').length, 1);
  assert.ok(requests.find(x => x.method === 'turn/start').params.input[0].text.startsWith('保留换行\n`$() 字符'));
  const thread = requests.find(x => x.method === 'thread/start').params;
  assert.equal(thread.sandbox, 'danger-full-access'); assert.equal(thread.cwd, chat.cwd);
  assert.equal(thread.approvalPolicy, 'never');
  assert.deepEqual(requests.find(x => x.method === 'turn/start').params.sandboxPolicy, { type: 'dangerFullAccess' });
  assert.equal(thread.model, undefined); // Use the existing Codex configuration.
  assert.ok(!JSON.stringify(events).includes('not-forwarded@example.test'));
});

test('explicit model selection is applied to the turn and default selection restores the configured model', async t => {
  const { chat, requests, children } = await fixture(t);
  await chat.send('选择其他模型', 'alternate', { model: 'alternative-model' });
  assert.equal(requests.filter(x => x.method === 'turn/start').at(-1).params.model, 'alternative-model');
  children[0].deliver({ method: 'turn/completed', params: { threadId: chat.threadId, turn: { id: 'turn-1', status: 'completed' } } });
  await chat.send('恢复默认', 'default', { model: '' });
  assert.equal(requests.filter(x => x.method === 'turn/start').at(-1).params.model, 'configured-model');
});

test('only registered tools in the active turn receive the captured model context', async t => {
  const calls = [];
  const { chat, children, events } = await fixture(t, { toolHandler: async (name, args, context) => { calls.push({ name, args, context }); return { arrays: [] }; } });
  await chat.send('读取结构', 'tools', { context: { projectId: 'project', assetId: 'asset' } });
  children[0].deliver({ id: 'tool-1', method: 'item/tool/call', params: { threadId: chat.threadId, turnId: 'turn-1', tool: 'get_model_structure', arguments: {} } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, [{ name: 'get_model_structure', args: {}, context: { projectId: 'project', assetId: 'asset' } }]);
  children[0].deliver({ id: 'tool-2', method: 'item/tool/call', params: { threadId: chat.threadId, turnId: 'turn-1', tool: 'arbitrary_file_write', arguments: {} } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.ok(events.some(x => x.type === 'tool'));
});

test('a stop before the turn ID arrives interrupts as soon as the turn starts', async t => {
  const { chat, requests, events, release } = await fixture(t, { holdTurn: true });
  const sending = chat.send('一条消息', 'early-stop');
  while (!requests.some(x => x.method === 'turn/start')) await new Promise(resolve => setImmediate(resolve));
  await chat.stop();
  assert.equal(requests.some(x => x.method === 'turn/interrupt'), false);
  release(); await sending;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.filter(x => x.method === 'turn/interrupt').length, 1);
  assert.equal(events.filter(x => x.type === 'done').at(-1).status, 'interrupted');
  assert.equal(chat.active, null);
});

test('process loss releases the busy state and permits a clean reconnect', async t => {
  const { chat, children, events } = await fixture(t);
  await chat.send('第一条', 'disconnect');
  children[0].emit('exit', 1);
  assert.equal(chat.active, null); assert.equal(chat.state, 'error');
  assert.equal(events.filter(x => x.type === 'done').length, 1);
  await chat.send('重新连接', 'reconnect');
  assert.equal(children.length, 2); assert.equal(chat.state, 'ready');
  assert.equal(chat.threadId, 'thread-2');
});

test('missing login produces an actionable error and shuts down only the owned process', async t => {
  const { chat, children, requests } = await fixture(t, { unauthenticated: true });
  await assert.rejects(chat.send('测试', 'no-auth'), /尚未登录/);
  assert.equal(chat.active, null); assert.equal(chat.state, 'error');
  assert.equal(children[0].killed, true);
  assert.equal(requests.some(x => x.method === 'thread/start'), false);
});

test('native effort catalogs drive actual turn options and reject unsupported combinations', async t => {
  const { chat, requests, children } = await fixture(t);
  const finish = () => children[0].deliver({ method: 'turn/completed', params: { threadId: chat.threadId, turn: { id: 'turn-1', status: 'completed' } } });
  await chat.send('沿用本机配置', 'native');
  assert.equal(requests.filter(r => r.method === 'turn/start').at(-1).params.effort, 'high'); finish();
  await chat.send('明确模型的默认档', 'model-default', { model: 'configured-model' });
  assert.equal(requests.filter(r => r.method === 'turn/start').at(-1).params.effort, 'low'); finish();
  await chat.send('原生特殊档', 'ultra', { model: 'alternative-model', effort: 'ultra' });
  assert.equal(requests.filter(r => r.method === 'turn/start').at(-1).params.effort, 'ultra'); finish();
  const before = requests.filter(r => r.method === 'turn/start').length;
  await assert.rejects(chat.send('拒绝错配', 'invalid', { model: 'alternative-model', effort: 'high' }), /不支持/);
  assert.equal(requests.filter(r => r.method === 'turn/start').length, before);
});

test('home and projects use independent conversations while returning to a project resumes its thread', async t => {
  const { chat, requests, children } = await fixture(t);
  const ids = [];
  for (const projectId of [null, 'p1', 'p2', 'p1', null]) {
    await chat.send('本轮上下文', 'turn-' + ids.length, { context: projectId ? { projectId } : null }); ids.push(chat.threadId);
    children[0].deliver({ method: 'turn/completed', params: { threadId: chat.threadId, turn: { id: 'turn-1', status: 'completed' } } });
  }
  assert.equal(new Set(ids).size, 3); assert.equal(ids[1], ids[3]); assert.equal(ids[0], ids[4]);
  assert.equal(requests.filter(r => r.method === 'thread/start').length, 3);
});
test('persistent chats resume their recorded native thread after reconnect; new chats stay independent', async t => {
  const sessions = new Map(), {chat,requests,children} = await fixture(t,{sessionPersistence:{get:id=>sessions.get(id),set:(id,value)=>sessions.set(id,value)}});
  await chat.send('旧聊天','one',{conversationId:'c1'});const native=chat.threadId;
  children[0].deliver({method:'turn/completed',params:{threadId:native,turn:{id:'turn-1',status:'completed'}}});
  assert.equal(requests.filter(r=>r.method==='thread/start').at(-1).params.ephemeral,false);
  children[0].emit('exit',1);await chat.send('继续旧聊天','two',{conversationId:'c1'});
  assert.equal(chat.threadId,native);assert.equal(requests.filter(r=>r.method==='thread/resume').at(-1).params.threadId,native);
  children[1].deliver({method:'turn/completed',params:{threadId:native,turn:{id:'turn-1',status:'completed'}}});
  await chat.send('全新话题','three',{conversationId:'c2'});
  assert.notEqual(chat.threadId,native);assert.equal(sessions.get('c1'),native);assert.equal(sessions.size,2);
});
test('a failed native resume does not silently start a replacement conversation', async t => {
  const {chat,requests}=await fixture(t,{resumeError:true,sessionPersistence:{get:()=> 'saved-thread',set:()=>assert.fail('must preserve original ID')}});
  await assert.rejects(chat.send('继续','r',{conversationId:'existing'}),/不可恢复/);
  assert.equal(requests.filter(r=>r.method==='thread/start').length,1); // connection's unused ephemeral home only
  assert.equal(requests.filter(r=>r.method==='turn/start').length,0);
});
