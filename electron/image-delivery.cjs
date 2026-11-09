const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { deliveryIntent, requestText } = require('./delivery-policy.cjs');
const relations = require('./asset-relations.cjs');
const sha = data => createHash('sha256').update(data).digest('hex');
const clauses = text => text.split(/[，,。！？!?；;\n]/).filter(s => !/(?:不要|无需|不用|暂不|先不|不必|不需要|只给提示词|仅给提示词)/.test(s));
function modelingRequested(text) {
  return clauses(text).some(s => {
    if (/建模|重建|导出.{0,8}(?:GLB|glTF)/i.test(s)) return true;
    if (/模型\s*(?:的\s*)?(?:概念|结构|外观|配色|视角|效果|示意)?\s*(?:参考)?\s*图|三维\s*(?:示意|效果)?\s*图/i.test(s)) return false;
    return /(?:创建|新建|制作|生成|搭建|修改|完成|做).{0,12}(?:三维(?:模型|结构)|模型)|(?:create|build|make|reconstruct).{0,25}(?:3d\s+model|mesh)/i.test(s);
  });
}
function imageRequested(text) {
  return clauses(text).some(s => /生图|绘图|文生图|图生图|(?:生成|制作|设计|画|绘制).{0,30}(?:图|封面|海报)|generate.{0,30}(?:image|illustration)/i.test(s));
}

class ImageDelivery {
  constructor(options) { Object.assign(this, options); this.projects.backupDirectory ||= this.backupDirectory; }
  matches(context, text, targets) {
    const request = requestText(text,targets);
    if (modelingRequested(request) || context.assetId && !(imageRequested(request) && /参考|概念/.test(request) && !targets.length)) return false;
    return !!context.renderId || targets.some(t => t.kind === 'image' && !t.assetId) || imageRequested(requestText(text, targets));
  }
  async prepare(context, text, targets, project) {
    const renderId = context.assetId ? null : context.renderId || targets[0]?.renderId || null;
    if (targets.some(t => t.kind !== 'image' || t.assetId || t.renderId !== renderId)) throw new Error('请按同一张独立图片分批发送修改意见。');
    if (renderId && Object.values(project.links).includes(renderId)) throw new Error('这张图片已关联模型，请重新打开对应模型后修改。');
    const image = renderId ? project.images.find(r => r.id === renderId && r.exists) : null;
    if (renderId && !image) throw new Error('原图片已移动或丢失，请重新选择。');
    const targetHashes = [...new Set([context.renderHash,...targets.map(t => t.renderHash)].filter(Boolean))];
    if (targetHashes.length > 1) throw new Error('不同图片版本的意见请分批发送');
    const source = image ? (await this.projects.imageSource(project,image,targetHashes[0])).file : null;
    const sourceData = source ? await fs.readFile(source) : null;
    if (sourceData && !this.validateImage(sourceData)) throw new Error('原图片无法解码。');
    const size = sourceData ? this.imageSize?.(sourceData) : null;
    for (const target of targets) {
      if (target.renderHash && target.renderHash !== sha(sourceData)) throw new Error('定位后原图片已变化，请重新右击定位。');
      if (size && (size.width !== target.point.width || size.height !== target.point.height)) throw new Error('定位后图片尺寸已变化，请重新定位。');
    }
    const intent = deliveryIntent(text, targets), request = intent.request;
    const promptOnly = /(?:只|仅)(?:需要|要|给|写|提供)?\s*(?:提示词|prompt)|(?:不要|不用|无需|暂不|先不)(?:实际)?生图/i.test(request);
    const requiresOutput = !promptOnly && !intent.discussion && (targets.length > 0 || imageRequested(request) || !!image && /修改|改成|改为|变成|调整|替换|再来|重新|改一下|改一改/.test(request));
    const relatedModel = project.models.find(m => m.id === context.assetId);
    const role = /参考|概念/.test(request) ? 'reference' : image?.imageRole || 'render';
    const subject = image?.subject || relatedModel?.subject || relations.inferSubject(request,project.name);
    const forceRevision = !intent.keepVersion && (intent.forceRevision || /另存|新图片版本|(?:保留|留下)(?:原图|旧图)(?:文件)?(?:[，。；!！?？\n]|$)|(?:原图|旧图)不(?:要)?覆盖/.test(request));
    await fs.mkdir(this.backupDirectory,{recursive:true});
    const stageDirectory = await fs.realpath(this.backupDirectory);
    const task = randomUUID(), output = path.join(stageDirectory,task+'.png'), planFile = path.join(stageDirectory,task+'.image-plan.json');
    const inPlace = !!image && !forceRevision;
    const protectedFiles = [];
    await fs.mkdir(this.backupDirectory, { recursive: true });
    const files = [...project.images.map(r => r.path), ...project.models.flatMap(m => [m.path, m.nativeSource].filter(Boolean))];
    for (const relative of new Set(files)) {
      let file, data;
      try { file = await this.library.resolve(project.rootId, relative); data = await fs.readFile(file); } catch (e) { if (e.code === 'ENOENT' || /不存在/.test(e.message)) continue; throw e; }
      const digest = sha(data);
      const backup = path.join(this.backupDirectory, digest + path.extname(file));
      try { await fs.writeFile(backup, data, { flag: 'wx' }); } catch (error) { if (error.code !== 'EEXIST' || sha(await fs.readFile(backup)) !== digest) throw error; }
      protectedFiles.push({ file, sha256: digest, mtime: String((await fs.stat(file, { bigint: true })).mtimeNs), backup });
    }
    const referenceIds = image?.imageRole === 'reference' ? [image.id] : image?.referenceIds || [];
    return { kind: 'image', context: { projectId: project.id, assetId: context.assetId || null, renderId }, project, sourceImage: image, source, inPlace, output, planFile, role, subject, forceRevision, referenceIds, relatedModelIds: relatedModel ? [relatedModel.id] : image?.relatedModelIds || [], protectedFiles, requiresOutput, images: source ? [source] : [],
      public: { projectName: project.name, projectDirectory: project.directory, inputModel: null, inputImage: source, imageSize: size, imageOnly: true, imageRole: role, subject, sourceRenderId: renderId, editTargets: targets, imageInputs: source ? [source] : [], outputMode: 'image_generation', output: { image: output }, imagePlan: { file: planFile, schema: { imageRole:'reference | render', subject:'按用户需求与画面判断的稳定主体名', variant:'可选用途名，如结构、配色、视角，不写递增版本', relatedModelIds:'参考对应的项目模型ID数组，可空', referenceIds:'成图采用的项目参考ID数组，可空' } }, assetCatalog: { models: project.models.map(m => ({id:m.id,name:m.name,subject:m.subject,referenceIds:m.referenceIds})), references: project.references.map(r => ({id:r.id,name:r.name,subject:r.subject})) }, requiresOutput, namingRule: '先按语义判断用途/主体，填写imagePlan；实际PNG先存output.image暂存路径，由工作台备份后发布到项目。参考用主体_参考[_用途].png；独立成图用主体[_用途].png。同一图默认稳定名称与资源ID，只有用户要求另存时增版；模型原生成图仍须真实渲染，不将参考配为模型成图。', permissions: 'full-access' } };
  }
  async assertOriginals(delivery) {
    for (const item of delivery.protectedFiles) {
      if (delivery.published && item.file === delivery.finalOutput) continue;
      if (sha(await fs.readFile(item.file)) !== item.sha256) throw new Error(`独立图片任务改动了其他原件：${path.basename(item.file)}；原件备份已保留。`);
    }
  }
  async publish(delivery) {
    if (delivery?.kind !== 'image') throw new Error('当前不是独立图片任务，请使用模型交付工具。');
    await this.assertOriginals(delivery);
    if (await fs.realpath(delivery.output) !== path.resolve(delivery.output)) throw new Error('图片暂存输出不能使用外部链接');
    const data = await fs.readFile(delivery.output);
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || !this.validateImage(data)) throw new Error('请交付可解码的真实PNG图片。');
    const digest = sha(data);
    if (delivery.published) { if (digest !== delivery.acceptedHash) throw new Error('图片登记后又被修改，请按新任务保存。'); return null; }
    let plan = {};
    try { const stat = await fs.lstat(delivery.planFile); if (stat.isSymbolicLink() || stat.size > 65536) throw new Error('图片分类方案无效或过大'); plan = JSON.parse(await fs.readFile(delivery.planFile,'utf8')); if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('图片分类方案需为JSON对象'); }
    catch(error) { if (error.code !== 'ENOENT') throw error; }
    const role = plan.imageRole || delivery.role, subject = relations.safeName(plan.subject || delivery.subject), variant = plan.variant ? relations.safeName(plan.variant) : '';
    if (!['reference','render'].includes(role)) throw new Error('图片用途只能是reference或render');
    const modelIds = plan.relatedModelIds ?? (role === 'reference' ? delivery.relatedModelIds : []), referenceIds = plan.referenceIds ?? delivery.referenceIds;
    const current = await this.projects.snapshot(delivery.context.projectId);
    if (!Array.isArray(modelIds) || modelIds.length > 100 || modelIds.some(id => !current.models.some(m => m.id === id)) || !Array.isArray(referenceIds) || referenceIds.length > 100 || referenceIds.some(id => !current.references.some(r => r.id === id))) throw new Error('图片分类方案引用了不在本项目的模型或参考');
    if (role === 'render' && modelIds.length) throw new Error('AI生图不能充当模型原生成图；请将它保存为参考，模型成图走原生渲染');
    let stem = [subject,role === 'reference' ? '参考' : '',variant].filter(Boolean).join('_');
    if (delivery.sourceImage && role === delivery.sourceImage.imageRole && !variant && (!plan.subject || relations.key(plan.subject) === relations.key(delivery.sourceImage.subject)) && !delivery.forceRevision) stem = path.parse(delivery.sourceImage.path).name;
    if (delivery.forceRevision) {
      const names = await fs.readdir(current.directory); let n=2;
      while (names.some(name => name.toLowerCase() === `${stem}_v${String(n).padStart(3,'0')}.png`.toLowerCase())) n++;
      stem += '_v'+String(n).padStart(3,'0');
    }
    const destination = path.join(current.directory,stem+'.png'), existing = current.images.find(r => r.path.toLowerCase() === path.basename(destination).toLowerCase());
    if (existing && (existing.imageRole !== role || Object.values(current.links).includes(existing.id))) throw new Error('该名称已属于其他用途或模型成图，请选择准确的主体/用途名');
    const prior = delivery.protectedFiles.find(p => p.file.toLowerCase() === destination.toLowerCase());
    const replaceSource = !existing && !delivery.forceRevision && delivery.sourceImage && role === delivery.sourceImage.imageRole && relations.key(subject) === relations.key(delivery.sourceImage.subject) && stem === path.parse(delivery.sourceImage.path).name;
    if (existing && !prior) throw new Error('任务期间出现同名新图片，原件未被覆盖，请重新确认名称');
    try { await fs.access(destination); if (!prior) throw new Error('目标存在未登记的同名文件，未覆盖原件'); } catch(e) { if(e.code!=='ENOENT')throw e; }
    const temporary = destination+'.'+randomUUID()+'.tmp'; await fs.writeFile(temporary,data,{flag:'wx'}); await fs.rename(temporary,destination);
    let update;
    const historySource = prior || (replaceSource ? delivery.protectedFiles.find(p => p.file === delivery.source) : null);
    try { update = await this.projects.registerImage(delivery.context.projectId, existing?.id || delivery.context.renderId, { file: destination, name: path.basename(destination), sha256: digest, inPlace: !!existing || !!replaceSource, imageRole: role, subject, relatedModelIds:modelIds, referenceIds, previous: historySource ? { sha256:historySource.sha256,backup:historySource.backup } : null }); }
    catch(error) { if(prior)await fs.copyFile(prior.backup,destination);else await fs.unlink(destination);throw error; }
    delivery.inPlace = !!existing || !!replaceSource; delivery.finalOutput = destination;
    delivery.published = true; delivery.acceptedHash = digest;
    return { ...update, source: delivery.context, delivery: { mode: delivery.inPlace ? 'image_in_place' : 'image_generation', imageFile: destination, imageRole:role, imageOnly: true } };
  }
  async finish(delivery) {
    if (delivery.published) { await this.assertOriginals(delivery); if (sha(await fs.readFile(delivery.finalOutput)) !== delivery.acceptedHash) throw new Error('图片登记后又被修改。'); return null; }
    await this.assertOriginals(delivery);
    let exists = false; try { await fs.access(delivery.output); exists = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (exists && (delivery.requiresOutput || delivery.output !== delivery.source)) return this.publish(delivery);
    if (delivery.requiresOutput) throw new Error('本轮没有交付新图片，修改意见保留待发送。请确认当前Agent有可用生图/改图工具；不能用原图冒充完成。');
    return null;
  }
}
module.exports = { ImageDelivery, modelingRequested, imageRequested };
