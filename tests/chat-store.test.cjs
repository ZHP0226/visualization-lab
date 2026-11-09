const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ChatStore } = require('../electron/chat-store.cjs');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'workbench-chats-'));
  const file = path.join(dir,'chats.sqlite'); let store = new ChatStore(file);
  t.after(() => { store?.close(); fs.rmSync(dir,{recursive:true,force:true}); });
  return { get store() { return store; }, reopen() { store.close(); store = new ChatStore(file); return store; }, file };
}
test('multiple chats preserve independent Unicode drafts, messages and selected history after reopening', t => {
  const f = fixture(t), first = f.store.open('p1','codex').chat.id;
  f.store.draft(first,'第一行\n中文🙂\n布光：白底棚');
  const second = f.store.create('p1','codex').chat.id;
  f.store.draft(second,'未发送的第二份'); f.store.setSession(first,'native-thread-1');
  f.store.begin(first,'turn1','你好','你好','不匹配的旧草稿');
  f.store.event(first,{type:'message',requestId:'turn1',text:'你好，保留完整回答。'});
  f.store.event(first,{type:'done',requestId:'turn1',status:'completed'});
  const store=f.reopen(), selected=store.open('p1','codex');
  assert.equal(selected.chat.id,second); assert.equal(selected.chat.draft,'未发送的第二份');
  const old=store.open('p1','codex',first).chat;
  assert.equal(old.draft,'第一行\n中文🙂\n布光：白底棚'); assert.equal(old.messages[1].text,'你好，保留完整回答。');
  assert.equal(old.messages[1].status,'completed'); assert.equal(store.getSession(first),'native-thread-1');
  assert.equal(old.session,undefined); assert.equal(store.list('p1','codex').chats.length,2);
});
test('sending clears only the submitted draft and an overlapping new draft survives', t => {
  const {store}=fixture(t),id=store.create(null,'codex').chat.id;
  store.draft(id,'发送内容');store.begin(id,'r1','发送内容','发送内容','发送内容');
  assert.equal(store.open(null,'codex',id).chat.draft,'');
  store.event(id,{type:'done',requestId:'r1',status:'completed'});
  store.draft(id,'发送时刚输入的新内容');store.begin(id,'r2','旧内容','旧内容','旧内容');
  assert.equal(store.open(null,'codex',id).chat.draft,'发送时刚输入的新内容');
});
test('projects, agents, home and native sessions cannot be silently mixed', t => {
  const {store}=fixture(t),id=store.create('p1','codex').chat.id;
  assert.throws(()=>store.open('p2','codex',id),/不属于/);
  assert.throws(()=>store.require(id,'p1','claude'),/不属于/);
  assert.throws(()=>store.open(null,'codex',id),/不属于/);
  assert.throws(()=>store.open(null,'unknown'),/无效/);
  assert.throws(()=>store.draft(id,'x'.repeat(12001)),/12000/);
  assert.equal(store.list('p2','codex').chats.length,0);
});
test('interrupted replies are retained and late events cannot change the completed transcript', t => {
  const f=fixture(t),id=f.store.create(null,'codex').chat.id;
  f.store.begin(id,'r','用户消息','用户消息','');f.store.event(id,{type:'message',requestId:'r',text:'已经收到的部分'});
  assert.throws(()=>f.store.begin(id,'overlap','重复','重复',''),/正在执行/);
  const store=f.reopen();let message=store.open(null,'codex',id).chat.messages[1];
  assert.equal(message.text,'已经收到的部分');assert.equal(message.status,'interrupted');
  store.event(id,{type:'message',requestId:'r',text:'旧事件'});
  assert.equal(store.open(null,'codex',id).chat.messages[1].text,'已经收到的部分');
});
test('database transactions prevent partial user-only turns and coordinate separate writers', t => {
  const f=fixture(t),id=f.store.create('p','codex').chat.id,other=new ChatStore(f.file);
  try {
    other.draft(id,'另一窗口的草稿');assert.equal(f.store.open('p','codex',id).chat.draft,'另一窗口的草稿');
    f.store.begin(id,'r','一次','一次','');f.store.event(id,{type:'done',requestId:'r',status:'failed',error:'连接失败'});
    assert.throws(()=>other.begin(id,'r','重复','重复',''));
    const messages=f.store.open('p','codex',id).chat.messages;
    assert.equal(messages.length,2);assert.equal(messages[1].note,'连接失败');
  } finally { other.close(); }
});
test('a process exiting without database cleanup preserves the latest draft and partial answer', t => {
  const f=fixture(t),id=f.store.create(null,'codex').chat.id;
  const script=`const {ChatStore}=require(${JSON.stringify(path.resolve(__dirname,'../electron/chat-store.cjs'))});const s=new ChatStore(process.argv[1]);s.draft(process.argv[2],'退出前最后输入🙂');s.begin(process.argv[2],'crash','消息','消息','');s.event(process.argv[2],{type:'message',requestId:'crash',text:'崩溃前已收到'});process.exit(0);`;
  require('node:child_process').execFileSync(process.execPath,['-e',script,f.file,id],{stdio:'pipe'});
  const other=new ChatStore(f.file);
  try { const c=other.open(null,'codex',id).chat;assert.equal(c.draft,'退出前最后输入🙂');assert.equal(c.messages[1].text,'崩溃前已收到');assert.equal(c.messages[1].status,'interrupted'); }
  finally { other.close(); }
});
