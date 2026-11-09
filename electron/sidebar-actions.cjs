const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {inside}=require('./files.cjs');
const {safeName,subjectName}=require('./asset-relations.cjs');
const key=p=>path.resolve(p).toLocaleLowerCase('en-US');
const stem=p=>path.parse(p).name.replace(/\.render$/i,'');
async function exists(p){try{return await fs.lstat(p);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
// Same-directory hard links provide an exclusive destination: a concurrent file is never overwritten.
async function moveFile(from,to){
  try{await fs.link(from,to);}catch(error){if(!['EPERM','ENOTSUP','EXDEV'].includes(error.code))throw error;await fs.copyFile(from,to,1);}
  try{await fs.unlink(from);}catch(error){await fs.unlink(to).catch(()=>{});throw error;}
}
class SidebarActions {
  constructor(store,{trash,onProjectMoved=async()=>{},onProjectTrashed=async()=>{},onProjectDetached=async()=>{},canMutate=()=>true}={}){Object.assign(this,{store,trash,onProjectMoved,onProjectTrashed,onProjectDetached,canMutate});}
  guard(){if(!this.canMutate())throw new Error('请先等待当前任务结束或停止生成，再改名、移除或删除。');}
  async source(id){const value=await this.store.read(id),real=await fs.realpath(value.directory);if(key(real)!==key(value.directory)||(await fs.lstat(value.directory)).isSymbolicLink())throw new Error('项目目录链接已变化，请重新打开项目。');return value;}
  async info(id,assetId=null){
    const {directory,document}=await this.source(id);
    if(!assetId)return {projectId:id,assetId:null,name:document.name,stem:path.basename(directory),directory,files:[path.basename(directory)],isProject:true};
    const records=[...document.models,...document.renders],selected=records.find(r=>r.id===assetId);if(!selected)throw new Error('项目条目已不存在，请刷新。');
    const selectedPath=await this.store.library.resolve((await this.store.library.grant(directory)).id,selected.path);if(!(await fs.lstat(path.join(directory,selected.path))).isFile()||!(await fs.stat(selectedPath)).isFile())throw new Error('只能操作项目中的普通文件。');
    const pairedModel=document.models.find(m=>document.links[m.id]===assetId&&stem(m.path).toLowerCase()===stem(selected.path).toLowerCase());
    const model=document.models.includes(selected)?selected:pairedModel,base=stem(selected.path),names=new Set([selected.path]);
    if(model){for(const r of records)if((document.models.includes(r)||r.imageRole!=='reference')&&stem(r.path).toLowerCase()===base.toLowerCase())names.add(r.path);
      for(const name of await fs.readdir(directory))if(['.blend','.c4d'].includes(path.extname(name).toLowerCase())&&stem(name).toLowerCase()===base.toLowerCase())names.add(name);
    }
    for(const name of names){const file=path.resolve(directory,name);if(!inside(directory,file))throw new Error('文件路径超出项目。');const stat=await exists(file);if(stat&&(stat.isSymbolicLink()||!stat.isFile()))throw new Error('不允许改名或删除文件链接。');}
    return {projectId:id,assetId,name:path.basename(selected.path),stem:base,directory,isProject:false,files:[...names],selectedPath:selected.path};
  }
  async rename(id,assetId,newName){
    return this.store.mutate(async()=>{
      this.guard();newName=safeName(newName);const info=await this.info(id,assetId),{directory,document}=await this.source(id),original=structuredClone(document);
      if(!assetId){
        if(newName.length>64)throw new Error('项目名称最多64个字符。');
        const destination=path.join(path.dirname(directory),newName);if(!inside(path.dirname(directory),destination)||path.dirname(destination)!==path.dirname(directory))throw new Error('项目名称无效。');
        if(await exists(destination)&&key(destination)!==key(directory))throw new Error('同名文件夹已存在，请换一个名称。');
        if(destination===directory){document.name=newName;await this.store.write(directory,document);return this.store.snapshot(id);}
        await fs.rename(directory,destination);this.store.projects.set(id,destination);
        try{document.name=newName;await this.store.write(destination,document);const project=await this.store.snapshot(id);await this.onProjectMoved(directory,destination,id);return project;}
        catch(error){try{await fs.rename(destination,directory);this.store.projects.set(id,directory);await this.store.write(directory,original);}catch(rollback){throw new Error(`改名保存失败且目录回退失败：${error.message}；${rollback.message}。请检查 ${directory} 和 ${destination}`);}throw error;}
      }
      const mapping=info.files.map(name=>({from:name,to:newName+name.slice(info.stem.length)}));
      const destinations=new Set();
      for(const m of mapping){const to=path.resolve(directory,m.to);if(!inside(directory,to)||path.dirname(to)!==directory)throw new Error('文件名无效。');if(destinations.has(key(to)))throw new Error('改名后的文件发生重名。');destinations.add(key(to));if(await exists(to)&&key(to)!==key(path.join(directory,m.from)))throw new Error(`同名文件已存在：${m.to}`);}
      const moved=[];
      try{
        for(const m of mapping){const from=path.join(directory,m.from),to=path.join(directory,m.to);if(from===to||!await exists(from))continue;
          if(key(from)===key(to)){const temp=path.join(directory,`.rename-${randomUUID()}`);await moveFile(from,temp);moved.push([from,temp]);await moveFile(temp,to);moved.push([temp,to]);}
          else{await moveFile(from,to);moved.push([from,to]);}
        }
        const names=new Map(mapping.map(m=>[m.from,m.to]));
        for(const record of [...document.models,...document.renders]){if(names.has(record.path)){record.path=names.get(record.path);record.subject=subjectName(newName);}if(names.has(record.nativeSource))record.nativeSource=names.get(record.nativeSource);}
        if(document.resources)document.resources=document.resources.map(name=>names.get(name)||name);
        await this.store.write(directory,document);return this.store.snapshot(id);
      }catch(error){let rollbackError;for(const [from,to] of moved.reverse()){try{await moveFile(to,from);}catch(failure){rollbackError=failure;}}if(rollbackError)throw new Error(`改名未完成，请检查项目目录：${error.message}；回退：${rollbackError.message}`);throw error;}
    });
  }
  async remove(id,assetId=null){
    return this.store.mutate(async()=>{
      this.guard();if(typeof this.trash!=='function')throw new Error('回收站暂不可用。');
      const info=await this.info(id,assetId),{directory,document}=await this.source(id);
      if(!assetId){if(directory===path.parse(directory).root||inside(directory,path.resolve(__dirname,'..')))throw new Error('不能删除工作台程序目录或磁盘根目录。');await this.trash(directory);this.store.projects.delete(id);try{await this.onProjectTrashed(directory,id);}catch(error){throw new Error(`项目已移入回收站，但列表保存失败：${error.message}`);}return {projectId:id,removedProject:true};}
      // Delete exactly the selected file. Its paired image, native source and references remain.
      await this.trash(path.join(directory,info.selectedPath));
      document.models=document.models.filter(r=>r.id!==assetId);document.renders=document.renders.filter(r=>r.id!==assetId);
      for(const [model,image] of Object.entries(document.links)){if(model===assetId||image===assetId)delete document.links[model];}
      for(const r of [...document.models,...document.renders])if(r.referenceIds)r.referenceIds=r.referenceIds.filter(ref=>ref!==assetId);
      try{await this.store.write(directory,document);}catch(error){throw new Error(`文件已移入回收站，但清单保存失败，请刷新项目：${error.message}`);}
      return {project:await this.store.snapshot(id),removedAssetId:assetId};
    });
  }
  async detach(id,assetId=null){
    return this.store.mutate(async()=>{
      this.guard();const info=await this.info(id,assetId),{directory,document}=await this.source(id);
      if(!assetId){await this.onProjectDetached(directory,id);this.store.projects.delete(id);return {projectId:id,removedProject:true,detached:true};}
      document.models=document.models.filter(r=>r.id!==assetId);document.renders=document.renders.filter(r=>r.id!==assetId);
      for(const [model,image] of Object.entries(document.links))if(model===assetId||image===assetId)delete document.links[model];
      for(const item of [...document.models,...document.renders])if(item.referenceIds)item.referenceIds=item.referenceIds.filter(ref=>ref!==assetId);
      document.excludedPaths=[...new Set([...(document.excludedPaths||[]),info.selectedPath])];
      await this.store.write(directory,document);
      return {project:await this.store.snapshot(id),removedAssetId:assetId,detached:true};
    });
  }
  async reveal(id,assetId=null){const {directory,document}=await this.source(id);if(!assetId)return directory;const asset=[...document.models,...document.renders].find(r=>r.id===assetId);if(!asset)throw new Error('项目条目不存在。');return this.store.library.resolve((await this.store.library.grant(directory)).id,asset.path);}
}
module.exports={SidebarActions};
