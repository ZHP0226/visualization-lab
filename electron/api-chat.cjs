const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { TOOL_SPECS } = require('./model-edit.cjs');
const { DELIVERY_TOOLS, AGENT_INSTRUCTIONS } = require('./delivery.cjs');
const { MAX_AGENT_TEXT } = require('./point-edit-data.cjs');
const { listModels, requestAPI } = require('./ai-connections.cjs');
const LOCAL_TOOLS = [
  { name:'read_project_file', description:'读取当前项目中的UTF-8文本文件，路径相对项目目录。三维结构请用get_model_structure。', inputSchema:{type:'object',properties:{file:{type:'string'}},required:['file'],additionalProperties:false} },
  { name:'write_project_file', description:'写入当前项目中的UTF-8脚本或结构方案。默认禁止覆盖；遵守本轮版本与备份约定。', inputSchema:{type:'object',properties:{file:{type:'string'},content:{type:'string'},overwrite:{type:'boolean'}},required:['file','content'],additionalProperties:false} },
  { name:'run_local_program', description:'后台运行本机程序。使用程序路径和独立参数数组，默认工作目录是当前项目。适合Python、Blender或C4D命令行；无需打开窗口。', inputSchema:{type:'object',properties:{executable:{type:'string'},args:{type:'array',items:{type:'string'}},timeoutSeconds:{type:'integer',minimum:1,maximum:600}},required:['executable','args'],additionalProperties:false} }
];
const tools = [...TOOL_SPECS, ...DELIVERY_TOOLS, ...LOCAL_TOOLS].map(t => ({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}));
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
async function projectFile(cwd, relative, writing = false) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\0') || (process.platform==='win32' && relative.includes(':'))) throw new Error('文件路径必须位于当前项目内');
  const root = await fs.realpath(cwd), file = path.resolve(root, relative);
  if (!inside(root,file) || file === root) throw new Error('文件路径超出当前项目');
  // Check every existing component so symlink/junction directories cannot escape the project.
  const components = path.relative(root,file).split(path.sep); let current = root;
  for (let i=0;i<components.length;i++) {
    current = path.join(current,components[i]);
    try { if (!inside(root,await fs.realpath(current))) throw new Error('文件链接超出当前项目'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; if (!writing) throw error; if(i<components.length-1) await fs.mkdir(current); }
  }
  return file;
}
async function readCompletion(response, delta) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const packet = await response.json(), choice = packet.choices?.[0];
    if (!choice?.message) throw new Error('API 未返回有效的对话结果');
    if (choice.message.content) delta(choice.message.content);
    return { ...choice.message, finish:choice.finish_reason };
  }
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer='', text='', finish='', bytes=0;
  const calls = new Map();
  function line(value) {
    if (!value.startsWith('data:')) return;
    const data=value.slice(5).trim(); if (!data || data==='[DONE]') return;
    let packet; try { packet=JSON.parse(data); } catch { throw new Error('API 返回了损坏的流式数据'); }
    if (packet.error) throw new Error('API 流式响应中断，请检查服务状态');
    const choice=packet.choices?.[0]; if (!choice) return;
    finish=choice.finish_reason || finish; const d=choice.delta || {};
    if (typeof d.content==='string') {text+=d.content;delta(text);}
    for (const part of d.tool_calls || []) {
      const call=calls.get(part.index) || {id:'',type:'function',function:{name:'',arguments:''}};
      if(part.id)call.id=part.id;if(part.function?.name)call.function.name+=part.function.name;if(part.function?.arguments)call.function.arguments+=part.function.arguments;calls.set(part.index,call);
    }
  }
  try {
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>16*1024*1024)throw new Error('API 响应过长，请分步执行');buffer+=decoder.decode(chunk.value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end).replace(/\r$/,''));buffer=buffer.slice(end+1);}}
    buffer+=decoder.decode();if(buffer.trim())line(buffer.replace(/\r$/,''));
  } finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
  if (!finish) throw new Error('API 流式响应未正常结束，已收到的文字保留');
  return {role:'assistant',content:text || null,tool_calls:[...calls.entries()].sort(([a],[b])=>a-b).map(([,call])=>call),finish};
}

class APIChat extends EventEmitter {
  constructor(options) { super(); Object.assign(this,options); this.config=options.spec.connection;this.state='disconnected';this.models=[]; }
  publish(event) { this.emit('event',event); }
  status(state,label){this.state=state;this.label=label;this.publish({type:'status',state,label});}
  snapshot(){return {state:this.state,label:this.label,models:this.models,defaultModel:this.config.model || this.models[0]?.model,defaultEffort:null};}
  connect(){if(this.closed)return Promise.reject(new Error('工作台正在关闭'));if(this.state==='ready')return Promise.resolve(this.snapshot());if(this.connecting)return this.connecting;this.connecting=this.start().finally(()=>{this.connecting=null;});return this.connecting;}
  async start(){
    this.status('connecting','正在连接 API…');
    try{
      this.key=await this.decryptConnection(this.config);let configured=false;
      try{this.models=await listModels(this.config,this.key);}catch(error){if(!this.config.model || !error.catalogUnavailable && ![403,404,405].includes(error.status))throw error;this.models=[];configured=true;}
      if(this.config.model && !this.models.some(m=>m.model===this.config.model))this.models.unshift({model:this.config.model,name:this.config.model,supportedReasoningEfforts:[]});
      this.status('ready',configured?'API 已配置 · 待发送验证':'API 已连接');return this.snapshot();
    }catch(error){this.status('error',error.message);throw error;}
  }
  async send(text,id,options={}){
    if(typeof text!=='string'||!text.trim()||text.length>MAX_AGENT_TEXT||typeof id!=='string'||id.length>80)throw new Error('消息无效或过长');
    if(this.active)throw new Error('请等待当前回复结束，或先停止生成');
    const active={id,controller:new AbortController(),items:[],context:options.context};this.active=active;
    try{
      await this.connect();if(this.active!==active)return;
      const model=options.model || this.snapshot().defaultModel;if(!this.models.some(m=>m.model===model))throw new Error('请选择此 API 的模型');
      active.prepared=this.prepareContext?await this.prepareContext(options.context,text,options.conversationId):null;
      if(this.active!==active)return;
      active.cwd=active.prepared?.public.projectDirectory || this.cwd;await fs.mkdir(active.cwd,{recursive:true});
      const history=options.conversationId && this.apiHistory?this.apiHistory(options.conversationId):[];
      const prompt=text.trim()+'\n\n[工作台本轮上下文]\n'+JSON.stringify(active.prepared?.public || {project:null});
      const system=this.config.localTools?AGENT_INSTRUCTIONS+'\n本连接提供工作台工具和本机程序/文本文件工具，严格按用户本轮要求操作，先规划交付路径再制作。': '你是可视化实验室的AI助手。当前连接只启用文本对话，没有本机执行或生图工具。可以解释、规划和写代码，不得声称已修改文件、执行建模或渲染。需要实际制作时，请用户在AI接入中启用本机任务，或切换本机AI。';
      const messages=[{role:'system',content:system},...history,{role:'user',content:prompt}];
      active.running=this.run(active,messages,model).catch(error=>{if(this.active===active)this.finish(active.controller.signal.aborted?'interrupted':'failed',active.controller.signal.aborted?null:this.clean(error.message));});
    }catch(error){if(this.active===active)this.finish('failed',this.clean(error.message));throw error;}
  }
  clean(value){return this.key?String(value).split(this.key).join('[已隐藏]'):String(value);}
  async run(active,messages,model){
    for(let turn=0;turn<80;turn++){
      if(this.active!==active)return;
      const response=await requestAPI(this.config,this.key,'/chat/completions',{method:'POST',signal:AbortSignal.any([active.controller.signal,AbortSignal.timeout(180000)]),body:JSON.stringify({model,messages,stream:true,...this.config.localTools?{tools}:{}})});
      const prefix=active.items.join('\n\n'),message=await readCompletion(response,text=>{if(this.active===active)this.publish({type:'message',requestId:active.id,text:this.clean([prefix,text].filter(Boolean).join('\n\n'))});});
      if(this.active!==active)return;
      if(message.content)active.items.push(message.content);
      if(['length','content_filter'].includes(message.finish))throw new Error('API 未完成回复（长度限制或内容限制），已收到的文字保留');
      const calls=message.tool_calls || [];
      if(!calls.length){
        if(!message.content)throw new Error('API 返回了空回复');
        const update=this.config.localTools && this.completeContext?await this.completeContext(active.prepared):null;
        if(this.active!==active)return;if(update)this.publish({type:update.image?'image-updated':'model-updated',requestId:active.id,...update});
        this.finish('completed');return;
      }
      if(!this.config.localTools)throw new Error('此连接未启用本机任务，未执行任何工具');
      messages.push({role:'assistant',content:message.content,tool_calls:calls});
      for(const call of calls){
        if(this.active!==active || active.controller.signal.aborted)return;
        if(typeof call.id!=='string'||!call.id||!tools.some(t=>t.function.name===call.function?.name))throw new Error('API 请求了不受支持的工具，未执行');
        let result;try{
          const args=JSON.parse(call.function.arguments || '{}');this.publish({type:'tool',requestId:active.id,label:'AI 正在执行本机任务…'});
          result=await this.execute(active,call.function.name,args);
        }catch(error){if(active.controller.signal.aborted)throw error;result={error:this.clean(error.message)};}
        if(this.active!==active)return;
        messages.push({role:'tool',tool_call_id:call.id,content:this.clean(JSON.stringify(result))});
      }
    }
    throw new Error('本轮工具调用过多，已停止，请把任务拆成几步');
  }
  async execute(active,name,args){
    if(name==='read_project_file'){const file=await projectFile(active.cwd,args.file);if((await fs.stat(file)).size>1024*1024)throw new Error('文本文件超过1MB，请分步处理');return {content:await fs.readFile(file,'utf8')};}
    if(name==='write_project_file'){if(typeof args.content!=='string'||Buffer.byteLength(args.content)>2*1024*1024)throw new Error('写入内容无效或超过2MB');const file=await projectFile(active.cwd,args.file,true);if(active.controller.signal.aborted)throw new Error('操作已停止');await fs.writeFile(file,args.content,{flag:args.overwrite===true?'w':'wx'});return {saved:true,file:args.file};}
    if(name==='run_local_program')return this.runProgram(active,args);
    const result=await this.toolHandler(name,args,active.context,()=>active.controller.signal.aborted,active.prepared);
    if(result?.update)this.publish({type:result.update.image?'image-updated':'model-updated',requestId:active.id,...result.update});
    return result?.output ?? result;
  }
  runProgram(active,args){
    if(typeof args.executable!=='string'||!args.executable||args.executable.length>2000||!Array.isArray(args.args)||args.args.length>200||args.args.some(v=>typeof v!=='string'||v.length>50000)||/\.(cmd|bat)$/i.test(args.executable))throw new Error('请使用可执行程序路径和独立参数数组；脚本通过对应解释器执行');
    const seconds=args.timeoutSeconds ?? 120;if(!Number.isInteger(seconds)||seconds<1||seconds>600)throw new Error('程序超时须为1至600秒');
    return new Promise((resolve,reject)=>{
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      const child=(this.spawnProcess || spawn)(args.executable,args.args,{cwd:active.cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});active.child=child;
      let output='',timedOut=false;const append=data=>{output=(output+data.toString()).slice(-64000);};child.stdout.on('data',append);child.stderr.on('data',append);
      const terminate=()=>{if(process.platform==='win32'&&child.pid){const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>child.kill());}else child.kill();};
      const timer=setTimeout(()=>{timedOut=true;terminate();},seconds*1000),abort=()=>terminate();active.controller.signal.addEventListener('abort',abort,{once:true});if(active.controller.signal.aborted)terminate();
      const cleanup=()=>{clearTimeout(timer);active.controller.signal.removeEventListener('abort',abort);if(active.child===child)active.child=null;};
      child.once('error',()=>{cleanup();reject(new Error('无法运行程序，请检查路径和参数'));});child.once('close',code=>{cleanup();if(active.controller.signal.aborted)reject(new Error('操作已停止'));else resolve({exitCode:code,timedOut,output});});
    });
  }
  finish(status,error){const active=this.active;if(!active)return;this.active=null;this.publish({type:'done',requestId:active.id,status,error:error || null});}
  async stop(){const active=this.active;if(active){active.controller.abort();await active.running;if(this.active===active)this.finish('interrupted');}}
  dispose(){this.closed=true;const stopped=this.stop();this.key=null;return stopped;}
}
module.exports={APIChat,readCompletion,projectFile};
