const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readGLB } = require('./model-edit.cjs');
const { inside } = require('./files.cjs');
const { parseEdits } = require('./point-edit-data.cjs');
const { deliveryIntent } = require('./delivery-policy.cjs');
const { VISUAL_STYLE_INSTRUCTIONS } = require('./visual-styles.cjs');
const { CREATION_INSTRUCTIONS } = require('./creation-presets.cjs');
const { ImageDelivery, imageRequested } = require('./image-delivery.cjs');
const framework = require('./modeling-framework.cjs');
const relations = require('./asset-relations.cjs');
const digest = data => createHash('sha256').update(data).digest('hex');
const DELIVERY_TOOLS = [
  { type: 'function', name: 'save_workbench_structure_plan', description: '第二步A：保存结构拆解方案，复制版本固定的建模框架。先规划model_edit，按modelingFramework.example的JSON结构填写；只保存方案不算完成建模。', inputSchema: { type: 'object', properties: { planJson: { type: 'string' } }, required: ['planJson'], additionalProperties: false } },
  { type: 'function', name: 'publish_workbench_image', description: '校验并登记独立生成/修改的PNG图片。用于没有关联模型的图片任务，输出路径由上下文output.image提供；不创建GLB、原工程或模型配对。没有新图片时不能报告完成。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { type: 'function', name: 'get_workbench_context', description: '获取当前项目目录、输入模型、原工程、交付路径和命名规范。可以使用原生 shell/文件/建模工具完成任意用户授权的建模和渲染操作。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { type: 'function', name: 'plan_workbench_delivery', description: '实际制作前选择本轮操作和路径。model_edit默认升版，明确保留版本时原版更新；render_only只补当前版PNG。自动识别与用户意思不符时，可用keepVersion和userQuote逐字引用用户本轮关于版本的原话调整，不能虚构授权。普通对话不调用。', inputSchema: { type: 'object', properties: { operation: { type: 'string', enum: ['model_edit', 'render_only'] }, keepVersion: { type: 'boolean' }, userQuote: { type: 'string' } }, required: ['operation'], additionalProperties: false } },
  { type: 'function', name: 'publish_workbench_result', description: '按本轮制作策略校验并登记实际文件。模型修改交付GLB及使用软件的原工程；仅渲染现有模型只交付同前缀PNG，不新增模型版本。明确保留版本时更新原条目。直接GLB编辑或仅渲染可用none。无变化时不创建版本。', inputSchema: { type: 'object', properties: { sourceFormat: { type: 'string', enum: ['blend', 'c4d', 'none'] } }, required: ['sourceFormat'], additionalProperties: false } }
];
const AGENT_INSTRUCTIONS = `你是可视化实验室本地工作台中的 Codex。默认用中文交流，像本地编码助手一样直接完成用户要求的建模、修改、脚本执行、导出、渲染和排错。你有本机完整文件与命令执行权限，原生 shell、文件工具和本机已配置的工具可以正常使用，不限于预设阵列操作。不更改用户全局 Codex 登录或设置。遵守用户目标和现有项目约定；不要擅自发送消息、发布内容或处理无关文件。
有项目时先阅读本轮工作台上下文，必要时调用 get_workbench_context。当前模型文件、项目目录及选中结构由本轮上下文提供；不得把之前对话中的旧项目当成当前项目。
工作台会把用户在“修改意见”中记录的要求和内部定位指令一起交给你。内部协议、定位JSON、哈希及包装提示词仅供执行，不要在回复里复述；用自然语言说明修改内容、结果和需要用户确认的事项。
局部修改规则：本轮 editTargets 是用户在工作台右击后生成并手动发送的定位。以这些定位锁定输入文件及对象，不得用后来选中的对象替代。对象的 gltfNodeIndex 是输入 GLB/glTF JSON 的 nodes 下标（从0开始），层级路径和网格/primitive下标用于区分重名对象；不能把工作台运行时 UUID 当原工程对象编号。先核对原模型和原工程的名称、层级及几何对应，再仅修改指定部位，保留其他结构。成图定位使用原图左上角原点、x向右/y向下的像素及归一化坐标；先查看 imageInputs 中的原图（Codex同时收到图片输入，其他Agent使用本机读图工具），结合画面和模型/相机确认目标。像素不等于三维节点，无法确定对应结构时只询问必要信息，不猜改其他对象。没有配对模型的图片默认使用生图/改图工具，根据原图与位置意见重新输出独立图片，不要求用户关联模型，不调用Blender/C4D渲染。局部修改遵守本轮操作策略：是否升版由实际操作及用户明确指示决定，不由定位包装文字决定。
软件选择规则：初版默认支持 C4D（Cinema 4D）和 Blender，不主动扩展其他软件接入。用户明确指定软件时，先核实本机安装和版本再执行。同一制作任务中用户已明确确认的软件可以继续沿用。新制作任务尚未指定或确认软件时，必须先扫描本机已安装的建模软件，优先检查 C4D 和 Blender：使用 PATH、安装注册表和常见安装目录，不无目的遍历全盘。列出检测到的软件、版本及可用情况，询问用户本次使用哪一个，并等待用户明确答复后才开始建模、模型修改、导出或渲染。即使只检测到一种软件，也要先询问；不能仅凭工程扩展名或助手上次自行采用的软件视为用户已选择。扫描阶段只检查环境和文件，不开始制作。未找到可用软件时如实说明，不自行安装或改用其他软件。
用户选定软件后直接执行任务，不要因“只能聊天”而拒绝执行。建模和渲染默认采用脚本、命令行或软件API后台执行：Blender优先使用 --background/--python 和 bpy；C4D优先使用可用的命令行、Python或插件接口。不要默认使用computer-use、鼠标键盘自动点击、屏幕坐标操作或GUI截图操控，也不要为了建模/渲染自动启用电脑操控技能。只有用户明确要求GUI操作，或确认缺少脚本接口且说明原因并获得同意后，才切换到GUI。Windows 使用 Start-Process 时须用 -WindowStyle Hidden。用户未授权安装软件时不要自行安装。
建模第二步分为两小步：A先查看参考并拆解整体结构，保存稳定对象ID、分组、几何尺寸位置、材质、相机、灯光、渲染参数和隐藏结构假设；B按代码框架建模、重开原工程检查实际几何、导出GLB并真实渲染PNG，最后核对结构和成图。框架路径与示例由modelingFramework提供。先plan_workbench_delivery，再save_workbench_structure_plan；读取返回目录的README和示例，用复制到项目的run.py调用已确认的软件。基础适配器只覆盖box/sphere/cylinder；复杂结构写独立项目脚本并复用common.py的审计和导出，不修改基础工具。参考图建模必须交付结构方案、原工程、实际PNG及audit.json；后端校验输入/方案/输出哈希、对象ID和几何。普通局部修改与仅渲染不强制重新拆解。没有专用工具时按同样格式复制代码到<交付前缀>_reproduction目录并生成structure.json/audit.json。保存代码、参数、软件版本、原图摘要和差异清单；不能把通过文件检查当成视觉验收，单张图不能唯一恢复遮挡结构，不承诺跨软件或硬件逐像素一致。
图片用途与稳定命名：项目包含参考、模型、成片三个虚拟分组。生图参考和上传参考归reference，模型原生渲染或独立最终插图归render；参考不能冒充模型真实渲染。同一主体可有多张用途不同的参考，参考与模型按资源ID关联，不只靠文件名前缀。已有文件不因普通对话、补参考、重渲染而反复改名升版；实际改模型仍按原交付规则保留历史。
imageOnly任务制作前，结合用户本轮需求、原图和assetCatalog判断图片用途、稳定主体名与参考关系，把JSON写入imagePlan.file。结构由imagePlan.schema说明：imageRole为reference或render，subject是简短稳定对象名，variant仅在确有不同用途时填写，例如结构/配色/视角；relatedModelIds只用于参考对应的真实模型ID；referenceIds用于独立成图采用的参考ID。不要每轮添加日期、时间戳或递增编号；没有足够依据不乱连不同对象。若明确需要不同独立图，使用能表达内容的主体/用途名。图片先写output.image暂存路径，工作台验证后自动发布、归组、备份更新稳定文件名，不直接覆盖项目原件。分类和定位规则是内部协议，不复述给用户。
据参考建模时，结构方案subject填写稳定对象名，优先沿用准确的参考主体名；save_workbench_structure_plan可能返回校准后的outputStem，以返回路径制作。模型交付会继承参考ID，最终真实渲染继续与该模型同完整前缀。已有模型上下文的referenceImages包含关联参考，按本轮需要读取，不自行扫描其他图库。
独立图片规则：imageOnly=true时，读取inputImage和editTargets，以output.image为唯一图片交付路径；保持未要求改变的区域，优先图像编辑工具，必要时按原图与意见再次生成。实际输出PNG后调用publish_workbench_image；没有该动态工具的Agent按相同路径保存，由工作台自动登记。独立图片不生成GLB/原工程；参考可关联模型，但不能当成模型渲染配对。没有生图工具或任务未完成时明确说明，不能把旧图复制到输出路径冒充生成。普通讨论与只要提示词不强制出图。用户明确要根据图片建模时改走建模流程。
交付约定必须遵守：
1. 普通对话、说明、检查环境、询问软件、没有实际变更的操作不创建文件，不增加模型版本。上下文的outputMode=none表示尚未制作，不代表必须生成新版本。
2. 实际制作前调用plan_workbench_delivery选择model_edit或render_only，按返回路径操作。自动识别与用户明确意思不符时，用keepVersion/userQuote逐字引用本轮用户原话调整，不必让用户重复已给出的版本指示。仅修改模型/工程时默认另存下一可用版本，例如v001到v002；新建模型从v001开始。只有实际交付才登记版本。不要把字节完全相同的模型拷贝作为新版本。
3. 用户明确要求“不改版本号、保持当前版本、原版修改”时使用当前版本路径，工作台已备份允许更新的原件，不要再新建模型条目或版本。不要将这种明确授权误判为禁止覆盖；只允许修改本轮指定的模型、原工程及成图路径，不涉及其他模型文件。
4. render_only只渲染已有模型，沿用模型的完整前缀输出真实PNG。例如已有芯片_v001.glb但没有成图，直接输出芯片_v001.png。不要复制出v002.glb，也不要为了只渲染而重新保存GLB或原工程。重新渲染已有PNG也保持模型版本，原图已有备份；不能把未更新的旧图或工作台截图当新渲染。
5. 若nativeSourceStale=true，旧原工程与当前GLB已不同步，不可直接用旧工程几何渲染；从当前GLB导入重建，可参考staleNativeReference的相机/布光并核对，但几何与材质以当前GLB为准。新建/修改模型仍交付GLB 2.0，缓冲和贴图内嵌，保留独立对象与名称/分组。使用Blender修改模型时同步保存指定.blend（compress=False）；C4D同步保存同前缀.c4d。只渲染不强制再交付GLB和原工程。直接编辑GLB可用sourceFormat=none。
6. 模型改动后若没有重新渲染，旧成图会解除配对，不能冒充更新后的效果。需要成图时真实渲染新的PNG；模型、当前成图、原工程沿用各自同一版本完整前缀。文件平铺存到项目目录，不创建“模型”“成片”实体文件夹，不直接改写项目清单。
7. 有真实交付时调用publish_workbench_result；只对文件校验通过的结果报告完成。讨论、软件选择与任务未完成时不调用交付，也不虚构版本变化。没有项目时可正常对话和执行明确本机任务；交付到工作台需要先添加/打开项目。` + VISUAL_STYLE_INSTRUCTIONS + CREATION_INSTRUCTIONS;

function baseName(value) {
  let name = value.replace(/\.(?:glb|gltf|fbx|obj|blend|c4d)$/i, '').replace(/_AI三角阵列_\d+$/, '').replace(/_v\d+$/i, '').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 80);
  if (!name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) name = '工作台模型';
  return name;
}
function renderRequested(text) {
  return /渲染|成图|出图|\brender\b/i.test(text) && !/(?:不要|无需|不用|暂不|不必|不需要|不).{0,3}(?:渲染|成图|出图|\brender\b)/i.test(text);
}
class DeliveryManager {
  constructor({ projects, library, backupDirectory, validateImage = () => true, imageSize }) { Object.assign(this, { projects, library, backupDirectory, validateImage, imageSize }); this.pendingPlans = new Map(); this.imageDelivery = new ImageDelivery({ projects, library, backupDirectory, validateImage, imageSize }); }
  async prepare(context, text) {
    const targets = parseEdits(text);
    if (!context?.projectId) { if (targets.length) throw new Error('局部修改必须关联原项目。'); return null; }
    if (targets.some(t => t.projectId !== context.projectId || t.assetId !== (context.assetId || null))) throw new Error('局部修改定位与本轮项目/模型不一致。');
    const project = await this.projects.snapshot(context.projectId);
    const referenceKey = !context.assetId && (context.renderId || targets.find(t => t.kind === 'image')?.renderId) || null;
    const requestIntent = deliveryIntent(text, targets);
    const taskKey = JSON.stringify([context.agentId || 'codex', context.conversationId || null, project.id, context.assetId || null, referenceKey]);
    const continuingModeling = referenceKey && this.pendingPlans.has(taskKey) && requestIntent.continuation && !imageRequested(requestIntent.request);
    if (!continuingModeling && this.imageDelivery.matches(context, text, targets)) return this.imageDelivery.prepare(context, text, targets, project);
    const model = context.assetId ? await this.projects.model(project.id, context.assetId) : null;
    const source = model ? await this.library.resolve(model.rootId, model.relative) : null;
    const intent = requestIntent;
    const previous = (intent.continuation || intent.keepVersion && !intent.operation) && !intent.forceRevision && !intent.discussion ? this.pendingPlans.get(taskKey) : null;
    const referenceAsset = referenceKey ? project.images.find(r => r.id === referenceKey) : null;
    const subject = baseName(model?.name || referenceAsset?.subject || relations.inferSubject(intent.request,project.name)), names = (await fs.readdir(project.directory)).map(n => n.toLocaleLowerCase());
    const versionPrefix = subject.toLocaleLowerCase() + '_v';
    let version = Math.max(0, ...names.filter(name => name.startsWith(versionPrefix)).map(name => Number(/^(\d+)(?:[_.])/.exec(name.slice(versionPrefix.length))?.[1]) || 0)) + 1, stem;
    do { stem = `${subject}_v${String(version++).padStart(3, '0')}`; } while (names.some(n => n.startsWith(stem.toLocaleLowerCase() + '.') || n.startsWith(stem.toLocaleLowerCase() + '_')));
    const protectedFiles = [], inputFiles = source ? [source] : [];
    let reference = null;
    const referenceId = !model && (context.renderId || targets.find(t => t.kind === 'image')?.renderId);
    if (referenceId) {
      const r = project.images.find(r => r.id === referenceId && r.exists);
      if (!r || Object.values(project.links).includes(referenceId)) throw new Error('参考图片不存在或配对已变化，请重新选择');
      const file = (await this.projects.imageSource(project,r,context.renderHash)).file, data = await fs.readFile(file);
      if (!this.validateImage(data)) throw new Error('参考图片无法解码');
      reference = { file, sha256: digest(data), size: this.imageSize?.(data) || null, renderId: referenceId, subject:r.subject }; inputFiles.push(file);
      inputFiles.push(await this.library.resolve(project.rootId,r.path));
    }
    const editTargets = [], images = reference ? [reference.file] : [];
    let sourceData;
    for (const target of targets) {
      if (source && target.sourceHash) {
        sourceData ||= await fs.readFile(source);
        if (target.sourceHash !== digest(sourceData)) throw new Error('定位之后模型文件发生变化，请重新加载并右击目标，避免修改错误版本。');
      }
      if (target.kind === 'object') {
        const sourceNode = [...target.object.hierarchy].reverse().find(p => p.gltfNodeIndex !== undefined)?.gltfNodeIndex;
        if (sourceNode !== undefined && /\.gl(?:b|tf)$/i.test(source)) {
          sourceData ||= await fs.readFile(source);
          // Input GLBs may use external buffers; only new deliveries require embedded buffers.
          const json = JSON.parse((/\.glb$/i.test(source) ? sourceData.subarray(20, 20 + sourceData.readUInt32LE(12)) : sourceData).toString('utf8').trim());
          if (!Number.isInteger(sourceNode) || !json.nodes?.[sourceNode]) throw new Error('定位的 GLTF 节点不存在，请重新选择。');
        }
        editTargets.push({ ...target, fileName: model.name, modelPath: source, sourceNodeIndex: sourceNode ?? null });
      } else {
        const render = project.images.find(r => r.id === target.renderId && r.exists);
        if (!render || model && project.links[model.assetId] !== render.id || !model && Object.values(project.links).includes(render.id)) throw new Error('成图与定位模型的配对已变化，请重新打开成图后定位。');
        const image = await this.library.resolve(project.rootId, render.path), data = await fs.readFile(image);
        if (target.renderHash && target.renderHash !== digest(data)) throw new Error('定位之后成图文件发生变化，请重新打开成图后定位。');
        if (!this.validateImage(data)) throw new Error('定位成图无法解码，请重新导入。');
        const size = this.imageSize?.(data);
        if (size && (size.width !== target.point.width || size.height !== target.point.height)) throw new Error('定位之后成图尺寸发生变化，请重新打开成图后定位。');
        inputFiles.push(image); if (!images.includes(image)) images.push(image);
        editTargets.push({ ...target, fileName: render.name, modelPath: source, imagePath: image, coordinateSystem: '原图左上角为原点，x向右/y向下，像素从0开始；u/v为图内百分比除以100' });
      }
    }
    const paired = project.renders.find(item => item.id === model?.renderId && item.exists);
    if (paired) inputFiles.push(await this.library.resolve(project.rootId, paired.path));
    const asset = project.models.find(item => item.id === model?.assetId);
    const referenceImages = [];
    for (const id of asset?.referenceIds || []) {
      const image = project.references.find(r => r.id === id && r.exists); if (!image) continue;
      const file = await this.library.resolve(project.rootId,image.path); inputFiles.push(file);
      referenceImages.push({id,name:image.name,file,sha256:digest(await fs.readFile(file))});
    }
    let nativeSource = null;
    for (const candidate of [asset?.nativeSource, ...(model ? ['.blend', '.c4d'].map(ext => path.parse(model.relative).name + ext) : [])].filter(Boolean)) {
      try { nativeSource = await this.library.resolve(project.rootId, candidate); inputFiles.push(nativeSource); break; } catch {}
    }
    const nativeReference = asset?.nativeStale ? nativeSource : null;
    if (nativeReference) nativeSource = null;
    const paths = prefix => Object.fromEntries([['model', '.glb'], ['render', '.png'], ['blend', '.blend'], ['c4d', '.c4d'], ['script', '_build.py']].map(([key, suffix]) => [key, path.join(project.directory, prefix + suffix)]));
    const nextOutput = paths(stem), currentStem = model ? path.parse(model.relative).name : null, sameOutput = model ? paths(currentStem) : null;
    const renderTarget = sameOutput && project.renders.find(r => r.path.toLowerCase() === path.basename(sameOutput.render).toLowerCase());
    const renderConflict = !!renderTarget && Object.entries(project.links).some(([id, image]) => id !== model.assetId && image === renderTarget.id);
    const modelConflict = !!sameOutput && project.models.some(m => m.id !== model.assetId && m.path.toLowerCase() === path.basename(sameOutput.model).toLowerCase());
    for (const file of sameOutput ? [sameOutput.model, sameOutput.render, sameOutput.blend, sameOutput.c4d] : []) { try { if ((await fs.stat(file)).isFile()) inputFiles.push(file); } catch {} }
    await fs.mkdir(this.backupDirectory, { recursive: true });
    for (const file of [...new Set(inputFiles)]) {
      const data = await fs.readFile(file), sha256 = digest(data), backup = path.join(this.backupDirectory, sha256 + path.extname(file));
      try { await fs.writeFile(backup, data, { flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST' || digest(await fs.readFile(backup)) !== sha256) throw error; }
      protectedFiles.push({ file, sha256, backup, mtime: String((await fs.stat(file, { bigint: true })).mtimeNs) });
    }
    const renderRequired = !!reference || !intent.discussion && !intent.skipRender && (intent.render || previous?.renderRequired || targets.some(t => t.kind === 'image'));
    const pendingPermission = !intent.forceRevision && intent.operation === 'model_edit' && this.pendingPlans.get(taskKey)?.keepAuthorized;
    const delivery = { context: { projectId: project.id, assetId: model?.assetId || null, ...(referenceId ? { renderId: referenceId } : {}) }, reference, taskKey, source, nativeSource, nativeReference, nextStem: stem, currentStem, nextOutput, sameOutput, renderConflict, modelConflict, intent, keepAuthorized: intent.keepVersion || previous?.keepAuthorized || pendingPermission || false, mode: 'none', stem: null, output: nextOutput, images, initialNames: new Set(names), protectedFiles, renderRequired,
      public: { projectName: project.name, projectDirectory: project.directory, inputModel: source, nativeSource, nativeSourceStale: !!asset?.nativeStale, staleNativeReference: nativeReference, selectedStructure: context.selectedStructure || null, editTargets, imageInputs: images, output: null, outputMode: 'none', renderRequired, namingRule: '只有实际改模型默认另存下一版本；仅渲染沿用当前模型同前缀PNG；用户明确不升版则原版更新；对话不生成版本', executionPolicy: '建模与渲染默认用脚本、命令行或软件API，后台执行，不使用电脑操控；仅用户明确要求GUI，或说明脚本接口缺失并获同意后才可使用GUI', permissions: 'full-access' } };
    delivery.public.modelingFramework = framework.context(delivery);
    delivery.public.subject = asset?.subject || referenceAsset?.subject || subject;
    delivery.public.referenceImages = referenceImages;
    delivery.public.deliveryOptions = { model_edit: nextOutput, render_only: sameOutput && !renderConflict ? { render: sameOutput.render } : null, keep_version: delivery.keepAuthorized && sameOutput && !modelConflict ? { ...sameOutput, render: renderConflict ? null : sameOutput.render } : null };
    if (renderConflict) delivery.public.renderConflict = '当前同名PNG已配对其他模型，渲染前需调整配对';
    const operation = intent.operation || previous?.operation;
    if (operation && !(operation === 'render_only' && !source)) this.plan(delivery, operation);
    else if (operation === 'render_only') delivery.public.requiresInputModel = true;
    return delivery;
  }
  async saveStructurePlan(delivery,raw) {
    const plan = framework.validatePlan(typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw));
    if (!delivery.source && delivery.mode === 'revision') {
      const subject = relations.safeName(relations.subjectName(plan.subject)), names = (await fs.readdir(delivery.public.projectDirectory)).map(n => n.toLowerCase());
      if (await this.changed(delivery,delivery.nextOutput.model)) throw new Error('请在建模前确认主体名称，已有输出不可在保存方案时改名');
      let stem=subject+'_v001',n=2;while(['.glb','.blend','.c4d','.png'].some(ext => names.includes((stem+ext).toLowerCase()))) stem=subject+'_v'+String(n++).padStart(3,'0');
      delivery.nextStem=stem;delivery.nextOutput=Object.fromEntries(Object.entries(delivery.nextOutput).map(([k,v])=>[k,path.join(delivery.public.projectDirectory,stem+v.slice(path.join(delivery.public.projectDirectory,delivery.stem).length))]));
      delivery.stem=stem;delivery.output=delivery.nextOutput;delivery.public.output=delivery.output;delivery.public.deliveryOptions.model_edit=delivery.output;
      delivery.subject=subject;
      delivery.public.subject=subject;
    }
    return framework.savePlan(delivery,plan);
  }
  plan(delivery, operation, choice = {}) {
    if (!delivery) throw new Error('请先打开项目');
    if (delivery.kind === 'image') throw new Error('当前是独立图片任务，请输出PNG并登记图片，无需模型交付规划');
    if (!['model_edit', 'render_only'].includes(operation)) throw new Error('无效的制作操作');
    if (delivery.published) throw new Error('本轮已经登记交付，后续修改请开始新任务');
    if (typeof choice.keepVersion === 'boolean' && choice.keepVersion !== delivery.keepAuthorized) {
      const quote = typeof choice.userQuote === 'string' ? choice.userQuote.trim() : '';
      if (quote.length < 2 || !delivery.intent.request.includes(quote) || !/版本|这(?:一)?版|原版|原地|就地|覆盖|另存|副本|v\d+/i.test(quote)) throw new Error('改变版本策略需要逐字引用用户本轮明确的版本要求，不能自行授权覆盖');
      if (!choice.keepVersion && deliveryIntent(quote).keepVersion) throw new Error('用户引用仍要求保留版本，不能改为另存新版本');
      delivery.keepAuthorized = choice.keepVersion;
      delivery.public.deliveryOptions.keep_version = choice.keepVersion && delivery.sameOutput && !delivery.modelConflict ? { ...delivery.sameOutput, render: delivery.renderConflict ? null : delivery.sameOutput.render } : null;
    }
    if (operation === 'render_only' && !delivery.source) throw new Error('仅渲染需要先选择现有模型');
    if (operation === 'model_edit' && delivery.keepAuthorized && delivery.modelConflict) throw new Error('同前缀GLB已属于另一个模型，不能原版覆盖该文件，请先调整模型文件名');
    if (delivery.renderConflict && (operation === 'render_only' || delivery.keepAuthorized && delivery.renderRequired)) throw new Error('当前同名PNG已配对其他模型，请先调整配对后再渲染，避免覆盖其他模型的成图');
    delivery.mode = operation === 'render_only' ? 'render_only' : delivery.source && delivery.keepAuthorized ? 'in_place' : 'revision';
    delivery.stem = delivery.mode === 'revision' ? delivery.nextStem : delivery.currentStem;
    delivery.output = delivery.mode === 'revision' ? delivery.nextOutput : { ...delivery.sameOutput, ...(delivery.mode === 'render_only' ? { model: delivery.source } : {}) };
    if (delivery.mode === 'in_place' && delivery.renderConflict) delivery.output.render = null;
    delivery.public.outputMode = delivery.mode; delivery.public.output = operation === 'render_only' ? { render: delivery.output.render } : delivery.output;
    delivery.public.keepVersionAuthorized = !!delivery.keepAuthorized;
    if (operation === 'render_only') delivery.renderRequired = true;
    delivery.public.renderRequired = delivery.renderRequired;
    this.pendingPlans.set(delivery.taskKey, { operation, keepAuthorized: delivery.keepAuthorized, renderRequired: delivery.renderRequired });
    return delivery.public;
  }
  async changed(delivery, file, written = false) {
    if (!file) return false;
    try {
      const original = delivery.protectedFiles.find(p => p.file === file), data = await fs.readFile(file);
      if (!original) return !delivery.initialNames.has(path.basename(file).toLocaleLowerCase());
      return digest(data) !== original.sha256 || written && String((await fs.stat(file, { bigint: true })).mtimeNs) !== original.mtime;
    } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  }
  async assertOriginals(delivery) {
    const allowed = new Set(delivery.mode === 'in_place' && delivery.keepAuthorized ? [delivery.output.model, delivery.output.render, delivery.output.blend, delivery.output.c4d] : delivery.mode === 'render_only' ? [delivery.output.render] : []);
    for (const item of delivery.protectedFiles) {
      if (allowed.has(item.file)) continue;
      let current;
      try { current = digest(await fs.readFile(item.file)); } catch {}
      if (current !== item.sha256) throw new Error(`输入原件发生变化，交付未通过：${path.basename(item.file)}。原始备份保存在 ${item.backup}，请核对后恢复；不要将覆盖原件当作另存新版本。`);
    }
  }
  async file(delivery, key, required) {
    const file = delivery.output[key];
    if (!file) { if (required) throw new Error('本轮没有可用的交付路径'); return null; }
    let real;
    try { real = await fs.realpath(file); }
    catch (error) { if (error.code === 'ENOENT' && !required) return null; throw new Error(`缺少交付文件：${path.basename(file)}`); }
    if (!inside(delivery.public.projectDirectory, real) || real !== path.resolve(file)) throw new Error('交付文件必须直接保存在项目目录，不能使用外部链接');
    const data = await fs.readFile(real);
    if (!data.length) throw new Error(`交付文件为空：${path.basename(file)}`);
    return { file: real, name: path.basename(real), data, sha256: digest(data) };
  }
  validateRender(render) {
    if (render && (render.data.length < 33 || !render.data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || !this.validateImage(render.data))) throw new Error('渲染成图不是可解码的 PNG');
  }
  async publish(delivery, sourceFormat = 'none') {
    if (!delivery) throw new Error('请先添加或打开工作台项目');
    if (delivery.kind === 'image') throw new Error('独立图片请使用publish_workbench_image');
    if (!['blend', 'c4d', 'none'].includes(sourceFormat)) throw new Error('无效的原工程格式');
    if (delivery.published) return null;
    if (delivery.mode === 'none') {
      if (await this.changed(delivery, delivery.nextOutput.model)) this.plan(delivery, 'model_edit');
      else if (delivery.sameOutput && await this.changed(delivery, delivery.sameOutput.render, true)) this.plan(delivery, 'render_only');
      else throw new Error('请先选择实际制作操作，再按对应路径交付文件');
    }
    await this.assertOriginals(delivery);
    const model = await this.file(delivery, 'model', true);
    const modelChanged = !delivery.source || model.sha256 !== delivery.protectedFiles.find(p => p.file === delivery.source)?.sha256;
    if (delivery.mode !== 'render_only') {
      const { json } = readGLB(model.data);
      if (!json.meshes?.some(mesh => mesh.primitives?.length) || !json.scenes?.length) throw new Error('GLB 中没有可展示的三维场景');
      if ([...(json.buffers || []), ...(json.images || [])].some(item => item.uri && !item.uri.startsWith('data:'))) throw new Error('GLB 的缓冲和贴图必须内嵌');
    }
    let render = await this.file(delivery, 'render', delivery.renderRequired);
    if (render && !await this.changed(delivery, render.file, true)) render = null;
    if (delivery.renderRequired && !render) throw new Error('缺少本轮新输出的渲染 PNG，不能用未更新的旧成图交付');
    this.validateRender(render);
    const native = delivery.mode === 'render_only' || sourceFormat === 'none' ? null : await this.file(delivery, sourceFormat, true);
    if (native && sourceFormat === 'blend' && (native.data.length < 12 || native.data.subarray(0, 7).toString() !== 'BLENDER')) throw new Error('请保存有效、未压缩的 Blender 工程（compress=False）');
    if (native && modelChanged && !await this.changed(delivery, native.file, true)) throw new Error('模型已经变化，请同步保存本轮原工程');
    const nativeChanged = !!native && (!delivery.nativeSource || native.sha256 !== delivery.protectedFiles.find(p => p.file === delivery.nativeSource)?.sha256);
    if (delivery.mode === 'revision' && delivery.source && !modelChanged && !nativeChanged && !delivery.intent.forceRevision) {
      // Byte-identical GLB copies are not model revisions. Keep a new render on the source version.
      if (render) {
        const duplicateModel = model.file, duplicateRender = render.file;
        this.plan(delivery, 'render_only');
        const temporary = delivery.output.render + '.delivery-' + require('node:crypto').randomUUID() + '.tmp';
        await fs.writeFile(temporary, render.data, { flag: 'wx' }); await fs.rename(temporary, delivery.output.render);
        const update = await this.publish(delivery, 'none');
        if (!delivery.initialNames.has(path.basename(duplicateModel).toLocaleLowerCase())) await fs.unlink(duplicateModel);
        if (duplicateRender !== delivery.output.render && !delivery.initialNames.has(path.basename(duplicateRender).toLocaleLowerCase())) await fs.unlink(duplicateRender);
        return update;
      }
      if (!delivery.initialNames.has(model.name.toLocaleLowerCase())) await fs.unlink(model.file);
      if (native && delivery.nativeSource && native.sha256 === delivery.protectedFiles.find(p => p.file === delivery.nativeSource)?.sha256 && !delivery.initialNames.has(native.name.toLocaleLowerCase())) await fs.unlink(native.file);
      this.pendingPlans.delete(delivery.taskKey); return null;
    }
    const reproduction = await framework.verify(delivery, { model, render, native });
    const mode = delivery.mode;
    const revision = await this.projects.registerDelivery(delivery.context.projectId, delivery.context.assetId, { model, render, native, stem: delivery.stem, subject:delivery.subject || delivery.public.subject, referenceIds:[...(delivery.public.referenceImages || []).map(r => r.id),...(delivery.reference ? [delivery.reference.renderId] : [])], referenceHashes:[...(delivery.public.referenceImages || []).map(r => ({id:r.id,sha256:r.sha256})),...(delivery.reference ? [{id:delivery.reference.renderId,sha256:delivery.reference.sha256}] : [])], mode, modelChanged, sceneChanged: modelChanged || nativeChanged });
    delivery.published = true; this.pendingPlans.delete(delivery.taskKey);
    delivery.accepted = [model, render, native].filter(Boolean).map(file => ({ file: file.file, sha256: file.sha256 }));
    delivery.update = { ...revision, source: delivery.context, delivery: { mode, reproduction, stem: delivery.stem, modelChanged, nativeChanged, renderIncluded: !!render, sourceFormat, modelFile: model.file, renderFile: render?.file || null, nativeFile: native?.file || null, renderInvalidated: !!revision.model.renderStale } };
    return delivery.update;
  }
  async finish(delivery) {
    if (!delivery) return null;
    if (delivery.kind === 'image') return this.imageDelivery.finish(delivery);
    if (delivery.published) {
      for (const item of delivery.accepted) if (digest(await fs.readFile(item.file)) !== item.sha256) throw new Error(`交付登记后文件又被改写：${path.basename(item.file)}，请按新任务规则保存`);
      await this.assertOriginals(delivery); return null;
    }
    const modelChanged = await this.changed(delivery, delivery.source), nativeChanged = await this.changed(delivery, delivery.nativeSource || delivery.nativeReference);
    const nextModel = await this.changed(delivery, delivery.nextOutput.model);
    const currentRender = delivery.sameOutput && await this.changed(delivery, delivery.sameOutput.render, true);
    if (delivery.mode === 'none') {
      if ((modelChanged || nativeChanged) && delivery.keepAuthorized || nextModel) this.plan(delivery, 'model_edit');
      else if (currentRender && !modelChanged && !nativeChanged) this.plan(delivery, 'render_only');
    } else if (delivery.mode === 'revision' && !nextModel && currentRender && !modelChanged && !nativeChanged) this.plan(delivery, 'render_only');
    await this.assertOriginals(delivery);
    const outputChanged = delivery.mode === 'revision' ? nextModel : delivery.mode === 'in_place' ? await this.changed(delivery, delivery.output.model) || nativeChanged || currentRender : delivery.mode === 'render_only' ? currentRender : false;
    if (!outputChanged) {
      const created = (await fs.readdir(delivery.public.projectDirectory)).filter(name => !delivery.initialNames.has(name.toLocaleLowerCase()) && (/\.(?:glb|gltf|fbx|obj|blend|c4d)$/i.test(name) || delivery.renderRequired && /\.png$/i.test(name)));
      if (created.length) throw new Error(delivery.mode === 'render_only' ? `本轮只渲染现有模型，请输出 ${path.basename(delivery.output.render)}，不需要新建 GLB` : `检测到新文件，但缺少规范命名的 GLB：${path.basename(delivery.nextOutput.model)}。请按本轮交付路径导出后登记。`);
      return null;
    }
    let native = null;
    if (delivery.mode !== 'render_only') for (const key of ['blend', 'c4d']) if (await this.changed(delivery, delivery.output[key], true)) { native = key; break; }
    return this.publish(delivery, native || 'none');
  }

}
module.exports = { DeliveryManager, DELIVERY_TOOLS, AGENT_INSTRUCTIONS, baseName, renderRequested };
