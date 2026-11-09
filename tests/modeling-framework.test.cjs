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
  return {root,projects,manager,project,delivery,plan,png};
}
function glb() {
  const binary=Buffer.alloc(36); [0,0,0,1,0,0,0,1,0].forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,extras:{workbench_id:'triangle'}}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3}]};
  const raw=Buffer.from(JSON.stringify(json)),body=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(body);
  const header=Buffer.alloc(20);[0x46546c67,2,28+body.length+36,body.length,0x4e4f534a].forEach((v,i)=>header.writeUInt32LE(v,i*4));
  const bh=Buffer.alloc(8);bh.writeUInt32LE(36);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,body,bh,binary]);
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
  assert.equal((await framework.verify(d,artifacts)).software,'blender');
  await assert.rejects(framework.verify(d,{...artifacts,render:{...artifacts.render,sha256:'bad'}}),/哈希/);
  audit.geometry[0].bounds[1][0]=9;await fs.writeFile(auditFile,JSON.stringify(audit));
  await assert.rejects(framework.verify(d,artifacts),/包围盒/);
  audit.geometry[0].bounds[1][0]=1;await fs.writeFile(auditFile,JSON.stringify(audit));
  await fs.appendFile(path.join(saved.directory,'common.py'),'# changed');await assert.rejects(framework.verify(d,artifacts),/框架代码/);
});
test('independent images cannot accidentally enter model planning or model publishing',async t=>{
  const f=await fixture(t),d=await f.manager.prepare({projectId:f.project.id,renderId:f.delivery.reference.renderId},'把这里改成蓝色');
  assert.equal(d.kind,'image');assert.throws(()=>f.manager.plan(d,'model_edit'),/独立图片任务/);
  await assert.rejects(f.manager.publish(d,'none'),/独立图片/);
});
