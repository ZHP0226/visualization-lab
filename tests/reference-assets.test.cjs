const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash}=require('node:crypto');
const {FileLibrary}=require('../electron/files.cjs'),{ProjectStore}=require('../electron/projects.cjs'),{DeliveryManager}=require('../electron/delivery.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'workbench-refs-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const library=new FileLibrary(),projects=new ProjectStore(library),project=await projects.create('器件项目',root),png=await fs.readFile(path.resolve(__dirname,'../assets/icon.png'));
  const manager=new DeliveryManager({projects,library,backupDirectory:path.join(root,'backups'),validateImage:b=>b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'});
  return {root,library,projects,project,png,manager};
}
async function reference(f,subject='金属芯片',extra={}){
  const d=await f.manager.prepare({projectId:f.project.id},'生成一张器件图片');
  await fs.writeFile(d.planFile,JSON.stringify({imageRole:'reference',subject,...extra}));await fs.writeFile(d.output,f.png);
  return {d,update:await f.manager.finish(d)};
}
test('semantic image metadata classifies a reference and names it without generating a model version',async t=>{
  const f=await fixture(t),{update}=await reference(f);
  assert.equal(update.image.name,'金属芯片_参考.png');assert.equal(update.image.imageRole,'reference');
  assert.equal(update.project.references.length,1);assert.equal(update.project.renders.length,0);assert.equal(update.project.models.length,0);assert.deepEqual(update.project.links,{});
  for(const name of ['参考','模型','成片'])await assert.rejects(fs.stat(path.join(f.project.directory,name)),{code:'ENOENT'});
  assert.equal((await new ProjectStore(new FileLibrary()).register(f.project.directory)).references[0].id,update.image.renderId);
});
test('reference edits keep a stable filename and ID, preserve old bytes in history and reject stale locators',async t=>{
  const f=await fixture(t),first=await reference(f),id=first.update.image.renderId,source=path.join(f.project.directory,first.update.image.name);
  const d=await f.manager.prepare({projectId:f.project.id,renderId:id},'修改这个参考图的颜色，保留原图中的其他结构');assert.equal(d.forceRevision,false);await fs.writeFile(d.output,Buffer.concat([f.png,Buffer.from('new-output')]));const next=await f.manager.finish(d);
  assert.equal(next.image.renderId,id);assert.equal(next.image.name,first.update.image.name);assert.equal(next.project.references.length,1);
  const history=next.project.references[0].history;assert.equal(history.length,1);assert.equal(hash(await fs.readFile(history[0].backup)),hash(f.png));assert.notEqual(hash(await fs.readFile(source)),hash(f.png));
  const old=await f.projects.render(f.project.id,id,hash(f.png));assert.equal(old.historical,true);assert.equal(old.renderSha256,hash(f.png));
  const resume=await f.manager.prepare({projectId:f.project.id,renderId:id,renderHash:hash(f.png)},'修改这个参考图');assert.equal(hash(await fs.readFile(resume.source)),hash(f.png));
  const copy=await f.manager.prepare({projectId:f.project.id,renderId:id},'另存为新版本，保留旧图');await fs.writeFile(copy.output,f.png);const copied=await f.manager.finish(copy);
  assert.notEqual(copied.image.renderId,id);assert.equal(copied.image.name,'金属芯片_参考_v002.png');assert.equal(copied.project.references.length,2);
});
test('uploads, exact subject matching, manual correction and final pairing survive reopening',async t=>{
  const f=await fixture(t),source=path.join(f.root,'upload');await fs.mkdir(source);
  for(const name of ['芯片_v001.glb','芯片_v001.png','芯片_参考.png','芯片10.glb','无关_参考.png'])await fs.writeFile(path.join(source,name),name.endsWith('.png')?f.png:'model fixture');
  let p=await f.projects.import(f.project.id,['芯片_v001.glb','芯片_v001.png','芯片_参考.png','芯片10.glb','无关_参考.png'].map(n=>path.join(source,n)));
  const model=p.models.find(m=>m.name==='芯片_v001.glb'),ref=p.references.find(r=>r.name==='芯片_参考.png');assert.deepEqual(model.referenceIds,[ref.id]);assert.equal(p.models.find(m=>m.name==='芯片10.glb').referenceIds.length,0);assert.ok(p.links[model.id]);
  await assert.rejects(f.projects.bind(p.id,model.id,ref.id),/参考图不能/);
  p=await f.projects.bind(p.id,model.id,p.links[model.id],[]);p=await f.projects.refresh(p.id);assert.deepEqual(p.models.find(m=>m.id===model.id).referenceIds,[]);
  p=await f.projects.bind(p.id,model.id,p.links[model.id],[ref.id]);const reopened=await new ProjectStore(new FileLibrary()).register(p.directory);assert.deepEqual(reopened.models.find(m=>m.id===model.id).referenceIds,[ref.id]);assert.equal(reopened.renders.length,1);
});
test('opaque uploaded references can attach to the selected model without renaming the user original',async t=>{
  const f=await fixture(t),src=path.join(f.root,'IMG_4281.png');await fs.writeFile(src,f.png);const modelFile=path.join(f.root,'光学器件.glb');await fs.writeFile(modelFile,'model');
  let p=await f.projects.import(f.project.id,[modelFile]);const model=p.models[0];p=await f.projects.import(p.id,[src],{kind:'reference',modelId:model.id});
  assert.equal(p.references[0].name,'IMG_4281.png');assert.equal(p.references[0].subject,'光学器件');assert.deepEqual(p.models[0].referenceIds,[p.references[0].id]);assert.equal(hash(await fs.readFile(src)),hash(f.png));
});
test('native model delivery inherits references and final output remains linked to the exact model',async t=>{
  const f=await fixture(t),{update}=await reference(f),ref=update.image.renderId;
  const model=path.join(f.project.directory,'金属芯片_v001.glb'),render=path.join(f.project.directory,'金属芯片_v001.png');await fs.writeFile(model,'geometry fixture');await fs.writeFile(render,f.png);
  const file=async name=>({file:name,name:path.basename(name),sha256:hash(await fs.readFile(name))});
  const next=await f.projects.registerDelivery(f.project.id,null,{model:await file(model),render:await file(render),mode:'revision',subject:'金属芯片',referenceIds:[ref]});
  const id=next.model.assetId;assert.deepEqual(next.project.models[0].referenceIds,[ref]);assert.equal(next.project.links[id],next.project.renders[0].id);assert.deepEqual(next.project.renders[0].referenceIds,[ref]);assert.deepEqual(next.project.references[0].relatedModelIds,[id]);
  const task=await f.manager.prepare({projectId:f.project.id,assetId:id},'只渲染');assert.equal(task.mode,'render_only');assert.equal(task.public.referenceImages[0].id,ref);
  const concept=await f.manager.prepare({projectId:f.project.id,assetId:id,renderId:next.model.renderId},'生成这个模型的概念参考图');assert.equal(concept.kind,'image');assert.equal(concept.role,'reference');assert.deepEqual(concept.relatedModelIds,[id]);
});
test('semantic plans cannot link foreign IDs, escape paths or overwrite a model final render',async t=>{
  const f=await fixture(t);
  for(const plan of [{imageRole:'reference',subject:'../escape'},{imageRole:'reference',subject:'芯片',relatedModelIds:['foreign']},{imageRole:'unknown',subject:'芯片'}]){
    const d=await f.manager.prepare({projectId:f.project.id},'生成一张参考图');await fs.writeFile(d.planFile,JSON.stringify(plan));await fs.writeFile(d.output,f.png);await assert.rejects(f.manager.finish(d));
  }
  assert.equal((await f.projects.snapshot(f.project.id)).images.length,0);
  const src=path.join(f.root,'芯片.glb'),img=path.join(f.root,'芯片.png');await fs.writeFile(src,'model');await fs.writeFile(img,f.png);const p=await f.projects.import(f.project.id,[src,img]);
  const d=await f.manager.prepare({projectId:f.project.id},'生成一张插图');await fs.writeFile(d.planFile,JSON.stringify({imageRole:'render',subject:'芯片'}));await fs.writeFile(d.output,f.png);await assert.rejects(f.manager.finish(d),/模型成图/);assert.equal(hash(await fs.readFile(path.join(p.directory,'芯片.png'))),hash(f.png));
});
test('reference modeling uses the semantic subject and preserves source IDs in its structure plan',async t=>{
  const f=await fixture(t),first=await reference(f),id=first.update.image.renderId;
  const d=await f.manager.prepare({projectId:f.project.id,renderId:id},'根据这张参考图建模');
  const plan=JSON.parse(await fs.readFile(path.resolve(__dirname,'../assets/modeling-framework/example.structure.json'),'utf8'));plan.subject='金属芯片';
  const saved=await f.manager.saveStructurePlan(d,JSON.stringify(plan));
  assert.equal(path.basename(d.output.model),'金属芯片_v001.glb');assert.equal(path.basename(d.output.render),'金属芯片_v001.png');assert.ok(saved.outputStem.endsWith('金属芯片_v001'));
  const stored=JSON.parse(await fs.readFile(saved.plan,'utf8'));assert.equal(stored.reference.renderId,id);assert.equal(stored.reference.sha256,hash(f.png));
});
test('a new chat never inherits another chat pending reference-modeling plan',async t=>{
  const f=await fixture(t),first=await reference(f),base={projectId:f.project.id,renderId:first.update.image.renderId};
  const a=await f.manager.prepare({...base,conversationId:'old-chat'},'根据参考图建模');assert.equal(a.kind,undefined);
  assert.equal((await f.manager.prepare({...base,conversationId:'old-chat'},'继续')).kind,undefined);
  assert.equal((await f.manager.prepare({...base,conversationId:'new-chat'},'继续')).kind,'image');
});
