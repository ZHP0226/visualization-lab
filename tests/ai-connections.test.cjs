const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {AIConnections,normalizeAPI}=require('../electron/ai-connections.cjs');
const {APIChat,projectFile}=require('../electron/api-chat.cjs');
const {AgentManager,resolveManualAgent}=require('../electron/agents.cjs');
const {ChatStore}=require('../electron/chat-store.cjs');
async function fixture(t,handler){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vl-ai-connection-'));
  const cleanup=[];
  const key=crypto.randomBytes(32),encryption={isEncryptionAvailable:()=>true,encryptString:s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(s),c.final(),c.getAuthTag()]);},decryptString:b=>{const c=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}};
  encryption.isAsyncEncryptionAvailable=async()=>encryption.isEncryptionAvailable();encryption.encryptStringAsync=async s=>{assert.equal(typeof s,'string');return encryption.encryptString(s);};encryption.decryptStringAsync=async data=>({result:encryption.decryptString(data),shouldReEncrypt:false});
  const store=new AIConnections(path.join(directory,'connections.json'),encryption);
  const server=http.createServer(handler || ((_req,res)=>res.end(JSON.stringify({data:[{id:'model-a'},{id:'model-b'}]}))));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const baseURL=`http://127.0.0.1:${server.address().port}/v1`;
  t.after(async()=>{for(const close of cleanup)await close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.ok(directory.startsWith(path.join(os.tmpdir(),'vl-ai-connection-')));await fs.rm(directory,{recursive:true,force:true});});
  return {directory,store,baseURL,encryption,cleanup};
}
async function packet(req){let body='';for await(const data of req)body+=data;return JSON.parse(body);}
function sse(res,value){res.write('data: '+JSON.stringify(value)+'\r\n\r\n');}
function text(res,value){res.setHeader('Content-Type','text/event-stream');sse(res,{choices:[{delta:{content:value}}]});sse(res,{choices:[{delta:{},finish_reason:'stop'}]});res.end('data: [DONE]\n\n');}
function call(res,name,args){res.setHeader('Content-Type','text/event-stream');const raw=JSON.stringify(args);sse(res,{choices:[{delta:{tool_calls:[{index:0,id:'tool-1',type:'function',function:{name,arguments:raw.slice(0,4)}}]}}]});sse(res,{choices:[{delta:{tool_calls:[{index:0,function:{arguments:raw.slice(4)}}]},finish_reason:'tool_calls'}]});res.end('data: [DONE]\n\n');}
const done=chat=>new Promise(resolve=>{const listener=e=>{if(e.type==='done'){chat.off('event',listener);resolve(e);}};chat.on('event',listener);});
test('API config encrypts keys, preserves them through edits, clears explicitly and removes without touching chats',async t=>{
  const {store,directory,baseURL}=await fixture(t),secret='qa-only-not-a-real-key';
  let row=await store.saveAPI({name:'测试 API',baseURL,model:'model-a',key:secret});assert.equal(row.hasKey,true);assert.equal(row.keyCipher,undefined);assert.equal(row.key,undefined);
  assert.ok(!(await fs.readFile(store.file,'utf8')).includes(secret));assert.equal(await store.decrypt((await store.read()).apis[0]),secret);
  row=await store.saveAPI({...row,name:'更新名称',key:''});assert.equal(await store.decrypt((await store.read()).apis[0]),secret);
  row=await store.saveAPI({...row,clearKey:true});assert.equal(row.hasKey,false);
  await fs.writeFile(path.join(directory,'chats.sqlite'),'preserve');await store.remove(row.id);assert.deepEqual((await store.publicConfig()).apis,[]);assert.equal(await fs.readFile(path.join(directory,'chats.sqlite'),'utf8'),'preserve');
});
test('API validation rejects credential URLs and corrupt configs; unavailable encryption never saves plaintext',async t=>{
  const {store,baseURL}=await fixture(t);for(const url of ['file:///tmp/a','https://key:secret@api.test/v1','https://api.test/v1?key=secret'])assert.throws(()=>normalizeAPI({name:'x',baseURL:url}));
  store.encryption.isEncryptionAvailable=()=>false;await assert.rejects(store.saveAPI({name:'x',baseURL,key:'secret'}),/系统密钥保护/);await assert.rejects(fs.stat(store.file),{code:'ENOENT'});
  await fs.writeFile(store.file,'bad data');await assert.rejects(store.saveAPI({name:'x',baseURL}),/原文件未覆盖/);assert.equal(await fs.readFile(store.file,'utf8'),'bad data');
});
test('model test uses real HTTP auth, accepts manual model fallback only for a missing catalog and hides server errors',async t=>{
  const seen=[];let status=200;const {store,baseURL,directory}=await fixture(t,(req,res)=>{seen.push(req.headers.authorization);res.statusCode=status;res.end(status===200?JSON.stringify({data:[{id:'model-a'}]}):'secret diagnostic');});
  const row=await store.saveAPI({name:'x',baseURL,key:'qa-auth',model:'manual-model'});assert.equal((await store.test({...row,key:''})).models[0].model,'model-a');assert.equal(seen[0],'Bearer qa-auth');
  status=401;await assert.rejects(store.test(row),error=>error.message.includes('HTTP 401')&&!error.message.includes('secret diagnostic'));
  const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r)});t.after(()=>chat.dispose());await assert.rejects(chat.connect(),/401/);
  status=404;assert.equal((await chat.connect()).defaultModel,'manual-model');assert.match(chat.label,/待发送验证/);
});
test('standalone API streams Chinese, reconstructs durable completed conversation and isolates failed turns',async t=>{
  let request;const {store,baseURL,directory,cleanup}=await fixture(t,async(req,res)=>{if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}request=await packet(req);text(res,'接口流式回复：中文。');});
  const row=await store.saveAPI({name:'x',baseURL,model:'model-a'}),db=new ChatStore(path.join(directory,'chats.sqlite'));cleanup.push(()=>db.close());
  const conversation=db.create(null,row.id).chat;db.begin(conversation.id,'old','旧问题','旧问题','');db.event(conversation.id,{type:'message',requestId:'old',text:'旧答复'});db.event(conversation.id,{type:'done',requestId:'old',status:'completed'});
  db.begin(conversation.id,'failed','失败问题','失败问题','');db.event(conversation.id,{type:'done',requestId:'failed',status:'failed'});
  const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r),apiHistory:id=>db.apiHistory(id)});t.after(()=>chat.dispose());const events=[];chat.on('event',e=>events.push(e));
  const ended=done(chat);await chat.send('当前问题','new',{conversationId:conversation.id});assert.equal((await ended).status,'completed');
  assert.equal(request.messages[1].content,'旧问题');assert.equal(request.messages[2].content,'旧答复');assert.equal(request.messages.length,4);assert.equal(request.tools,undefined);assert.ok(events.some(e=>e.text==='接口流式回复：中文。'));
  assert.throws(()=>db.scope(null,'untrusted-agent'),/无效/);
});
test('opted-in API executes streamed tool calls in a real private project, publishes existing workbench updates and returns tool outputs',async t=>{
  let count=0;const requests=[];const {store,baseURL,directory}=await fixture(t,async(req,res)=>{
    if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}const body=await packet(req);requests.push(body);count++;
    if(count===1)call(res,'write_project_file',{file:'scripts/check.cjs',content:"require('node:fs').writeFileSync('output.txt','真实文件');process.stdout.write('运行成功');"});
    else if(count===2)call(res,'run_local_program',{executable:process.execPath,args:['scripts/check.cjs'],timeoutSeconds:10});
    else if(count===3)call(res,'read_project_file',{file:'output.txt'});
    else if(count===4)call(res,'get_workbench_context',{});
    else text(res,'已核对测试文件。');
  });
  await store.saveAPI({name:'x',baseURL,model:'model-a',localTools:true});let completed=false;const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r),prepareContext:async()=>({public:{projectDirectory:directory}}),completeContext:async()=>{completed=true;return null;},toolHandler:async(name)=>{assert.equal(name,'get_workbench_context');return {project:'fixture'};}});t.after(()=>chat.dispose());
  const ended=done(chat);await chat.send('写入并运行测试脚本','tools',{context:{projectId:'fixture'}});assert.equal((await ended).status,'completed');assert.equal(await fs.readFile(path.join(directory,'output.txt'),'utf8'),'真实文件');assert.equal(completed,true);assert.ok(requests[2].messages.some(m=>m.role==='tool'&&m.content.includes('运行成功')));assert.ok(requests[4].messages.some(m=>m.role==='tool'&&m.content.includes('fixture')));
  await assert.rejects(projectFile(directory,'../escape.txt',true),/超出/);await fs.mkdir(path.join(directory,'outside'));await fs.symlink(os.tmpdir(),path.join(directory,'outside/link'),'junction');await assert.rejects(projectFile(directory,'outside/link/escape.txt',true),/超出/);
});
test('stop aborts the real API stream and keeps the received partial reply without replay',async t=>{
  const {store,baseURL,directory}=await fixture(t,async(req,res)=>{if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}await packet(req);res.setHeader('Content-Type','text/event-stream');sse(res,{choices:[{delta:{content:'部分回复'}}]});});
  await store.saveAPI({name:'x',baseURL,model:'model-a'});const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r)});t.after(()=>chat.dispose());
  const partial=new Promise(resolve=>chat.on('event',e=>{if(e.type==='message')resolve(e.text);})),ended=done(chat);await chat.send('等待','stop');assert.equal(await partial,'部分回复');await chat.stop();assert.equal((await ended).status,'interrupted');assert.equal(chat.active,null);
});
test('manual executable and arguments are validated; manager overrides automatic detection and invalidates only changed instances',async t=>{
  const {directory}=await fixture(t);await assert.rejects(resolveManualAgent({id:'unknown',executable:process.execPath,prefixArgs:[]}),/类型/);await assert.rejects(resolveManualAgent({id:'codex',executable:'relative.exe',prefixArgs:[]}),/完整路径/);
  const spec=await resolveManualAgent({id:'codex',executable:process.execPath,prefixArgs:['entry.cjs']});assert.deepEqual(spec.prefixArgs,['entry.cjs']);assert.equal(spec.manual,true);
  let configured=[spec];const manager=new AgentManager({cwd:directory,detect:async()=>[{id:'codex',name:'Codex',executable:'auto'}],configuredAgents:async()=>configured});t.after(()=>manager.dispose());await manager.discover();assert.equal(manager.agents[0].executable,process.execPath);
  let disposed=false;const instance={spec,dispose:()=>{disposed=true;}};manager.instances.set('codex',instance);await manager.discover();assert.equal(disposed,false);configured=[];await manager.discover();assert.equal(disposed,true);assert.equal(manager.agents[0].executable,'auto');
});
test('a provider-requested local tool cannot execute when this API has not been opted in',async t=>{
  const {store,baseURL,directory}=await fixture(t,async(req,res)=>{if(req.method==='GET'){res.end(JSON.stringify({data:[{id:'model-a'}]}));return;}await packet(req);call(res,'write_project_file',{file:'must-not-exist.txt',content:'no'});});
  await store.saveAPI({name:'x',baseURL,model:'model-a'});const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r)});t.after(()=>chat.dispose());
  const ended=done(chat);await chat.send('只对话','disabled-tool');assert.equal((await ended).status,'failed');await assert.rejects(fs.stat(path.join(directory,'must-not-exist.txt')),{code:'ENOENT'});
});
test('stopping a local program waits for process termination before exposing the adapter as idle',async t=>{
  const {store,baseURL,directory}=await fixture(t);await store.saveAPI({name:'x',baseURL,model:'model-a',localTools:true});const chat=new APIChat({cwd:directory,spec:{connection:(await store.read()).apis[0]},decryptConnection:r=>store.decrypt(r)});t.after(()=>chat.dispose());
  const active={id:'child',controller:new AbortController(),cwd:directory};chat.active=active;
  active.running=chat.runProgram(active,{executable:process.execPath,args:['-e',"require('node:fs').writeFileSync('started.txt','yes');setTimeout(()=>require('node:fs').writeFileSync('too-late.txt','no'),10000);"],timeoutSeconds:20}).catch(()=>{});
  for(let n=0;n<100;n++){try{await fs.access(path.join(directory,'started.txt'));break;}catch{await new Promise(resolve=>setTimeout(resolve,10));}}
  assert.ok(active.child?.pid);const child=active.child;await chat.stop();assert.ok(child.exitCode!==null||child.signalCode!==null);assert.equal(chat.active,null);await assert.rejects(fs.stat(path.join(directory,'too-late.txt')),{code:'ENOENT'});
});
