const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { MODEL_EXTENSIONS, inside } = require('./files.cjs');
const relations = require('./asset-relations.cjs');
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MANIFEST = '.visualization-project.json';
const prefix = filename => path.parse(filename).name.replace(/\.render$/i, '').normalize('NFC').trim().toLocaleLowerCase('en-US');
const hash = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
function pairUnique(document) {
  relations.ensureRelations(document);
  const modelIds = new Set(document.models.map(item => item.id));
  const renderIds = new Set(document.renders.filter(item => item.imageRole !== 'reference').map(item => item.id));
  const links = {}, used = new Set();
  for (const [model, render] of Object.entries(document.links || {})) {
    if (modelIds.has(model) && renderIds.has(render) && !document.models.find(m => m.id === model)?.renderStale && !document.renders.find(r => r.id === render)?.stale && !used.has(render)) { links[model] = render; used.add(render); }
  }
  const keys = new Set(document.models.map(item => prefix(item.path)));
  for (const key of keys) {
    const models = document.models.filter(item => prefix(item.path) === key);
    const renders = document.renders.filter(item => item.imageRole !== 'reference' && prefix(item.path) === key && !item.stale && !item.standalone);
    if (models.length === 1 && !models[0].renderStale && renders.length === 1 && !links[models[0].id] && !used.has(renders[0].id)) {
      links[models[0].id] = renders[0].id; used.add(renders[0].id);
    }
  }
  document.links = links;
}
class ProjectStore {
  constructor(library) { this.library = library; this.projects = new Map(); this.queue = Promise.resolve(); }
  mutate(operation) { const result = this.queue.then(operation, operation); this.queue = result.catch(() => {}); return result; }
  async write(directory, document) {
    const temporary = path.join(directory, `${MANIFEST}.${randomUUID()}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(document, null, 2), { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporary, path.join(directory, MANIFEST));
  }
  async read(id) {
    const directory = this.projects.get(id); if (!directory) throw new Error('请先打开项目');
    const document = JSON.parse(await fs.readFile(path.join(directory, MANIFEST), 'utf8'));
    if (document.version !== 1 || !Array.isArray(document.models) || !Array.isArray(document.renders) || document.id !== id) throw new Error('项目信息无效');
    relations.ensureRelations(document);
    return { directory, document };
  }
  async register(directory, { refresh = true } = {}) {
    const real = await fs.realpath(directory);
    const document = JSON.parse(await fs.readFile(path.join(real, MANIFEST), 'utf8')).valueOf();
    if (document.version !== 1 || typeof document.id !== 'string' || !Array.isArray(document.models) || !Array.isArray(document.renders)) throw new Error('这不是有效的工作台项目，请选择已创建的项目目录');
    this.projects.set(document.id, real);
    return refresh ? this.refresh(document.id) : this.snapshot(document.id);
  }
  async create(name, parent) {
    return this.mutate(async () => {
      name = String(name || '').trim();
      if (!name || name.length > 64 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || name === '.' || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) throw new Error('请输入有效的项目名称');
      const directory = path.join(await fs.realpath(parent), name);
      try { await fs.mkdir(directory); } catch (error) { if (error.code === 'EEXIST') throw new Error('该目录已存在，请使用“打开项目”或换一个项目名称'); throw error; }
      const document = { version: 1, id: randomUUID(), name, createdAt: new Date().toISOString(), models: [], renders: [], links: {} };
      await this.write(directory, document); this.projects.set(document.id, directory);
      return this.snapshot(document.id);
    });
  }
  async snapshot(id) {
    const { directory, document } = await this.read(id);
    const root = await this.library.grant(directory);
    const assets = async (items, kind) => Promise.all(items.map(async item => {
      let exists = false;
      try { exists = (await fs.stat(await this.library.resolve(root.id, item.path))).isFile(); } catch {}
      return { ...item, name: path.basename(item.path), kind, exists, prefix: prefix(item.path),
        url: `workbench://app/model/${root.id}/${item.path.split('/').map(encodeURIComponent).join('/')}` };
    }));
    const images = await assets(document.renders,'render');
    for (const image of images) { image.kind = image.imageRole === 'reference' ? 'reference' : 'render'; image.relatedModelIds = document.models.filter(m => m.referenceIds.includes(image.id)).map(m => m.id); image.relatedRenderIds = document.renders.filter(r => (r.referenceIds || []).includes(image.id)).map(r => r.id); }
    return { id, name: document.name, directory, rootId: root.id, models: await assets(document.models, 'model'), renders: images.filter(r => r.imageRole !== 'reference'), references: images.filter(r => r.imageRole === 'reference'), images, links: document.links };
  }
  async list() { const projects = []; for (const id of this.projects.keys()) projects.push(await this.snapshot(id)); return projects; }
  async refresh(id) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id);
      const excluded=new Set((document.excludedPaths||[]).map(name=>name.toLowerCase()));
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        if (!entry.isFile() || entry.isSymbolicLink()) continue;
        if(excluded.has(entry.name.toLowerCase()))continue;
        if ((document.resources || []).includes(entry.name)) continue;
        const extension = path.extname(entry.name).toLowerCase();
        const list = MODEL_EXTENSIONS.has(extension) ? document.models : IMAGE_EXTENSIONS.has(extension) ? document.renders : null;
        if (list && !list.some(item => item.path.toLowerCase() === entry.name.toLowerCase())) list.push({ id: randomUUID(), path: entry.name, sha256: await hash(path.join(directory, entry.name)) });
      }
      relations.ensureRelations(document); for (const image of document.renders) relations.autoReference(document,image);
      pairUnique(document); await this.write(directory, document); return this.snapshot(id);
    });
  }
  async dependencies(file) {
    const base = await fs.realpath(path.dirname(file)); const result = new Map();
    const visit = async relative => {
      relative = decodeURIComponent(relative.replaceAll('\\', '/'));
      if (/^(?:data:|https?:|file:)/i.test(relative)) { if (relative.startsWith('data:')) return; throw new Error('模型含外部资源，请先导出为包含贴图的 GLB'); }
      const source = await fs.realpath(path.resolve(base, relative));
      if (!inside(base, source)) throw new Error('模型资源超出了模型所在目录，请先导出为 GLB');
      const destination = path.relative(base, source).split(path.sep).join('/');
      if (result.has(destination)) return;
      result.set(destination, source);
      const extension = path.extname(source).toLowerCase();
      if (extension === '.gltf') {
        const data = JSON.parse(await fs.readFile(source, 'utf8'));
        for (const item of [...(data.buffers || []), ...(data.images || [])]) if (item.uri) await visit(item.uri);
      }
      if (extension === '.obj') {
        const text = await fs.readFile(source, 'utf8');
        for (const match of text.matchAll(/^\s*mtllib\s+(.+)$/gm)) await visit(match[1].trim());
      }
      if (extension === '.mtl') {
        const text = await fs.readFile(source, 'utf8');
        for (const match of text.matchAll(/^\s*(?:map_\w+|bump|disp)\s+(.+)$/gim)) {
          const value = match[1].trim(); if (value.startsWith('-')) throw new Error('OBJ 材质含贴图选项，请先转换成 GLB');
          await visit(path.posix.join(path.posix.dirname(destination), value));
        }
      }
    };
    await visit(path.basename(file)); return result;
  }
  async import(id, files, options = {}) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id); const copies = new Map();
      if (options.modelId && !document.models.some(m => m.id === options.modelId)) throw new Error('参考关联模型不在项目中');
      if (['render','reference'].includes(options.kind) && files.some(file => !IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))) throw new Error('参考和成图分组仅接收图片');
      for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        if (!MODEL_EXTENSIONS.has(extension) && !IMAGE_EXTENSIONS.has(extension)) throw new Error('仅支持三维模型和 PNG、JPG、WebP 成图');
        for (const [relative, source] of await this.dependencies(file)) {
          const destination = path.resolve(directory, relative);
          if (!inside(directory, destination)) throw new Error('无效的目标路径');
          const digest = await hash(source);
          if (copies.has(destination) && copies.get(destination).digest !== digest) throw new Error(`导入文件重名：${relative}，请先更名`);
          try { if ((await hash(destination)) !== digest) throw new Error(`项目中已有不同内容的同名文件：${relative}，请先更名`); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          copies.set(destination, { source, digest });
        }
      }
      for (const [destination, item] of copies) {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        if (!inside(directory, await fs.realpath(path.dirname(destination)))) throw new Error('项目资源目录包含指向外部的链接');
        try { await fs.copyFile(item.source, destination, require('node:fs').constants.COPYFILE_EXCL); }
        catch (error) { if (error.code !== 'EEXIST' || await hash(destination) !== item.digest) throw error; }
      }
      for (const file of files) {
        const name = path.basename(file); const list = MODEL_EXTENSIONS.has(path.extname(file).toLowerCase()) ? document.models : document.renders;
        let item = list.find(item => item.path.toLowerCase() === name.toLowerCase());
        if (!item) { item = { id: randomUUID(), path: name, sha256: await hash(path.join(directory, name)) }; list.push(item); }
        if (list === document.renders && options.kind === 'reference') {
          if (Object.values(document.links).includes(item.id)) throw new Error('这张图片已作为模型成图，请先解除对应再设为参考');
          item.imageRole = 'reference';
        }
        if (list === document.renders && options.kind === 'render') {
          if (document.models.some(m => m.referenceIds?.includes(item.id))) throw new Error('该图片正在作为模型参考，请为成图选择独立文件');
          item.imageRole = 'render';
        }
      }
      const selectedNames = new Set(files.map(file => path.basename(file)));
      if(document.excludedPaths){const restored=new Set([...selectedNames].map(name=>name.toLowerCase()));document.excludedPaths=document.excludedPaths.filter(name=>!restored.has(name.toLowerCase()));}
      const resources = new Set(document.resources || []);
      for (const destination of copies.keys()) { const relative = path.relative(directory, destination).split(path.sep).join('/'); if (!selectedNames.has(relative)) resources.add(relative); }
      for (const name of selectedNames) resources.delete(name);
      document.resources = [...resources];
      relations.ensureRelations(document);
      if (options.modelId) {
        const model = document.models.find(m => m.id === options.modelId); if (!model) throw new Error('参考关联模型不在项目中');
        for (const image of document.renders.filter(r => r.imageRole === 'reference' && selectedNames.has(r.path))) { image.subject = model.subject; model.referenceIds = [...new Set([...model.referenceIds,image.id])]; }
      }
      for (const image of document.renders) relations.autoReference(document,image);
      pairUnique(document); await this.write(directory, document); return this.snapshot(id);
    });
  }
  async bind(id, modelId, renderId, referenceIds) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id);
      if (!document.models.some(item => item.id === modelId) || renderId && !document.renders.some(item => item.id === renderId && item.imageRole !== 'reference')) throw new Error('请选择项目中的模型与成图，参考图不能作为渲染成图');
      if (Object.entries(document.links).some(([model, render]) => model !== modelId && render === renderId)) throw new Error('这张成图已对应其他模型，请选择尚未对应的成图');
      if (renderId) { document.links[modelId] = renderId; delete document.models.find(m => m.id === modelId).renderStale; delete document.renders.find(r => r.id === renderId).stale; }
      else delete document.links[modelId];
      if (referenceIds !== undefined) {
        if (!Array.isArray(referenceIds) || referenceIds.length > 100 || new Set(referenceIds).size !== referenceIds.length || referenceIds.some(ref => !document.renders.some(r => r.id === ref && r.imageRole === 'reference'))) throw new Error('请选择项目中的参考图片');
        const model = document.models.find(m => m.id === modelId); model.referenceIds = referenceIds; model.referenceBinding = 'manual';
      }
      await this.write(directory, document); return this.snapshot(id);
    });
  }
  async saveRevision(id, sourceId, buffer, edit) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id);
      const source = document.models.find(item => item.id === sourceId);
      if (!source) throw new Error('修改来源不在当前项目中');
      const asset = { id: randomUUID(), path: `${path.parse(source.path).name.slice(0, 90)}_AI三角阵列_${Date.now()}.glb`, sha256: createHash('sha256').update(buffer).digest('hex'), derivedFrom: sourceId, edit, createdAt: new Date().toISOString() };
      await fs.writeFile(path.join(directory, asset.path), buffer, { flag: 'wx' });
      document.models.push(asset);
      await this.write(directory, document);
      return { project: await this.snapshot(id), model: await this.model(id, asset.id) };
    });
  }
  async model(id, modelId) {
    const project = await this.snapshot(id); const item = project.models.find(item => item.id === modelId);
    if (!item || !item.exists) throw new Error('模型文件已移动或丢失，请检查项目目录');
    const descriptor = await this.library.model(project.rootId, item.path);
    const render = project.renders.find(render => render.id === project.links[modelId] && render.exists);
    const sha256 = await hash(await this.library.resolve(project.rootId, item.path)), renderSha256 = render ? await hash(await this.library.resolve(project.rootId, render.path)) : null;
    const referenceImages = await Promise.all(project.references.filter(r => item.referenceIds.includes(r.id) && r.exists).map(r => this.imageDescriptor(project,r)));
    return { ...descriptor, url: descriptor.url + '?revision=' + sha256, sha256, subject: item.subject, referenceIds: item.referenceIds, referenceImages, renderStale: !!item.renderStale, renderSha256, renderUrl: render ? render.url + '?revision=' + renderSha256 : null, projectId: id, assetId: modelId, renderId: render?.id || null };
  }
  async imageSource(project,image,expectedHash) {
    let file = await this.library.resolve(project.rootId,image.path), digest = await hash(file), historical = false;
    if (expectedHash && expectedHash !== digest) {
      if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('图片版本标识无效');
      const record = image.history?.find(h => h.sha256 === expectedHash);
      if (!record || !this.backupDirectory) throw new Error('原图片已变化，未找到可恢复的历史快照');
      const base = await fs.realpath(this.backupDirectory); file = await fs.realpath(record.backup);
      if (!inside(base,file) || !path.basename(file).startsWith(expectedHash) || await hash(file) !== expectedHash) throw new Error('图片历史快照无效或已变化');
      digest=expectedHash; historical=true;
    }
    const root = historical ? await this.library.grant(path.dirname(file)) : {id:project.rootId};
    const relative = historical ? path.basename(file) : image.path;
    return {file,sha256:digest,historical,url:`workbench://app/model/${root.id}/${relative.split('/').map(encodeURIComponent).join('/')}?revision=${digest}`};
  }
  async imageDescriptor(project,image,expectedHash) {
    const source = await this.imageSource(project,image,expectedHash);
    return {projectId:project.id,assetId:null,renderId:image.id,name:image.name,subject:image.subject,imageRole:image.imageRole,relatedModelIds:image.relatedModelIds,renderUrl:source.url,renderSha256:source.sha256,historical:source.historical,extension:path.extname(image.path),mediaType:image.mediaType || null};
  }
  async render(id, renderId, expectedHash) {
    const project = await this.snapshot(id), render = project.images.find(r => r.id === renderId && r.exists);
    if (!render) throw new Error('成图文件已移动或丢失，请检查项目目录');
    const descriptor = await this.imageDescriptor(project,render,expectedHash);
    descriptor.referenceImages = render.imageRole === 'reference' ? [] : await Promise.all(project.references.filter(r => (render.referenceIds || []).includes(r.id) && r.exists).map(r => this.imageDescriptor(project,r)));
    return descriptor;
  }
  async registerImage(id, sourceId, file) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id);
      const source = document.renders.find(r => r.id === sourceId);
      if (sourceId && (!source || Object.values(document.links).includes(sourceId))) throw new Error('独立图片来源无效或已配对模型。');
      if (path.dirname(file.file) !== directory || file.name !== path.basename(file.file) || !/\.png$/i.test(file.name)) throw new Error('无效的图片交付路径。');
      let item = document.renders.find(r => r.path.toLowerCase() === file.name.toLowerCase());
      if (item && (!file.inPlace || item.id !== sourceId)) throw new Error('输出图片已属于其他资源。');
      if (file.inPlace) {
        if (!source) throw new Error('原版图片更新需要已有图片。');
        item = source;
        if (item.path !== file.name) { (document.resources ||= []).push(item.path); item.path = file.name; }
        item.updatedAt = new Date().toISOString();
      } else {
        item = { id: randomUUID(), path: file.name, createdAt: new Date().toISOString(), ...(sourceId ? { derivedFrom: sourceId } : {}) };
        document.renders.push(item);
      }
      item.sha256 = file.sha256; item.standalone = true; item.mediaType = 'generated'; item.imageRole = file.imageRole || source?.imageRole || 'render'; item.subject = file.subject || source?.subject || relations.subjectName(file.name); delete item.stale;
      item.referenceIds = item.imageRole === 'render' ? file.referenceIds || [] : item.referenceIds || [];
      if (file.previous && file.previous.sha256 !== file.sha256) (item.history ||= []).push({ ...file.previous, replacedAt:new Date().toISOString() });
      relations.ensureRelations(document); relations.autoReference(document,item);
      for (const modelId of file.relatedModelIds || []) {
        const model = document.models.find(m => m.id === modelId); if (!model || item.imageRole !== 'reference') throw new Error('参考关联的模型无效');
        model.referenceIds = [...new Set([...model.referenceIds,item.id])];
      }
      await this.write(directory, document);
      return { project: await this.snapshot(id), image: await this.render(id, item.id) };
    });
  }
  async registerDelivery(id, sourceId, files) {
    return this.mutate(async () => {
      const { directory, document } = await this.read(id);
      if (sourceId && !document.models.some(item => item.id === sourceId)) throw new Error('修改来源不在当前项目中');
      const source = document.models.find(item => item.id === sourceId), inPlace = files.mode === 'in_place', renderOnly = files.mode === 'render_only';
      if ((inPlace || renderOnly) && !source) throw new Error('当前版本交付需要已有模型');
      const add = (file, list, replace = false, sourceModel = false) => {
        if (path.dirname(file.file) !== directory || file.name !== path.basename(file.file)) throw new Error('无效的交付路径');
        let existing = list.find(item => item.path.toLowerCase() === file.name.toLowerCase());
        if (sourceModel) {
          if (existing && existing.id !== source.id) throw new Error('目标模型路径已属于另一个模型');
          existing = source;
          if (existing.path !== file.name) { (document.resources ||= []).push(existing.path); existing.path = file.name; }
        }
        if (existing) {
          if (existing.sha256 !== file.sha256) { if (!replace) throw new Error('已登记的交付版本发生变化，请另存新版本'); existing.sha256 = file.sha256; existing.updatedAt = new Date().toISOString(); }
          return existing;
        }
        const item = { id: randomUUID(), path: file.name, sha256: file.sha256, createdAt: new Date().toISOString() };
        list.push(item); return item;
      };
      const model = add(files.model, document.models, inPlace || renderOnly, inPlace || renderOnly);
      if (sourceId && model.id !== sourceId) model.derivedFrom = sourceId;
      model.subject = files.subject || source?.subject || relations.subjectName(model.path);
      model.referenceIds = [...new Set([...(source?.referenceIds || []),...(files.referenceIds || []),...(model.referenceIds || [])])];
      for (const ref of model.referenceIds) {
        const image = document.renders.find(r => r.id === ref);
        if (image && !Object.values(document.links).includes(ref)) { image.imageRole = 'reference'; image.subject = model.subject; }
      }
      if (model.referenceIds.some(ref => !document.renders.some(r => r.id === ref && r.imageRole === 'reference'))) throw new Error('模型的参考来源不在项目中');
      if (!renderOnly || !model.referenceHashes) model.referenceHashes = model.referenceIds.map(id => ({id,sha256:files.referenceHashes?.find(r => r.id === id)?.sha256 || source?.referenceHashes?.find(r => r.id === id)?.sha256 || document.renders.find(r => r.id === id).sha256}));
      if (files.native) { model.nativeSource = files.native.name; delete model.nativeStale; }
      else if (inPlace && files.modelChanged && model.nativeSource) model.nativeStale = true;
      if (files.render) {
        const render = add(files.render, document.renders, inPlace || renderOnly);
        if (render.imageRole === 'reference') throw new Error('参考图片不能被覆盖为模型渲染');
        render.imageRole = 'render'; render.subject = model.subject; delete render.standalone;
        render.referenceIds = [...model.referenceIds]; render.mediaType = 'native-render';
        if (path.parse(render.path).name !== path.parse(model.path).name) throw new Error('模型与成图文件名前缀必须完全一致');
        if (Object.entries(document.links).some(([other, image]) => other !== model.id && image === render.id)) throw new Error('成图已绑定其他模型');
        document.links[model.id] = render.id;
        delete model.renderStale; delete render.stale;
      } else if (inPlace && files.sceneChanged) {
        const old = document.renders.find(r => r.id === document.links[model.id]); if (old) { old.stale = true; model.renderStale = true; }
        delete document.links[model.id];
      }
      await this.write(directory, document);
      return { project: await this.snapshot(id), model: await this.model(id, model.id) };
    });
  }
}
module.exports = { ProjectStore, IMAGE_EXTENSIONS, MANIFEST, prefix, pairUnique };
