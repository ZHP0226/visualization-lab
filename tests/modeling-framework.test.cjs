const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { FileLibrary } = require('../electron/files.cjs');
const { ProjectStore } = require('../electron/projects.cjs');
const { DeliveryManager } = require('../electron/delivery.cjs');
const framework = require('../electron/modeling-framework.cjs');
const sha = data => createHash('sha256').update(data).digest('hex');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'workbench-framework-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const library=new FileLibrary(),projects=new ProjectStore(library),project=await projects.create('结构拆解',root);
  const png=await fs.readFile(path.join(__dirname,'../assets/icon.png'));
  await fs.writeFile(path.join(project.directory,'概念图.png'),png); const snapshot=await projects.refresh(project.id);
  const manager=new DeliveryManager({projects,library,backupDirectory:path.join(root,'backups')});
  const delivery=await manager.prepare({projectId:project.id,renderId:snapshot.renders[0].id},'请用Blender根据这张图片建模');
  const plan=JSON.parse(await fs.readFile(path.join(framework.DIRECTORY,'example.structure.json')));
  plan.objects=[{id:'triangle',name:'test',shape:'custom',position:[0,0,0],size:[1,1,1],material:'blue'}];
  plan.components=[{id:'triangle_part',name:'独立测试部件',objectIds:['triangle']}];
  return {root,projects,manager,project,delivery,plan,png};
}
function glb() {
  const binary=Buffer.alloc(36); [0,0,0,1,0,0,0,1,0].forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,extras:{workbench_id:'triangle'}}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3}]};
  const raw=Buffer.from(JSON.stringify(json)),body=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(body);
  const header=Buffer.alloc(20);[0x46546c67,2,28+body.length+36,body.length,0x4e4f534a].forEach((v,i)=>header.writeUInt32LE(v,i*4));
  const bh=Buffer.alloc(8);bh.writeUInt32LE(36);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,body,bh,binary]);
}
async function componentFixture(directory,plan,artifactAudit) {
  async function stage(name,partPlan,preview) {
    const folder=path.join(directory,name);await fs.mkdir(folder,{recursive:true});
    for(const file of framework.CODE)await fs.copyFile(path.join(framework.DIRECTORY,file),path.join(folder,file));
    const planFile=path.join(folder,'structure.json');await fs.writeFile(planFile,JSON.stringify(partPlan));
    const files={};
    for(const [key,ext,data] of [['model','.glb',glb()],['native','.blend',Buffer.from('BLENDER-v500fixture-'+name)],['render','.png',preview]]) {
      const file=path.join(folder,'part'+ext);await fs.writeFile(file,data);files[key]={file,sha256:sha(data)};
    }
    const audit={...artifactAudit,planSha256:sha(await fs.readFile(planFile)),files:Object.fromEntries(Object.entries(files).map(([key,item])=>[key,{name:path.basename(item.file),sha256:item.sha256}]))};
    const auditFile=path.join(folder,'audit.json');await fs.writeFile(auditFile,JSON.stringify(audit));
    files.plan={file:planFile,sha256:sha(await fs.readFile(planFile))};files.audit={file:auditFile,sha256:sha(await fs.readFile(auditFile))};
    return {software:'blender',objectIds:['triangle'],files};
  }
  const gray=structuredClone(plan);delete gray.components;gray.materials=[{id:'blockout_gray',color:[.56,.56,.56],metallic:0,roughness:.75}];gray.objects=gray.objects.map(o=>({...o,shape:'box',material:'blockout_gray'}));
  const blockout=await stage('stages/blockout',gray,await fs.readFile(path.join(__dirname,'../assets/material-presets/previews/M001.png')));
  await fs.copyFile(blockout.files.render.file,path.join(directory,'blockout.png'));
  const sub=structuredClone(plan);delete sub.components;sub.materials=sub.materials.filter(m=>m.id==='blue');
  const part={id:'triangle_part',name:'独立测试部件',...await stage('components/triangle_part',sub,await fs.readFile(path.join(__dirname,'../assets/material-presets/previews/M002.png')))};
  const sources=[{id:part.id,objectIds:part.objectIds,nativeSha256:part.files.native.sha256}];artifactAudit.assembly={method:'native-component-import',sources};
  await fs.writeFile(path.join(directory,'audit.json'),JSON.stringify(artifactAudit));
  const record={schemaVersion:1,frameworkVersion:framework.VERSION,software:'blender',planSha256:sha(await fs.readFile(path.join(directory,'structure.json'))),blockout,components:[part],assembly:{...artifactAudit.assembly,files:artifactAudit.files}};
  await fs.writeFile(path.join(directory,'component-workflow.json'),JSON.stringify(record));return record;
}
test('reference-to-model input preserves the original image, requires structural analysis and copies versioned code',async t=>{
  const f=await fixture(t),d=f.delivery;
  assert.equal(d.kind,undefined);assert.equal(d.public.modelingFramework.required,true);assert.equal(d.renderRequired,true);
  const continuation=await f.manager.prepare({projectId:f.project.id,renderId:d.reference.renderId},'我选Blender');
  assert.equal(continuation.kind,undefined);assert.equal(continuation.public.modelingFramework.required,true);
  assert.deepEqual(d.images,[d.reference.file]);assert.equal(d.reference.sha256,sha(f.png));
  assert.equal(d.context.renderId,d.reference.renderId);
  const saved=await framework.savePlan(d,JSON.stringify(f.plan)),plan=JSON.parse(await fs.readFile(saved.plan));
  assert.equal(plan.reference.sha256,sha(f.png));assert.deepEqual(plan.assumptions,f.plan.assumptions);
  for(const file of framework.CODE)assert.deepEqual(await fs.readFile(path.join(saved.directory,file)),await fs.readFile(path.join(framework.DIRECTORY,file)));
  await assert.rejects(framework.verify(d,{}),/audit.json/);
  assert.throws(()=>framework.validatePlan({...f.plan,objects:[f.plan.objects[0],f.plan.objects[0]]}),/对象清单/);
  assert.throws(()=>framework.validatePlan({...f.plan,review:null}),/成图核对/);
});
test('audit gates actual artifacts, geometry IDs, reference and reproducibility code before registration',async t=>{
  const f=await fixture(t),d=f.delivery,saved=await framework.savePlan(d,f.plan),planData=await fs.readFile(saved.plan);
  const artifacts={};
  for(const [key,extension,data] of [['model','glb',glb()],['native','blend',Buffer.from('BLENDER-v500fixture')],['render','png',f.png]]) {
    const file=key==='native'?d.output.blend:d.output[key];await fs.writeFile(file,data);artifacts[key]={file,name:path.basename(file),data,sha256:sha(data)};
  }
  const codeHashes={};for(const n of framework.CODE)codeHashes[n]=sha(await fs.readFile(path.join(saved.directory,n)));
  const audit={frameworkVersion:framework.VERSION,codeHashes,projectCodeHashes:codeHashes,software:'blender',softwareVersion:'QA fixture only',planSha256:sha(planData),nativeReopened:true,reference:d.reference,geometry:[{id:'triangle',vertices:3,triangles:1,bounds:[[0,0,0],[1,1,0]]}],renderSettings:f.plan.render,files:Object.fromEntries(Object.entries(artifacts).map(([k,v])=>[k,{name:v.name,sha256:v.sha256}]))};
  const auditFile=path.join(saved.directory,'audit.json');await fs.writeFile(auditFile,JSON.stringify(audit));
  await assert.rejects(framework.verify(d,artifacts),/component-workflow\.json/);
  const record=await componentFixture(saved.directory,JSON.parse(planData),audit);
  await assert.rejects(framework.verify(d,artifacts),/look-review\.json/);
  const trialFiles=['blockout.png','first-render.png','trial-a.png','trial-b.png'];
  for (const [i,file] of trialFiles.entries()) await fs.copyFile(path.join(__dirname,`../assets/material-presets/previews/M00${i+1}.png`),path.join(saved.directory,file));
  const review = {schemaVersion:1,referenceSha256:d.reference.sha256,finalSha256:artifacts.render.sha256,anchors:['圆形轮廓'],summary:'高光更接近参考',trials:[
    {file:'trial-a.png',category:'lighting',change:'灯宽 40',observation:'偏窄'},
    {file:'trial-b.png',category:'lighting',change:'灯宽 75',observation:'更接近'}
  ]};
  const reviewFile=path.join(saved.directory,'look-review.json');
  await fs.writeFile(reviewFile,JSON.stringify({...review,finalSha256:'0'.repeat(64)}));
  await assert.rejects(framework.verify(d,artifacts),/正式成图不一致/);
  await fs.writeFile(reviewFile,JSON.stringify(review));
  assert.equal((await framework.verify(d,artifacts)).software,'blender');
  const native=record.components[0].files.native.file,old=await fs.readFile(native);await fs.appendFile(native,'changed');
  await assert.rejects(framework.verify(d,artifacts),/部件文件已经变化/);await fs.writeFile(native,old);
  await assert.rejects(framework.verify(d,{...artifacts,render:{...artifacts.render,sha256:'bad'}}),/哈希/);
  audit.geometry[0].bounds[1][0]=9;await fs.writeFile(auditFile,JSON.stringify(audit));
  await assert.rejects(framework.verify(d,artifacts),/包围盒/);
  audit.geometry[0].bounds[1][0]=1;await fs.writeFile(auditFile,JSON.stringify(audit));
  await fs.appendFile(path.join(saved.directory,'common.py'),'# changed');await assert.rejects(framework.verify(d,artifacts),/框架代码/);
});
test('fresh models require complete independent decomposition; existing edits and render-only retain their path',async t=>{
  const f=await fixture(t),d=f.delivery;
  const missing=structuredClone(f.plan);delete missing.components;
  await assert.rejects(framework.savePlan(d,missing),/拆分独立部件/);
  assert.throws(()=>framework.validatePlan({...f.plan,components:[{id:'a',name:'a',objectIds:['foreign']}]}),/覆盖结构清单/);
  assert.throws(()=>framework.validatePlan({...f.plan,components:[{id:'a',name:'a',objectIds:['triangle']},{id:'b',name:'b',objectIds:['triangle']}]}),/覆盖结构清单/);
  const textOnly=await f.manager.prepare({projectId:f.project.id},'用Blender新建一个模型');
  f.manager.plan(textOnly,'model_edit');assert.equal(textOnly.public.modelingFramework.componentWorkflow.required,true);
  await assert.rejects(framework.verify(textOnly,{}),/拆分并分别建模/);
  assert.equal(await framework.verify({...textOnly,source:'existing.glb'},{}),null);
  const oldFolder=path.join(textOnly.public.projectDirectory,textOnly.stem+'_reproduction');await fs.mkdir(oldFolder,{recursive:true});await fs.writeFile(path.join(oldFolder,'audit.json'),'old framework snapshot');
  assert.equal(await framework.verify({...textOnly,source:'existing.glb'},{}),null);
  assert.equal(await framework.verify({...textOnly,mode:'render_only'},{}),null);
});
test('reference reconstruction language routes to modeling; ordinary image editing is unchanged',async t=>{
  const f=await fixture(t),context={projectId:f.project.id,renderId:f.delivery.reference.renderId};
  const task=await f.manager.prepare(context,'用C4D复刻这张图，最后渲染给我看');
  assert.equal(task.mode,'revision');
  assert.equal(task.public.modelingFramework.singleImageReview.record,'look-review.json');
  assert.equal((await f.manager.prepare(context,'把这张图改成蓝色')).kind,'image');
});
test('independent images cannot accidentally enter model planning or model publishing',async t=>{
  const f=await fixture(t),d=await f.manager.prepare({projectId:f.project.id,renderId:f.delivery.reference.renderId},'把这里改成蓝色');
  assert.equal(d.kind,'image');assert.throws(()=>f.manager.plan(d,'model_edit'),/独立图片任务/);
  await assert.rejects(f.manager.publish(d,'none'),/独立图片/);
});
