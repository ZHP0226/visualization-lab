const { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu, nativeImage, shell, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { FileLibrary, inside, MODEL_EXTENSIONS, ASSET_EXTENSIONS } = require('./files.cjs');
const { ProjectStore, IMAGE_EXTENSIONS } = require('./projects.cjs');
const { restoreProjectCatalog } = require('./project-catalog.cjs');
const { AgentManager, resolveManualAgent } = require('./agents.cjs');
const { AIConnections } = require('./ai-connections.cjs');
const { inspectGLB, editArray } = require('./model-edit.cjs');
const { DeliveryManager } = require('./delivery.cjs');
const { EditNotes } = require('./edit-notes.cjs');
const creationPresets = require('./creation-presets.cjs');
const lightingStyles = require('./lighting-styles.cjs');
const { ChatStore } = require('./chat-store.cjs');
const { SidebarActions } = require('./sidebar-actions.cjs');
const { UsageStatistics } = require('./usage-statistics.cjs');
const usageConfig = require('./telemetry-config.json');
let usageStatistics;
const { PlotStore } = require('./plotting.cjs');
const library = new FileLibrary();
const projects = new ProjectStore(library);
const base = path.join(__dirname, '..');
const samplePath = path.join(base, 'assets', 'library');
const testing = process.env.WORKBENCH_TEST === '1';
if (process.platform === 'win32') app.setAppUserModelId('cn.visualizationlab.workbench');
if (testing && process.env.WORKBENCH_USER_DATA) { app.setPath('userData', process.env.WORKBENCH_USER_DATA); app.setPath('sessionData', process.env.WORKBENCH_USER_DATA); }
protocol.registerSchemesAsPrivileged([{ scheme: 'workbench', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
let win;
let codex;
let chats;
const settingsPath = () => path.join(app.getPath('userData'), 'workbench-settings.json');
async function settings() { try { return JSON.parse(await fs.readFile(settingsPath(), 'utf8')); } catch { return {}; } }
let settingsQueue = Promise.resolve();
function saveSettings(patch) {
  const operation = settingsQueue.then(async () => {
    const temporary = settingsPath() + '.' + randomUUID() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ ...await settings(), ...patch }), 'utf8');
    await fs.rename(temporary, settingsPath());
  });
  settingsQueue = operation.catch(() => {}); return operation;
}
async function updateProjectLocation(from,to,id,detached=false){
  const saved=await settings(),normal=async p=>{try{return (await fs.realpath(p)).toLowerCase();}catch{try{return path.join(await fs.realpath(path.dirname(p)),path.basename(p)).toLowerCase();}catch{return path.resolve(p).toLowerCase();}}};
  const old=await normal(from),entries=await Promise.all((saved.projects||[]).map(async p=>({path:p,key:await normal(p)})));
  const directories=entries.filter(p=>p.key!==old).map(p=>p.path);if(to)directories.push(to);
  const removedProjects=(Array.isArray(saved.removedProjects)?saved.removedProjects:[]).filter(row=>row&&row.id!==id);if(detached)removedProjects.push({id,directory:from});
  await saveSettings({projects:[...new Set(directories)],removedProjects,activeProjectId:!to&&saved.activeProjectId===id?null:saved.activeProjectId});
}
async function saveRoot(root) { if (!testing) await saveSettings({ folder: root.path, activeProjectId: null }); }
async function saveProjects(activeProjectId,restoreRemoved=false) { const saved = await settings(); await saveSettings({ projects: [...new Set([...(saved.projects || []), ...projects.projects.values()])], activeProjectId,...restoreRemoved?{removedProjects:(Array.isArray(saved.removedProjects)?saved.removedProjects:[]).filter(row=>row&&row.id!==activeProjectId)}:{} }); }
const plots = new PlotStore(projects,path.join(base,'assets','plotting'),{runtime:async()=>(await settings()).plotPython,saveRuntime:plotPython=>saveSettings({plotPython})});
async function projectCatalog() {
  const saved = await settings();
  const managedRoot = testing ? path.join(app.getPath('userData'), 'projects') : app.isPackaged ? path.resolve(path.dirname(app.getPath('exe')), '..', '..', 'projects') : path.join(base, 'projects');
  return restoreProjectCatalog(projects, [...(Array.isArray(saved.projects) ? saved.projects : []), ...projects.projects.values()], [managedRoot], saved.removedProjects);
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const frameURL = event.senderFrame && new URL(event.senderFrame.url);
    if (!frameURL || frameURL.protocol !== 'workbench:' || frameURL.host !== 'app') throw new Error('不允许的窗口');
    try { return await fn(...args); } catch (error) { throw new Error(error.message); }
  });
}
async function openFile(file) {
  const root = await library.grant(path.dirname(file));
  const model = await library.model(root.id, path.basename(file));
  await saveRoot(root);
  return { root, model };
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  usageStatistics=new UsageStatistics({file:path.join(app.getPath('userData'),'usage-statistics.json'),config:usageConfig,version:app.getVersion(),request:net.fetch.bind(net),isTest:testing,...testing?{transport:async body=>{const {api_key,...event}=body;await fs.appendFile(path.join(app.getPath('userData'),'usage-statistics-captured.jsonl'),JSON.stringify(event)+'\n','utf8');}}:{}});
  handle('usage:status',()=>usageStatistics.status());
  handle('usage:consent',value=>usageStatistics.setConsent(value));
  handle('usage:activity',()=>usageStatistics.activity().then(()=>true));
  chats = new ChatStore(path.join(app.getPath('userData'), 'chats.sqlite'));
  const aiConnections = new AIConnections(path.join(app.getPath('userData'), 'ai-connections.json'),safeStorage);
  const chatRequests = new Map();
  const editNotes = new EditNotes(path.join(app.getPath('userData'), 'edit-notes.json')), noteSubmissions = new Map();
  const deliveries = new DeliveryManager({ projects, library, backupDirectory: path.join(app.getPath('userData'), 'model-backups'), validateImage: data => !nativeImage.createFromBuffer(data).isEmpty(), imageSize: data => nativeImage.createFromBuffer(data).getSize() });
  codex = new AgentManager({ cwd: path.join(app.getPath('userData'), 'chat-workspace'), configuredAgents:()=>aiConnections.specs(),decryptConnection:row=>aiConnections.decrypt(row),apiHistory:id=>chats.apiHistory(id),sessionPersistence: { get: id => chats.getSession(id), set: (id,session) => chats.setSession(id,session) }, prepareContext: async (context, text, conversationId) => context?.projectKind==='plot' ? plots.prepare(context,text) : deliveries.prepare(context ? { ...context, agentId: codex.selectedId, conversationId: conversationId || null } : null, text), completeContext: delivery => delivery?.kind==='plot' ? plots.finish(delivery) : deliveries.finish(delivery), toolHandler: async (tool, args, context, cancelled, delivery) => {
    if (!context) throw new Error('请先在左侧打开项目中的模型');
    if (tool === 'get_workbench_context') return delivery.public;
    if(delivery?.kind==='plot'){if(tool==='publish_workbench_result'){const update=await plots.finish(delivery);return {output:{saved:!!update},update};}throw new Error('数据绘图请在上下文的临时目录编辑绘图.py或数据.xlsx，再交付结果。');}
    if (tool === 'publish_workbench_image') {
      if (cancelled()) throw new Error('操作已停止');
      const update = await deliveries.imageDelivery.publish(delivery);
      return update ? { output: { saved: true, ...update.delivery }, update } : { output: { saved: false, unchanged: true } };
    }
    if (tool === 'save_workbench_structure_plan') {
      if (cancelled()) throw new Error('操作已停止');
      return { output: await deliveries.saveStructurePlan(delivery, args?.planJson) };
    }
    if (tool === 'plan_workbench_delivery') return { output: deliveries.plan(delivery, args?.operation, args) };
    if (tool === 'publish_workbench_result') {
      if (cancelled()) throw new Error('操作已停止');
      const update = await deliveries.publish(delivery, args?.sourceFormat);
      return update ? { output: { saved: true, ...update.delivery }, update } : { output: { saved: false, unchanged: true, message: '没有新增的模型变更或交付，无需增加版本' } };
    }
    if (!context.assetId) throw new Error('项目中还没有模型，可以用本机建模工具新建并交付 GLB');
    const descriptor = await projects.model(context.projectId, context.assetId);
    if (descriptor.extension !== '.glb') throw new Error('当前编辑功能支持 GLB，请先导入 GLB 模型');
    const file = await library.resolve(descriptor.rootId, descriptor.relative);
    const buffer = await fs.readFile(file);
    if (cancelled()) throw new Error('操作已停止');
    if (tool === 'get_model_structure') return { modelName: descriptor.name, ...inspectGLB(buffer) };
    if (tool !== 'edit_model_array') throw new Error('不支持的模型操作');
    const result = editArray(buffer, args);
    if (cancelled()) throw new Error('操作已停止，未保存修改');
    if (result.buffer.equals(buffer)) return { output: { unchanged: true, message: '模型未发生变化，无需增加版本' } };
    deliveries.plan(delivery, 'model_edit');
    if (delivery.mode === 'in_place') {
      const temporary = delivery.output.model + '.edit-' + randomUUID() + '.tmp'; await fs.writeFile(temporary, result.buffer, { flag: 'wx' }); await fs.rename(temporary, delivery.output.model);
    } else await fs.writeFile(delivery.output.model, result.buffer, { flag: 'wx' });
    if (delivery.renderRequired) return { savedDraft: true, ...result.details, needsRender: true, renderPath: delivery.output.render, message: '阵列 GLB 已保存，仍需实际渲染 PNG 并调用 publish_workbench_result 交付' };
    const update = await deliveries.publish(delivery, 'none');
    return { output: { saved: true, fileName: update.model.name, ...result.details, finalRenderUpdated: false }, details: result.details, update };
  } });
  const forward = event => {
    if(event.figure && event.document)event={...event,type:'plot-updated'};
    const chatId = chatRequests.get(event.requestId);
    if (chatId && chats) {
      event = { ...event, conversationId: chatId };
      try { chats.event(chatId,event); }
      catch (error) { event = { ...event, type: 'storage-error', error: `聊天记录保存失败：${error.message}` }; codex.stop()?.catch(() => {}); }
      if (event.type === 'done') chatRequests.delete(event.requestId);
    }
    if (win && !win.isDestroyed()) win.webContents.send('codex:event', event);
  };
  codex.on('event', event => {
    const batch = event.type === 'done' && noteSubmissions.get(event.requestId);
    if (!batch) return forward(event);
    noteSubmissions.delete(event.requestId);
    (async () => {
      try {
        const notes = event.status === 'completed' && !event.error ? await editNotes.markSent(batch) : await editNotes.list(batch.projectId, batch.agentId);
        forward({ ...event, editNotes: notes, notesProjectId: batch.projectId });
      } catch (error) { forward({ ...event, notesWarning: `任务已结束，但修改意见状态未能保存：${error.message}` }); }
    })();
  });
  const canConfigureAI=()=>{if([...codex.instances.values()].some(a=>a.active||a.connecting))throw new Error('请先等待当前连接或任务结束，再修改 AI 配置');};
  handle('ai:config',()=>aiConnections.publicConfig());
  handle('ai:save-api',async input=>{canConfigureAI();return aiConnections.saveAPI(input);});
  handle('ai:save-local',async input=>{canConfigureAI();return aiConnections.saveLocal(await resolveManualAgent(input));});
  handle('ai:remove',async id=>{canConfigureAI();await aiConnections.remove(id);});
  handle('ai:test-api',input=>aiConnections.test(input));
  handle('ai:choose-program',async()=>{const result=await dialog.showOpenDialog(win,{title:'选择本机 AI 程序',properties:['openFile'],filters:[{name:'程序与启动脚本',extensions:['exe','cmd','com','js','cjs','mjs']},{name:'所有文件',extensions:['*']}]});return result.canceled?null:result.filePaths[0];});
  handle('agent:list', async () => {
    const agents = await codex.discover(), saved = await settings();
    return { agents, selectedId: agents.some(a => a.id === saved.selectedAgentId) ? saved.selectedAgentId : agents.find(a => a.id === 'codex')?.id || agents[0]?.id || '', preferences: saved.agentPreferences || {} };
  });
  handle('agent:preferences', async (id, preference) => {
    if (!codex.agents.some(a => a.id === id) || !preference || ['model', 'effort'].some(key => typeof preference[key] !== 'string' || preference[key].length > 150)) throw new Error('无效的 Agent 选项');
    const saved = await settings();
    await saveSettings({ agentPreferences: { ...saved.agentPreferences, [id]: { model: preference.model, effort: preference.effort } } });
  });
  handle('agent:model-options', async (model, context) => {
    if (typeof model !== 'string' || model.length > 150) throw new Error('无效的 AI 模型');
    const project = typeof context?.projectId === 'string' ? await projects.snapshot(context.projectId) : null;
    if (context?.conversationId) chats.require(context.conversationId,project?.id || null,codex.selectedId);
    await codex.configureModel(model, { ...(project ? { projectId: project.id, directory: project.directory } : {}), ...(context?.conversationId ? { conversationId: context.conversationId } : {}) });
  });
  handle('codex:connect', async id => { const state = await codex.connect(id); await saveSettings({ selectedAgentId: state.agentId }); return state; });
  handle('creation:options', () => creationPresets.publicOptions());
  const checkChatScope = async (projectId,agentId) => { chats.scope(projectId,agentId); if (projectId) await projects.snapshot(projectId); };
  handle('chat:list', async (projectId,agentId) => { await checkChatScope(projectId,agentId); return chats.list(projectId,agentId); });
  handle('chat:open', async (projectId,agentId,id) => { await checkChatScope(projectId,agentId); return chats.open(projectId,agentId,id); });
  handle('chat:create', async (projectId,agentId) => { await checkChatScope(projectId,agentId); return chats.create(projectId,agentId); });
  handle('chat:draft', (id,text) => chats.draft(id,text));
  ipcMain.on('chat:flush-draft', (event,id,text) => {
    try {
      const url = new URL(event.senderFrame.url);
      if (url.protocol !== 'workbench:' || url.host !== 'app') throw new Error('不允许的窗口');
      chats.draft(id,text); event.returnValue = null;
    } catch (error) { event.returnValue = error.message; }
  });
  handle('notes:list', async (projectId, agentId) => { await projects.snapshot(projectId); return editNotes.list(projectId, agentId); });
  handle('notes:save', async (projectId, agentId, value) => { await projects.snapshot(projectId); return editNotes.save(projectId, agentId, value); });
  handle('notes:remove', async (projectId, agentId, id) => { await projects.snapshot(projectId); return editNotes.remove(projectId, agentId, id); });
  let startingChat = false;
  handle('codex:send', async (text, id, options = {}) => {
    if (typeof text !== 'string' || text.length > 12000) throw new Error('消息不能超过12000字。');
    if (startingChat || noteSubmissions.has(id) || codex.current?.active) throw new Error('请等待当前任务结束后发送。');
    startingChat = true;
    let began = false;
    try {
      const batch = options.editNotes?.length ? await editNotes.prepare(options.context?.projectId, codex.selectedId, options.editNotes, text) : null;
      if (!text.trim() && !batch) throw new Error('请输入消息');
      const context = batch?.context || options.context;
      if (options.conversationId) {
        chats.require(options.conversationId,context?.projectId || null,codex.selectedId);
        const display = [text.trim(),batch?.display ? `修改意见：\n${batch.display}` : ''].filter(Boolean).join('\n\n');
        chats.begin(options.conversationId,id,text,display,options.sentDraft ?? text);
        chatRequests.set(id,options.conversationId); began = true;
      }
      if (batch) noteSubmissions.set(id,batch);
      return await codex.send(batch?.command || text,id,{ ...options, context });
    } catch (error) {
      if (began) forward({ type:'done',requestId:id,status:'failed',error:error.message,agentId:codex.selectedId });
      noteSubmissions.delete(id); throw error;
    } finally { startingChat = false; }
  });
  handle('codex:stop', () => codex.stop());
  protocol.handle('workbench', async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app') return new Response('Forbidden', { status: 403 });
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      let file;
      if (segments[0] === 'material-preview') {
        if (segments.length !== 2) return new Response('Forbidden', { status: 403 });
        file = creationPresets.previewFile(segments[1]);
      } else if (segments[0] === 'lighting-preview') {
        if (segments.length !== 2) return new Response('Forbidden', { status: 403 });
        file = lightingStyles.previewFile(segments[1]);
      } else if (segments[0] === 'plot-template') {
        if(segments.length!==2)return new Response('Forbidden',{status:403});
        file=await plots.preview(segments[1]);
      } else if (segments[0] === 'model') {
        file = await library.resolve(segments[1], segments.slice(2).join(path.sep));
        if (!ASSET_EXTENSIONS.has(path.extname(file).toLowerCase())) return new Response('Unsupported resource', { status: 403 });
      } else {
        const root = path.join(base, 'dist');
        file = path.resolve(root, segments.join(path.sep) || 'index.html');
        if (!inside(root, file)) return new Response('Forbidden', { status: 403 });
      }
      return await net.fetch(pathToFileURL(file).toString());
    } catch { return new Response('Local resource not found', { status: 404 }); }
  });
  handle('library:initial', async () => {
    let root;
    const saved = await settings();
    const restoredProjects = await projectCatalog();
    try { root = await library.grant(testing ? samplePath : (saved.folder || samplePath)); }
    catch { root = await library.grant(samplePath); }
    const demoRoot = await library.grant(samplePath);
    return { root, sample: await library.model(demoRoot.id, 'dark-metal-chip/MetalChip_v001.glb'), version: app.getVersion(), projects: restoredProjects, activeProjectId: saved.activeProjectId || null };
  });
  handle('library:folder', async () => {
    const result = await dialog.showOpenDialog(win, { title: '打开模型文件夹', properties: ['openDirectory'] });
    if (result.canceled) return null;
    const root = await library.grant(result.filePaths[0]);
    await saveRoot(root);
    return root;
  });
  handle('library:file', async () => {
    const result = await dialog.showOpenDialog(win, { title: '打开三维模型', filters: [{ name: '三维模型', extensions: [...MODEL_EXTENSIONS].map(x => x.slice(1)) }], properties: ['openFile'] });
    if (result.canceled) return null;
    return openFile(result.filePaths[0]);
  });
  handle('library:drop', async file => {
    if (typeof file !== 'string' || !file) throw new Error('未能读取拖入的文件');
    if ((await fs.stat(file)).isDirectory()) { const root = await library.grant(file); await saveRoot(root); return { root }; }
    return openFile(file);
  });
  handle('library:list', (id, relative) => library.list(id, relative));
  handle('library:model', (id, relative) => library.model(id, relative));
  const sidebar=new SidebarActions(projects,{trash:file=>shell.trashItem(file),onProjectMoved:(from,to,id)=>updateProjectLocation(from,to,id),onProjectTrashed:(from,id)=>updateProjectLocation(from,null,id),onProjectDetached:(from,id)=>updateProjectLocation(from,null,id,true),canMutate:()=>![...codex.instances.values()].some(agent=>agent.active)});
  handle('sidebar:info',(id,assetId)=>sidebar.info(id,assetId));
  handle('sidebar:rename',(id,assetId,name)=>sidebar.rename(id,assetId,name));
  handle('sidebar:trash',(id,assetId)=>sidebar.remove(id,assetId));
  handle('sidebar:detach',(id,assetId)=>sidebar.detach(id,assetId));
  handle('sidebar:reveal',async(id,assetId)=>{shell.showItemInFolder(await sidebar.reveal(id,assetId));return true;});
  handle('project:parent', async () => {
    const result = await dialog.showOpenDialog(win, { title: '选择项目保存位置', properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  handle('project:create', async (name, parent, kind) => { const project = await projects.create(name, parent, kind); await saveProjects(project.id); return project; });
  handle('plot:catalog',()=>plots.catalog());
  handle('plot:create',(projectId,templateId,options)=>plots.create(projectId,templateId,options));
  handle('plot:load',(projectId,id)=>plots.load(projectId,id));
  handle('plot:run',(projectId,id,options)=>plots.run(projectId,id,options));
  handle('plot:inspect',async(projectId,id)=>{
    const selected=await dialog.showOpenDialog(win,{title:'上传绘图数据',filters:[{name:'数据表',extensions:['xlsx','csv','tsv']}],properties:['openFile']});
    if(selected.canceled)return null;
    return plots.inspect(projectId,id,selected.filePaths[0],path.join(app.getPath('userData'),'plot-jobs'));
  });
  handle('plot:import',(projectId,id,token,mappings)=>plots.import(projectId,id,token,mappings));
  handle('plot:inspect-drop',(projectId,id,file)=>plots.inspect(projectId,id,file,path.join(app.getPath('userData'),'plot-jobs')));
  handle('plot:export',async(projectId,id,format='pdf')=>{
    if(!['pdf','xlsx'].includes(format))throw new Error('请选择PDF或Excel');
    const f=await plots.figure(projectId,id), source=await plots.file(projectId,id,format==='pdf'?'图.pdf':'数据.xlsx');
    const selected=await dialog.showSaveDialog(win,{title:format==='pdf'?'导出PDF':'导出Excel数据模板',defaultPath:f.figure.name.replace(/[^\p{L}\p{N} ._()（）-]/gu,'_').slice(0,120)+'.'+format,filters:[{name:format==='pdf'?'PDF图':'Excel工作簿',extensions:[format]}]});
    if(selected.canceled)return null;await fs.copyFile(source,selected.filePath);return selected.filePath;
  });
  handle('plot:reveal',async(projectId,id)=>{shell.showItemInFolder(await plots.file(projectId,id,'图.pdf'));return true;});
  handle('plot:runtime',async()=>{
    const selected=await dialog.showOpenDialog(win,{title:'选择绘图Python（需NumPy、SciPy、Matplotlib）',filters:[{name:'Python程序',extensions:['exe']}],properties:['openFile']});
    if(selected.canceled)return null;return plots.configure(selected.filePaths[0],path.join(app.getPath('userData'),'plot-jobs'));
  });
  handle('project:open', async () => {
    const result = await dialog.showOpenDialog(win, { title: '打开已有工作台项目', properties: ['openDirectory'] });
    if (result.canceled) return null;
    let project;
    try { project = await projects.register(result.filePaths[0]); } catch { throw new Error('未找到有效的项目清单，请选择具体项目目录，或使用“添加项目”'); }
    await saveProjects(project.id,true); return project;
  });
  handle('project:activate', async id => { const project = await projects.snapshot(id); await saveProjects(id); return project; });
  handle('project:refresh', id => projects.refresh(id));
  handle('project:model', (id, assetId) => projects.model(id, assetId));
  handle('project:list', () => projectCatalog());
  handle('project:render', (id, renderId, expectedHash) => projects.render(id, renderId, expectedHash));
  handle('project:bind', (id, modelId, renderId, referenceIds) => projects.bind(id, modelId, renderId, referenceIds));
  handle('project:drop', (id, files) => projects.import(id, files));
  handle('project:import', async (id, kind, modelId) => {
    if (!['all','model','render','reference'].includes(kind)) throw new Error('无效的导入分组');
    const extensions = kind === 'model' ? [...MODEL_EXTENSIONS] : ['render','reference'].includes(kind) ? [...IMAGE_EXTENSIONS] : [...MODEL_EXTENSIONS, ...IMAGE_EXTENSIONS];
    const result = await dialog.showOpenDialog(win, { title: kind === 'model' ? '导入模型' : kind === 'reference' ? '导入参考图片' : kind === 'render' ? '导入渲染成图' : '导入模型与图片', filters: [{ name: '项目文件', extensions: extensions.map(value => value.slice(1)) }], properties: ['openFile', 'multiSelections'] });
    return result.canceled ? null : projects.import(id, result.filePaths,{kind,...(kind === 'reference' && modelId ? {modelId} : {})});
  });
  handle('startup:active', active => {
    if(typeof active!=='boolean')throw new Error('无效的启动状态');
    if(win&&!win.isDestroyed())win.webContents.setBackgroundThrottling(!active);
  });
  handle('window:action', action => {
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') win.close();
  });
  win = new BrowserWindow({ width: 1480, height: 940, minWidth: 1000, minHeight: 680, show: false, backgroundColor: '#ffffff', title: '可视化实验室 · 工作台', frame: false,
    icon: path.join(base, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling:false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  if(!testing)win.once('ready-to-show',()=>win.show());
  await win.loadURL('workbench://app/index.html');
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { usageStatistics?.dispose(); codex?.dispose(); });
app.on('will-quit', () => { chats?.close(); chats = null; });
