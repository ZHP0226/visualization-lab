const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawn } = require('node:child_process');
const { inside } = require('./files.cjs');
const FILES = ['绘图.py','数据.xlsx','图.pdf','图.svg','预览.png','data.json','table-schema.json','linked-data.json','vlplot.py','vl_runtime.py','workbook_io.py','journal_style.py','journal-styles.json'];
const json = async file => JSON.parse(await fs.readFile(file,'utf8'));
const digest=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
class PlotStore {
  constructor(projects, assets, { runtime = async()=>null, saveRuntime = async()=>{} } = {}) {
    this.projects=projects; this.assets=assets; this.runtime=runtime; this.saveRuntime=saveRuntime; this.uploads=new Map();
  }
  async catalog() { const catalog=await json(path.join(this.assets,'manifest.json'));return {...catalog,journalStyles:(await json(path.join(this.assets,'journal-styles.json'))).styles}; }
  async copyDocument(source,directory) {
    for(const name of FILES){try{await fs.copyFile(path.join(source,name),path.join(directory,name));}catch(error){if(error.code!=='ENOENT'||!['journal_style.py','journal-styles.json'].includes(name))throw error;}}
    for(const name of ['vlplot.py','vl_runtime.py','workbook_io.py','journal_style.py','journal-styles.json'])await fs.copyFile(path.join(this.assets,name),path.join(directory,name));
  }
  async selection(text='') {
    const catalog=await this.catalog(),styles=catalog.journalStyles;
    const numbers=[...text.matchAll(/(?:【)?模板\s*(\d{1,3})(?!\d)/g)].map(m=>Number(m[1]));
    if(numbers.length>12)throw new Error('一张图最多引用12个模板');
    const templates=numbers.map(n=>{const t=catalog.templates.find(t=>t.number===n);if(!t)throw new Error('模板'+n+'不存在');return t;});
    const names=[...text.matchAll(/【期刊：([^】]+)】/g)];const style=names.length?styles.find(s=>s.name===names.at(-1)[1]):null;
    if(names.length&&!style)throw new Error('所选期刊风格不存在');
    const layouts=[...text.matchAll(/【版式：(单栏|双栏)】/g)];
    return {templates,...style?{styleId:style.id}:{},...layouts.length?{columnLayout:layouts.at(-1)[1]==='双栏'?'double':'single'}:{}};
  }
  async presentation(options={}) {
    const styleId=options.styleId||'nature',columnLayout=options.columnLayout||'single';
    if(!(await this.catalog()).journalStyles.some(s=>s.id===styleId)||!['single','double'].includes(columnLayout))throw new Error('期刊或版式选项无效');
    return {styleId,columnLayout};
  }
  async template(id) { const row=(await this.catalog()).templates.find(t=>t.id===id); if(!row)throw new Error('图样不存在'); return row; }
  async preview(number) { const row=(await this.catalog()).templates.find(t=>String(t.number)===number); if(!row)throw new Error('图样不存在'); return path.join(this.assets,row.thumb); }
  async python() {
    const configured=await this.runtime();
    if(configured)return configured;
    for(const file of [process.env.VL_PYTHON,'D:\\Python\\Python313\\python.exe',process.env.PYTHON].filter(Boolean)) { try { if((await fs.stat(file)).isFile())return file; }catch{} }
    return 'python';
  }
  async worker(job) {
    const dir=job.directory || this.assets;
    const token=randomUUID(), input=path.join(dir,`.job-${token}.json`), result=path.join(dir,`.result-${token}.json`);
    await fs.mkdir(dir,{recursive:true}); await fs.writeFile(input,JSON.stringify({...job,result}));
    try {
      const program=await this.python();
      await new Promise((resolve,reject)=>{
        const child=spawn(program,[path.join(this.assets,'worker.py'),input],{windowsHide:true,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONIOENCODING:'utf-8'}});
        let errorText='',settled=false;
        const timer=setTimeout(()=>{child.kill(); if(!settled){settled=true;reject(new Error('绘图超过120秒，原图及数据已保留。'));}},120000);
        child.stderr.on('data',chunk=>{errorText=(errorText+chunk.toString()).slice(-8000);});
        child.on('error',error=>{clearTimeout(timer);if(!settled){settled=true;reject(new Error('无法启动绘图Python。请在绘图栏“Python环境”指定已安装NumPy、SciPy、Matplotlib的Python。'+error.message));}});
        child.on('close',async code=>{clearTimeout(timer);if(settled)return;settled=true;let payload;try{payload=await json(result);}catch{} if(code!==0 || payload?.error)reject(new Error(payload?.error || errorText || '绘图未完成'));else resolve();});
      });
      return await json(result);
    } finally { await Promise.all([fs.rm(input,{force:true}),fs.rm(result,{force:true})]); }
  }
  async probe(directory) { return this.worker({action:'probe',directory}); }
  async configure(file,directory) {
    const previous=this.runtime; this.runtime=async()=>file;
    try {const info=await this.probe(directory);await this.saveRuntime(file);return info;}finally{this.runtime=previous;}
  }
  async project(id) {const p=await this.projects.read(id);if(p.document.kind!=='plot')throw new Error('请先进入数据绘图项目');return p;}
  async figure(projectId,id) {
    const p=await this.project(projectId),figure=(p.document.figures||[]).find(f=>f.id===id);
    if(!figure)throw new Error('数据图不存在');
    if(!/^[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(figure.revision)||figure.revision<1)throw new Error('数据图记录无效');
    const directory=await fs.realpath(path.join(p.directory,'figures',id,'revisions',String(figure.revision).padStart(4,'0')));
    if(!inside(p.directory,directory))throw new Error('数据图目录超出项目');
    return {...p,figure,directory};
  }
  async file(projectId,id,name) {
    if(!FILES.includes(name))throw new Error('不支持的绘图文件');
    const f=await this.figure(projectId,id),file=await fs.realpath(path.join(f.directory,name));
    if(!inside(f.directory,file))throw new Error('绘图文件超出目录');return file;
  }
  async load(projectId,id) {
    const f=await this.figure(projectId,id), linked=await json(await this.file(projectId,id,'linked-data.json'));
    return {projectId,figure:f.figure,linked,code:await fs.readFile(await this.file(projectId,id,'绘图.py'),'utf8'),svg:await fs.readFile(await this.file(projectId,id,'图.svg'),'utf8')};
  }
  async revise(projectId,id,operation) {
    return this.projects.mutate(async()=>{
      const p=await this.project(projectId),old=id?await this.figure(projectId,id):null;
      const figureId=id||randomUUID(), revision=(old?.figure.revision||0)+1;
      const revisions=path.join(p.directory,'figures',figureId,'revisions');await fs.mkdir(revisions,{recursive:true});
      if(!inside(p.directory,await fs.realpath(revisions)))throw new Error('绘图目录含外部链接');
      const stage=path.join(revisions,`.pending-${randomUUID()}`);await fs.mkdir(stage);
      // Only known files enter a revision. Old revisions remain available after any failure.
      if(old)await this.copyDocument(old.directory,stage);
      try {
        const details=await operation(stage,old?.figure);
        for(const name of FILES)if(!(await fs.lstat(path.join(stage,name))).isFile()||!inside(stage,await fs.realpath(path.join(stage,name))))throw new Error('绘图缺少文件或含外部链接：'+name);
        const pdf=await fs.readFile(path.join(stage,'图.pdf'));if(pdf.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF输出无效');
        const linked=await json(path.join(stage,'linked-data.json'));if(!linked.panels?.length)throw new Error('绘图缺少数据工作表');
        const destination=path.join(revisions,String(revision).padStart(4,'0'));await fs.rename(stage,destination);
        const figure={...old?.figure,...details,styleId:linked.styleId||null,columnLayout:linked.columnLayout||'single',id:figureId,revision,updatedAt:new Date().toISOString()};
        p.document.figures=(p.document.figures||[]).filter(f=>f.id!==figureId);p.document.figures.push(figure);
        await this.projects.write(p.directory,p.document);
        return {project:await this.projects.snapshot(projectId),document:await this.load(projectId,figureId)};
      } catch(error) {throw new Error(error.message+'（未覆盖上一次成功结果）');}
    });
  }
  async create(projectId,templateId,options={}) {
    const ids=Array.isArray(templateId)?templateId:[templateId];if(!ids.length||ids.length>12)throw new Error('请选择1至12个模板');
    const templates=await Promise.all(ids.map(id=>this.template(id))),presentation=await this.presentation(options);
    return this.revise(projectId,null,async directory=>{await this.worker({action:'create',directory,templates,...presentation});return {templateId:templates.length>1?'COMPOSITE':templates[0].id,templateIds:ids,name:templates.length>1?'组合图 · '+templates.map((t,i)=>String.fromCharCode(97+i)+' '+t.name).join(' / '):templates[0].name,category:templates[0].category,purpose:templates.map(t=>t.purpose).join('；')};});
  }
  async run(projectId,id,{code,palette,styleId,columnLayout}={}) {
    if(code!==undefined&&(typeof code!=='string'||code.length>250000))throw new Error('代码不能超过250000字');
    const f=await this.figure(projectId,id);const presentation=(styleId||columnLayout)?await this.presentation({styleId:styleId||f.figure.styleId||'nature',columnLayout:columnLayout||f.figure.columnLayout}):{};
    return this.revise(projectId,id,async directory=>{if(code!==undefined)await fs.writeFile(path.join(directory,'绘图.py'),code,'utf8');await this.worker({action:'render',directory,...presentation,...palette?{palette}:{}});return {};});
  }
  async inspect(projectId,id,file,jobDirectory) {
    await this.figure(projectId,id);
    const info=await this.worker({action:'inspect',file,directory:jobDirectory});
    const token=randomUUID();this.uploads.set(token,{projectId,id,file,time:Date.now()});
    for(const [k,v] of this.uploads)if(Date.now()-v.time>3600000)this.uploads.delete(k);
    return {...info,token,name:path.basename(file)};
  }
  async import(projectId,id,token,mappings) {
    const upload=this.uploads.get(token);if(!upload||upload.projectId!==projectId||upload.id!==id||Date.now()-upload.time>3600000)throw new Error('上传已过期，请重新选择文件');
    if(!Array.isArray(mappings)||mappings.length>10000)throw new Error('列对应无效');
    return this.revise(projectId,id,async(directory,figure)=>{await this.worker({action:'import',directory,file:upload.file,mappings,templateId:figure.templateId});return {dataSource:upload.file?path.basename(upload.file):''};});
  }
  async prepare(context,text='') {
    const p=await this.project(context.projectId),selection=await this.selection(text);
    const publicContext={projectType:'数据绘图',projectName:p.document.name,projectDirectory:p.directory,workflow:'当前是数据绘图项目。按对话中可读的模板引用为a、b等分图选用不同模板；JOURNAL_STYLE与COLUMN_LAYOUT控制固定字体、字号、线宽和单/双栏。PDF由工作台生成。绘图尽量充满可用图幅，对齐分图，压缩边缘和分图间无意义留白；保留标签与图例的必要空间，不缩小固定字号或让文字重叠。'};
    const f=context.figureId?await this.figure(context.projectId,context.figureId):null;
    if(!f&&!selection.templates.length)return {kind:'plot',public:{...publicContext,instruction:'请先用输入框下方“模板”插入模板引用，可在同一条消息中指定a图和b图。'}};
    const directory=path.join(p.directory,'plot-ai-drafts',randomUUID());await fs.mkdir(directory,{recursive:true});
    if(!inside(p.directory,await fs.realpath(directory)))throw new Error('绘图临时目录超出项目');
    let details;
    if(selection.templates.length){
      const templates=selection.templates;await this.worker({action:'create',directory,templates,...await this.presentation(selection)});
      details={templateId:templates.length>1?'COMPOSITE':templates[0].id,templateIds:templates.map(t=>t.id),name:templates.length>1?'组合图 · '+templates.map((t,i)=>String.fromCharCode(97+i)+' '+t.name).join(' / '):templates[0].name,purpose:templates.map(t=>t.purpose).join('；')};
    }else await this.copyDocument(f.directory,directory);
    const baseline=Object.fromEntries(await Promise.all(['绘图.py','数据.xlsx','data.json'].map(async n=>[n,await digest(path.join(directory,n))])));
    if(!details&&(selection.styleId||selection.columnLayout)){
      let code=await fs.readFile(path.join(directory,'绘图.py'),'utf8');
      for(const [key,value] of [['JOURNAL_STYLE',selection.styleId],['COLUMN_LAYOUT',selection.columnLayout]])if(value){const re=new RegExp('^'+key+'\\s*=.*$','m'),line=key+' = '+JSON.stringify(value);code=re.test(code)?code.replace(re,line):code.replace('from vl_runtime import *','from vl_runtime import *\n'+line);}
      await fs.writeFile(path.join(directory,'绘图.py'),code);
    }
    return {kind:'plot',projectId:context.projectId,figureId:details?null:f.figure.id,sourceFigureId:context.figureId||null,revision:details?null:f.figure.revision,directory,details,baseline,public:{...publicContext,figure:details||f.figure,sourceWorkbook:f?path.join(f.directory,'数据.xlsx'):null,workingDirectory:directory,code:path.join(directory,'绘图.py'),dataWorkbook:path.join(directory,'数据.xlsx'),python:await this.python(),selectedTemplates:selection.templates.map(t=>({number:t.number,name:t.name})),fixedStyle:(await this.catalog()).journalStyles.find(s=>s.id===(selection.styleId||f?.figure.styleId||'nature')),instruction:'模板已经展开为本目录可编辑的绘图.py，多个模板对应draw_part_a、draw_part_b等函数。只在workingDirectory修改绘图.py、数据.xlsx；根据用户上传文件、提供的路径或sourceWorkbook中的真实数据绘图，不得用示例数据冒充用户数据；数据不足时先询问。每个可见工作表对应一个分图。保留JOURNAL_STYLE与COLUMN_LAYOUT，字体字号线宽由渲染程序统一固定。保留data.json和辅助程序，数据处理写process_data；可修改各draw_part函数。完成后工作台自动运行绘图并登记新修订，失败保留旧图；可调用publish_workbench_result交付。'}};
  }

  async finish(delivery) {
    if(!delivery?.directory||delivery.published)return null;
    if(await digest(path.join(delivery.directory,'data.json'))!==delivery.baseline['data.json'])throw new Error('原始结构文件被修改，请保留data.json并在Excel或process_data中修改；草稿保留在'+delivery.directory);
    const changed=await Promise.all(['绘图.py','数据.xlsx'].map(async n=>await digest(path.join(delivery.directory,n))!==delivery.baseline[n]));
    if(!changed.some(Boolean))return null;
    const result=await this.revise(delivery.projectId,delivery.figureId,async(directory,figure)=>{
      if(!delivery.figureId)await this.copyDocument(delivery.directory,directory);
      if(delivery.figureId&&figure.revision!==delivery.revision)throw new Error('当前图已产生新修订，AI草稿保留在'+delivery.directory+'，请核对后再应用');
      for(const name of ['绘图.py','数据.xlsx']){
        const source=await fs.realpath(path.join(delivery.directory,name));if(!inside(delivery.directory,source))throw new Error('AI草稿含外部链接');await fs.copyFile(source,path.join(directory,name));
      }
      await this.worker({action:'render',directory});return delivery.details||{};
    });
    delivery.published=true;return {...result,figure:result.document.figure,source:{projectId:delivery.projectId,figureId:delivery.sourceFigureId??delivery.figureId}};
  }
}
module.exports={PlotStore,FILES};
