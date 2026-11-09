import * as THREE from 'three';
import './chat.js';
import { setupLiquidGlass } from './liquid-glass.js';
import { setupWorkspaceLayout } from './workspace-layout.mjs';
import { startStartup } from './startup.js';
import {setupFluidMotion,animateTreeDisclosure} from './fluid-motion.js';
import {setupSidebarMenu} from './sidebar-menu.js';
import { setupPointEditing } from './point-edit.js';
import { setupImageZoom } from './image-zoom.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

setupLiquidGlass();
setupFluidMotion();
const $ = id => document.getElementById(id);
const api = window.workbench;
let root, currentModel, content, selected, generation = 0, toastTimer, isIsolated = false, isolatedVisibility;
let presentation = 'structure';
let presentationFrame = 0;
let referenceImage = null;
const imageZoom = {render:setupImageZoom($('final-render'),$('reset-render-zoom')),reference:setupImageZoom($('reference-render'),$('reset-reference-zoom'))};
let sourceObjects = new Map();
let projectList = [], activeProject = null;
const projectExpanded = new Set(), categoryCollapsed = new Set();
let projectBusyDepth = 0;
const fileExpanded = new Set(['', '示例模型']);
const fileCache = new Map();
const nodeById = new Map();
const collapsed = new Set();
const highlightMaterials = new Map();
const viewport = $('viewport');
const canvas = $('scene-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
scene.fog = new THREE.Fog('#ffffff', 16, 36);
let modelBackground=null;
function applySceneTheme() {
  scene.background.set(modelBackground || (document.documentElement.dataset.theme==='dark'?'#1b1d20':'#ffffff'));
  scene.fog.color.copy(scene.background);
}
const camera = new THREE.PerspectiveCamera(34, 1, .01, 1000);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture;
scene.environmentIntensity = .75;
room.dispose(); pmrem.dispose();
const ambient = new THREE.HemisphereLight(0xf2f6ff, 0xb4c2d5, .85);
scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff5e8, 2.4);
key.position.set(3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = key.shadow.camera.bottom = -8;
key.shadow.camera.right = key.shadow.camera.top = 8; key.shadow.bias = -.00025;
scene.add(key);
const fill = new THREE.DirectionalLight(0xb8d1ff, .9); fill.position.set(-4, 2, -2); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ color: 0x555555, opacity: .12 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(28, 56, 0xc7c7c7, 0xdedede);
grid.material.transparent = true; grid.material.opacity = .2; grid.material.depthWrite = false; scene.add(grid);
const axes = new THREE.AxesHelper(2); axes.visible = false; scene.add(axes);
const stage = new THREE.Group(); scene.add(stage);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = .09; controls.screenSpacePanning = true;
controls.minDistance = .02; controls.maxDistance = 100;
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
outline.edgeStrength = 4; outline.edgeGlow = .1; outline.edgeThickness = 1.5;
outline.visibleEdgeColor.set('#737373'); outline.hiddenEdgeColor.set('#888888');
outline.overlayMaterial.blending = THREE.NormalBlending;
composer.addPass(outline); composer.addPass(new OutputPass());
const draco = new DRACOLoader().setDecoderPath('workbench://app/decoders/draco/');
const ktx2 = new KTX2Loader().setTranscoderPath('workbench://app/decoders/basis/').detectSupport(renderer);
let modelBox = new THREE.Box3();
let viewMode = 'perspective';

function icon(name, className = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) element.setAttribute('class', className);
  element.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); element.append(use); return element;
}
function notify(message) {
  $('toast').firstElementChild.textContent = message;
  $('toast').hidden = false; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').hidden = true, 10000);
}
function status(message) { $('status-text').textContent = message; }
function report(error) { notify(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); }
function countTriangles(object) {
  let count = 0;
  object.traverse(node => { if (node.isMesh && node.geometry) count += (node.geometry.index?.count ?? node.geometry.attributes.position?.count ?? 0) / 3 * (node.isInstancedMesh ? node.count : 1); });
  return Math.round(count);
}
function meshCount(object) { let count = 0; object.traverse(node => { if (node.isMesh) count++; }); return count; }
function isStructure(node) { return node.isMesh || node.isLine || node.isPoints || node.children.some(isStructure); }
function objectLabel(node) { return node.userData.name || node.name || (node.isMesh ? '未命名网格' : node.isLine ? '线条' : node.isPoints ? '点云' : '未命名分组'); }
function visibleInHierarchy(node) { for (let item = node; item && item !== stage; item = item.parent) if (!item.visible) return false; return true; }
function visibleBounds(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  object.traverse(node => { if ((node.isMesh || node.isLine || node.isPoints) && visibleInHierarchy(node)) box.expandByObject(node); });
  return box;
}

async function readDirectory(relative) {
  const key = `${root.id}/${relative}`;
  if (!fileCache.has(key)) fileCache.set(key, await api.list(root.id, relative));
  return fileCache.get(key);
}
async function renderFiles() {
  if (projectList.length) { renderProjects(); return; }
  const rootId = root.id;
  const nav = $('file-tree');
  const list = document.createElement('ul'); list.className = 'tree-list';
  let fileCount = 0;
  async function append(relative, parent, depth) {
    const entries = await readDirectory(relative);
    for (const entry of entries) {
      const li = document.createElement('li');
      const row = document.createElement('div'); row.className = 'tree-row'; row.style.setProperty('--depth', depth);
      row.dataset.path = entry.relative;
      if (!entry.directory && currentModel?.rootId === rootId && currentModel.relative === entry.relative) row.classList.add('selected');
      const button = document.createElement('button'); button.className = `row-label ${entry.directory ? 'folder' : 'model'}`;
      const chevron = icon('chevron', `chevron ${entry.directory ? (fileExpanded.has(entry.relative) ? 'open' : '') : 'placeholder'}`);
      button.append(chevron, icon(entry.directory ? 'folder' : 'cube', 'node-icon'));
      const name = document.createElement('span'); name.className = 'row-name'; name.textContent = entry.name; button.append(name);
      button.title = entry.name;
      if (entry.directory) {
        button.setAttribute('aria-expanded', String(fileExpanded.has(entry.relative)));
        button.addEventListener('click', async () => {
          if (fileExpanded.has(entry.relative)) fileExpanded.delete(entry.relative); else fileExpanded.add(entry.relative);
          try { await renderFiles(); } catch (error) { report(error); }
        });
      } else {
        fileCount++;
        button.setAttribute('aria-pressed', String(row.classList.contains('selected')));
        button.addEventListener('click', async () => { try { await loadModel(await api.model(rootId, entry.relative)); } catch (error) { report(error); } });
      }
      row.append(button); li.append(row); parent.append(li);
      if (entry.directory && fileExpanded.has(entry.relative)) { const children = document.createElement('ul'); children.className = 'tree-list'; li.append(children); await append(entry.relative, children, depth + 1); }
    }
  }
  await append('', list, 0);
  if (root.id !== rootId) return;
  nav.replaceChildren(list);
  if (!list.children.length) { const empty = document.createElement('p'); empty.className = 'tree-message'; empty.textContent = '这里还没有可展示的模型。请选择包含 GLB、glTF、FBX 或 OBJ 的文件夹。'; nav.append(empty); }
  $('file-count').textContent = String(fileCount);
}
async function setRoot(value) {
  root = value; fileCache.clear(); fileExpanded.clear(); fileExpanded.add('');
  if (value.name === 'library') { fileExpanded.add('示例模型'); fileExpanded.add('第0期'); }
  $('root-name').textContent = value.name === 'library' ? '示例模型库' : value.name;
  $('root-name').title = value.path;
  await renderFiles();
}
function renderStructure() {
  const nav = $('structure-tree'); const list = document.createElement('ul'); list.className = 'tree-list';
  function append(node, parent, depth) {
    if (!isStructure(node)) return;
    nodeById.set(node.uuid, node);
    const li = document.createElement('li');
    const row = document.createElement('div'); row.className = 'tree-row'; row.style.setProperty('--depth', depth); row.dataset.node = node.uuid;
    row.classList.toggle('selected', selected === node); row.classList.toggle('hidden-node', !visibleInHierarchy(node));
    const children = node.children.filter(isStructure);
    if (children.length) {
      const toggle = document.createElement('button'); toggle.className = 'tree-toggle';
      toggle.setAttribute('aria-label', `${collapsed.has(node.uuid) ? '展开' : '收起'} ${objectLabel(node)}`);
      toggle.setAttribute('aria-expanded', String(!collapsed.has(node.uuid))); toggle.append(icon('chevron'));
      toggle.addEventListener('click', () => animateTreeDisclosure(nav,`[data-node="${CSS.escape(node.uuid)}"]`,()=>{ if (collapsed.has(node.uuid)) collapsed.delete(node.uuid); else collapsed.add(node.uuid); renderStructure(); })); row.append(toggle);
    }
    const button = document.createElement('button'); button.className = 'row-label';
    button.setAttribute('aria-pressed', String(selected === node)); button.title = objectLabel(node);
    if (!children.length) button.append(icon('chevron', 'chevron placeholder'));
    button.append(icon(children.length ? 'layers' : 'cube', 'node-icon'));
    const name = document.createElement('span'); name.className = 'row-name'; name.textContent = objectLabel(node); button.append(name);
    button.addEventListener('click', () => selectObject(node, true)); button.addEventListener('dblclick', () => focus(node)); row.append(button);
    const eye = document.createElement('button'); eye.className = `visibility ${node.visible ? '' : 'off'}`;
    eye.setAttribute('aria-label', `${node.visible ? '隐藏' : '显示'} ${objectLabel(node)}`); eye.setAttribute('aria-pressed', String(node.visible));
    eye.append(icon(node.visible ? 'eye' : 'eye-off'));
    eye.addEventListener('click', () => {
      node.visible = !node.visible;
      if (selected && !visibleInHierarchy(selected)) selectObject(null);
      renderStructure(); updateShowAll();
    });
    row.append(eye); li.append(row); parent.append(li);
    if (children.length && !collapsed.has(node.uuid)) { const childList = document.createElement('ul'); childList.className = 'tree-list'; li.append(childList); children.forEach(child => append(child, childList, depth + 1)); }
  }
  if (content) append(content, list, 0);
  nav.replaceChildren(list);
  updateProjectControls();
}
function clearHighlights() {
  for (const [node, original] of highlightMaterials) { const current = Array.isArray(node.material) ? node.material : [node.material]; current.forEach(material => material.dispose()); node.material = original; }
  highlightMaterials.clear(); outline.selectedObjects = [];
}
function selectObject(node, fromTree = false) {
  if (node && ['render','reference'].includes(presentation)) setPresentation('structure');
  clearHighlights(); selected = node;
  if (node) {
    for (let item = node; item && item !== stage; item = item.parent) { item.visible = true; collapsed.delete(item.uuid); }
    const outlineObjects = [];
    node.traverse(child => {
      if (child.isMesh && visibleInHierarchy(child)) {
        highlightMaterials.set(child, child.material);
        const tint = material => {
          const clone = material.clone();
          if (clone.color) clone.color.set('#527fe8');
          if ('metalness' in clone) clone.metalness = .15;
          if ('roughness' in clone) clone.roughness = .4;
          if (clone.emissive) { clone.emissive.set('#3156bf'); clone.emissiveIntensity = .08; }
          return clone;
        };
        child.material = Array.isArray(child.material) ? child.material.map(tint) : tint(child.material);
        outlineObjects.push(child);
      }
    });
    outline.selectedObjects = outlineObjects;
    $('selected-name').textContent = objectLabel(node);
    $('selected-type').textContent = node.isInstancedMesh ? '实例网格' : node.isMesh ? '网格' : node.isLine ? '线条' : node.isPoints ? '点云' : '分组';
    $('selected-meshes').textContent = String(meshCount(node));
    $('selected-triangles').textContent = countTriangles(node).toLocaleString();
    status(`已选择 · ${objectLabel(node)}`);
  } else status(currentModel ? `已载入 · ${currentModel.name}` : '就绪');
  $('selection-empty').hidden = !!node; $('selection-info').hidden = !node; $('clear-selection').disabled = !node;
  canvas.dataset.selected = node?.uuid || '';
  renderStructure(); updateShowAll();
  if (node && !fromTree) $('structure-tree').querySelector(`[data-node="${node.uuid}"]`)?.scrollIntoView({ block: 'nearest' });
}
function updateShowAll() {
  let hasHidden = false; content?.traverse(node => { if (!node.visible && isStructure(node)) hasHidden = true; });
  $('show-all').hidden = !hasHidden && !isIsolated;
  $('isolate').textContent = isIsolated ? '退出单独显示' : '单独显示';
}
function showAll() {
  if (isolatedVisibility) { for (const [node, visible] of isolatedVisibility) node.visible = visible; isolatedVisibility = null; }
  content?.traverse(node => { if (isStructure(node)) node.visible = true; }); isIsolated = false;
  if (selected) selectObject(selected, true); else renderStructure(); updateShowAll();
}
function isolate() {
  if (!selected) return;
  if (isIsolated) { for (const [node, visible] of isolatedVisibility || []) node.visible = visible; isolatedVisibility = null; isIsolated = false; selectObject(selected, true); return; }
  isolatedVisibility = new Map();
  const keep = new Set(); selected.traverse(node => keep.add(node));
  content.traverse(node => { isolatedVisibility.set(node, node.visible); if (node.isMesh || node.isLine || node.isPoints) node.visible = keep.has(node); });
  isIsolated = true; selectObject(selected, true);
}
function resize() {
  const { width, height } = viewport.getBoundingClientRect();
  const oldHalfAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1));
  camera.aspect = Math.max(width, 1) / Math.max(height, 1); camera.updateProjectionMatrix();
  const newHalfAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(camera.aspect, 1));
  if (content && oldHalfAngle > 0 && newHalfAngle > 0) camera.position.sub(controls.target).multiplyScalar(Math.sin(oldHalfAngle) / Math.sin(newHalfAngle)).add(controls.target);
  renderer.setSize(width, height, false); composer.setSize(width, height); outline.setSize(width, height);
}
new ResizeObserver(resize).observe(viewport);
function focus(node = content) {
  if (!node) return;
  const box = visibleBounds(node); if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, .03);
  const halfAngle = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
  const distance = radius / Math.sin(halfAngle) * 1.16;
  let direction = camera.position.clone().sub(controls.target).normalize();
  if (!direction.lengthSq()) direction.set(1, .75, 1);
  if (viewMode === 'top') direction.set(0, 1, .0001);
  else if (viewMode === 'front') direction.set(0, .0001, 1);
  camera.position.copy(center).addScaledVector(direction, distance); controls.target.copy(center);
  camera.near = Math.max(distance / 1000, .0001); camera.far = Math.max(distance * 100, 200); camera.updateProjectionMatrix();
  controls.minDistance = Math.max(radius * .025, .002); controls.maxDistance = Math.max(radius * 60, 40); controls.update();
}
function disposeObject(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); }
  });
  geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose()); textures.forEach(item => { item.dispose(); item.source?.data?.close?.(); });
}
function restrictedManager(warnings) {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    const value = new URL(url, 'workbench://app/');
    if (!['data:', 'blob:', 'workbench:'].includes(value.protocol) || (value.protocol === 'workbench:' && value.host !== 'app')) throw new Error('模型引用了外部资源，请先将贴图和资源打包到本地');
    return url;
  });
  manager.onError = url => warnings.push(decodeURIComponent(url.split('/').pop()).slice(0, 70));
  return manager;
}
async function loadModel(descriptor) {
  const ticket = ++generation; const warnings = []; let object, sourceCamera; const sources = new Map();
  $('loading').hidden = false; $('loading-text').textContent = `正在加载 ${descriptor.name}`;
  status(`正在读取 · ${descriptor.name}`);
  try {
    const manager = restrictedManager(warnings);
    if (descriptor.extension === '.glb' || descriptor.extension === '.gltf') {
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(descriptor.url);
      object = gltf.scene; sourceCamera = gltf.cameras[0];
      object.traverse(node => { const a = gltf.parser.associations.get(node) || {}; sources.set(node.uuid, { name: node.name, ...(a.nodes !== undefined ? { gltfNodeIndex: a.nodes } : {}), ...(a.meshes !== undefined ? { gltfMeshIndex: a.meshes } : {}), ...(a.primitives !== undefined ? { gltfPrimitiveIndex: a.primitives } : {}) }); });
      if (object.children.length === 1 && object.children[0].children.length && !object.children[0].isMesh) {
        const onlyChild = object.children[0]; onlyChild.removeFromParent(); object = onlyChild;
      }
    } else if (descriptor.extension === '.fbx') object = await new FBXLoader(manager).loadAsync(descriptor.url);
    else if (descriptor.extension === '.obj') {
      const response = await fetch(descriptor.url); if (!response.ok) throw new Error('无法读取模型文件');
      const text = await response.text(); const loader = new OBJLoader(manager);
      const baseURL = descriptor.url.slice(0, descriptor.url.lastIndexOf('/') + 1);
      const mtlName = /^\s*mtllib\s+(.+)$/im.exec(text)?.[1]?.trim();
      if (mtlName) {
        try { const materials = await new MTLLoader(manager).loadAsync(new URL(mtlName.replaceAll('\\', '/'), baseURL).href); materials.preload(); loader.setMaterials(materials); }
        catch { warnings.push('OBJ 材质'); }
      }
      object = loader.parse(text);
    } else throw new Error('仅支持 GLB、glTF、FBX、OBJ 文件');
    if (ticket !== generation) { disposeObject(object); return; }
    object.updateMatrixWorld(true);
    let geometryCount = 0;
    object.traverse(node => {
      if (node.isCamera || node.isLight) node.visible = false;
      if (/^Non-emissive[ _]studio[ _]reflection[ _]environment$/i.test(node.name)) node.visible = false;
      if (node.isMesh || node.isLine || node.isPoints) {
        geometryCount++;
        node.castShadow = node.isMesh; node.receiveShadow = node.isMesh;
        if (!node.material) node.material = new THREE.MeshStandardMaterial({ color: 0xaab9d1, roughness: .45 });
      }
    });
    const box = visibleBounds(object);
    const size = box.getSize(new THREE.Vector3());
    if (!geometryCount || box.isEmpty() || !Number.isFinite(size.length()) || size.length() < 1e-12) { disposeObject(object); throw new Error('文件中没有可展示的有效三维结构'); }
    selectObject(null); nodeById.clear(); collapsed.clear();
    if (content) { stage.remove(content); disposeObject(content); }
    object.traverse(node => { if (!sources.has(node.uuid)) sources.set(node.uuid, { name: node.name }); });
    sourceObjects = sources;
    object.name = descriptor.name.replace(/\.[^.]+$/, ''); content = object;
    stage.position.set(0, 0, 0); stage.scale.setScalar(1); stage.add(content);
    const scale = 6 / Math.max(size.x, size.y, size.z);
    stage.scale.setScalar(scale); stage.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-scale);
    stage.updateMatrixWorld(true); modelBox.copy(visibleBounds(content));
    ground.position.y = modelBox.min.y - .018; grid.position.y = ground.position.y + .003; axes.position.y = ground.position.y + .006;
    currentModel = descriptor; isIsolated = false; isolatedVisibility = null;
    viewport.closest('.viewport-panel').dataset.screen = 'model'; $('welcome-screen').hidden = true; $('go-home').setAttribute('aria-current', 'false');
    document.dispatchEvent(new CustomEvent('workbench:model', { detail: descriptor }));
    $('empty-project').hidden = true;
    let background;
    content.traverse(node => {
      if (/^#[\da-f]{6}$/i.test(node.userData.workbench_background || '')) background = node.userData.workbench_background;
      if (node.children.filter(isStructure).length > 40) collapsed.add(node.uuid);
      if (isStructure(node)) nodeById.set(node.uuid, node);
    });
    modelBackground=background || null;applySceneTheme();
    viewport.closest('.viewport-panel').classList.toggle('dark-preview', !!background);
    camera.position.set(8, 6.2, 9); controls.target.set(0, 0, 0); viewMode = 'perspective'; setViewButtons(); resize(); focus(content);
    if (sourceCamera) { camera.position.copy(sourceCamera.getWorldDirection(new THREE.Vector3())).multiplyScalar(-10); focus(content); }
    $('model-name').textContent = descriptor.name; $('model-name').title = descriptor.relative;
    $('model-format').textContent = descriptor.extension.slice(1).toUpperCase();
    const meshes = meshCount(content), triangles = countTriangles(content);
    $('structure-count').textContent = String(meshes);
    $('model-stats').textContent = `${meshes} 个网格 · ${triangles.toLocaleString()} 个三角面`;
    renderStructure(); updateShowAll(); await renderFiles();
    configureRender(descriptor);
    status(`已载入 · ${descriptor.name}`); canvas.dataset.loaded = descriptor.name;
    if (warnings.length) notify(`模型已打开，部分附属资源未能加载：${[...new Set(warnings)].slice(0, 3).join('、')}。请检查贴图与资源文件。`);
  } catch (error) {
    if (ticket === generation) { status(currentModel ? `已载入 · ${currentModel.name}` : '模型未能加载'); notify(`打开失败：${error.message}`); }
    console.warn('Model load failed:', error.message);
  } finally { if (ticket === generation) $('loading').hidden = true; }
}
function setViewButtons() { document.querySelectorAll('[data-view]').forEach(button => { const active = button.dataset.view === viewMode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); }
function setPresentation(mode, fit = true) {
  if (!['structure', 'render', 'reference', 'compare'].includes(mode)) return;
  if (mode === 'structure' && !content && currentModel || mode === 'render' && (!currentModel?.renderUrl || currentModel.imageRole === 'reference') || mode === 'reference' && !referenceImage) return;
  const changed = presentation !== mode;
  presentation = mode;
  viewport.closest('.viewport-panel').dataset.presentation = mode;
  $('render-pane').hidden = !['render','compare'].includes(mode);
  $('reference-pane').hidden = !['reference','compare'].includes(mode);
  $('structure-empty').hidden = !!content || mode !== 'compare';
  if (currentModel) {
    $('model-name').textContent = mode === 'reference' ? referenceImage?.name || currentModel.name : currentModel.name;
    $('model-format').textContent = mode === 'reference' ? '参考' : currentModel.assetId ? currentModel.extension.slice(1).toUpperCase() : '图片';
  }
  document.querySelectorAll('button[data-presentation]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.presentation === mode)));
  const frame=++presentationFrame;
  requestAnimationFrame(() => { if(frame!==presentationFrame)return;resize(); if (fit && changed && ['structure','compare'].includes(mode) && content) focus(content); });
  if (changed) { renderProjects(); document.dispatchEvent(new CustomEvent('workbench:model',{detail:mode==='reference'?referenceImage:currentModel})); }
}
function configureRender(descriptor, preferredMode = null) {
  const image = $('final-render');
  const finalUrl = descriptor.imageRole === 'reference' ? null : descriptor.renderUrl;
  image.onerror = () => {
    if (currentModel !== descriptor) return;
    descriptor.renderUrl = null;
    setPresentation('structure');
    document.querySelectorAll('button[data-presentation]').forEach(button => { if (button.dataset.presentation !== 'structure') button.disabled = true; });
    notify('模型已打开，但配套成图未能读取，请检查图片文件。');
  };
  if (finalUrl) image.src = finalUrl; else image.removeAttribute('src');
  image.hidden = !finalUrl; $('render-empty').hidden = !!finalUrl;
  const refs = descriptor.imageRole === 'reference' ? [descriptor] : descriptor.referenceImages || [];
  configureReferences(refs);
  document.querySelectorAll('button[data-presentation]').forEach(button => {
    button.disabled = button.dataset.presentation === 'structure' ? !content : button.dataset.presentation === 'render' ? !finalUrl : button.dataset.presentation === 'reference' ? !referenceImage : !content&&!finalUrl&&!referenceImage;
    button.title = button.disabled ? button.dataset.presentation==='reference'?'请导入并关联参考图片':'此内容尚未添加' : '';
  });
  setPresentation(preferredMode || (descriptor.imageRole==='reference'?'reference':finalUrl?(content?'compare':'render'):content?'structure':referenceImage?'reference':'structure'));
}
function configureReferences(refs, preferredId = referenceImage?.renderId) {
  $('reference-select').replaceChildren(...refs.map(r=>new Option(r.name,r.renderId)));$('reference-select').disabled=refs.length<2;
  showReference(refs.find(r=>r.renderId===preferredId)||refs[0]||null);
  document.querySelector('button[data-presentation="reference"]').disabled=!referenceImage;
}
function showReference(value) {
  referenceImage=value;
  const image=$('reference-render');image.hidden=!value;$('reference-empty').hidden=!!value;
  if(value){image.src=value.renderUrl;$('reference-select').value=value.renderId;}else image.removeAttribute('src');
  $('reference-caption-title').textContent=value?.historical?'参考（历史）':'参考';
}
$('reference-select').addEventListener('change',()=>{const ref=currentModel?.referenceImages?.find(r=>r.renderId===$('reference-select').value);showReference(ref);document.dispatchEvent(new CustomEvent('workbench:model',{detail:presentation==='reference'?referenceImage:currentModel}));renderProjects();});
function updateProject(project) {
  const index = projectList.findIndex(item => item.id === project.id);
  if (index >= 0) projectList[index] = project; else projectList.push(project);
  if (activeProject?.id === project.id) activeProject = project;
}
function updateProjectControls() {
  for (const button of document.querySelectorAll('#go-home, #add-project, #open-folder, #open-file, #file-tree button, #structure-tree button')) {
    if (projectBusyDepth && !button.disabled) { button.dataset.projectBusyDisabled = 'true'; button.disabled = true; }
    else if (!projectBusyDepth && button.dataset.projectBusyDisabled) { delete button.dataset.projectBusyDisabled; button.disabled = false; }
  }
}
async function projectAction(operation) {
  projectBusyDepth++; updateProjectControls();
  try { return await operation(); }
  finally { projectBusyDepth--; updateProjectControls(); }
}
function clearProjectView() {
  generation++; selectObject(null); nodeById.clear(); collapsed.clear();
  $('loading').hidden = true;
  if (content) { stage.remove(content); disposeObject(content); content = null; }
  currentModel = null; isIsolated = false; isolatedVisibility = null;
  modelBackground=null;applySceneTheme();
  document.dispatchEvent(new CustomEvent('workbench:model', { detail: activeProject ? { projectId: activeProject.id, name: activeProject.name } : null }));
  $('structure-count').textContent = '0'; $('model-stats').textContent = '';
  $('model-name').textContent = activeProject?.name || '本机项目'; $('model-format').textContent = '项目';
  delete canvas.dataset.loaded; renderStructure(); updateShowAll(); configureRender({ renderUrl: null });
  $('empty-project').hidden = true;
  const panel = viewport.closest('.viewport-panel');
  panel.dataset.screen = activeProject ? 'project' : 'home'; panel.classList.remove('dark-preview');
  $('welcome-screen').hidden = false;
  $('welcome-title').textContent = activeProject ? `您要在${activeProject.name}项目中构建什么` : '今天您有什么创意';
  $('welcome-description').textContent = activeProject ? '在下方描述创意，或从左侧选择已有模型' : '从下方开始对话，或在左侧选择一个项目';
  $('chat-input').placeholder = activeProject ? `描述您想在${activeProject.name}中构建的内容…` : '说说您今天的创意…';
  $('go-home').setAttribute('aria-current', activeProject ? 'false' : 'page');
  $('structure-tree').replaceChildren();
  const hint = document.createElement('p'); hint.className = 'tree-message'; hint.textContent = '选择或创建模型后，在这里查看结构'; $('structure-tree').append(hint);
}
async function chooseProject(project, showWelcome = true) {
  activeProject = await api.activateProject(project.id); updateProject(activeProject); projectExpanded.add(project.id);
  $('open-file').replaceChildren(icon('plus'), document.createTextNode('导入文件'));
  renderProjects();
  if (showWelcome) clearProjectView();
  status(`项目 · ${project.name}`);
}
function renderProjects() {
  const list = document.createElement('ul'); list.className = 'tree-list';
  $('root-name').textContent = activeProject ? activeProject.name : '本机项目';
  $('root-name').title = activeProject?.directory || '';
  $('file-count').textContent = `${projectList.length} 个项目`;
  for (const project of projectList) {
    const li = document.createElement('li'); const row = document.createElement('div');
    row.className = `tree-row project-root ${activeProject?.id === project.id ? 'active-project' : ''}`;
    row.dataset.project = project.id;
    row.classList.toggle('unavailable-project', !!project.unavailable);
    const toggle = document.createElement('button'); toggle.className = 'tree-toggle'; toggle.setAttribute('aria-expanded', String(projectExpanded.has(project.id))); toggle.setAttribute('aria-label', `${projectExpanded.has(project.id) ? '收起' : '展开'}项目 ${project.name}`); toggle.append(icon('chevron'));
    toggle.addEventListener('click', () => animateTreeDisclosure($('file-tree'),`[data-project="${CSS.escape(project.id)}"]`,()=>{ if (projectExpanded.has(project.id)) projectExpanded.delete(project.id); else projectExpanded.add(project.id); renderProjects(); }));
    const button = document.createElement('button'); button.className = 'row-label'; button.setAttribute('aria-pressed', String(activeProject?.id === project.id && !currentModel));
    button.title = project.directory; button.append(icon('folder', 'node-icon'));
    if (project.unavailable) { toggle.disabled = true; button.disabled = true; button.title += `\n暂不可用：${project.error}\n恢复目录后点击“刷新项目与文件”重试。`; row.title = button.title; }
    const name = document.createElement('span'); name.className = 'row-name'; name.textContent = project.name; button.append(name);
    button.addEventListener('click', async () => { try {
      await projectAction(() => chooseProject(project));
    } catch (error) { report(error); } });
    const count = document.createElement('span'); count.className = 'row-kind'; count.textContent = project.unavailable ? '暂不可用' : `${Object.keys(project.links).length} 对`;
    row.append(toggle, button, count); li.append(row); list.append(li);
    if (project.unavailable || !projectExpanded.has(project.id)) continue;
    const children = document.createElement('ul'); children.className = 'tree-list'; li.append(children);
    for (const [kind, label, assets] of [['reference','参考',project.references || []], ['model', '模型', project.models], ['render', '成片', project.renders]]) {
      const categoryKey = `${project.id}/${kind}`; const category = document.createElement('li');
      const groupRow = document.createElement('div'); groupRow.className = 'tree-row project-group'; groupRow.style.setProperty('--depth', 1);groupRow.dataset.group=categoryKey;groupRow.dataset.project=project.id;
      const groupButton = document.createElement('button'); groupButton.className = 'row-label';
      groupButton.setAttribute('aria-expanded', String(!categoryCollapsed.has(categoryKey)));
      groupButton.append(icon('chevron', `chevron ${categoryCollapsed.has(categoryKey) ? '' : 'open'}`), icon('folder', 'node-icon'), document.createTextNode(`${label} · ${assets.length}`));
      groupButton.addEventListener('click', () => animateTreeDisclosure($('file-tree'),`[data-group="${CSS.escape(categoryKey)}"]`,()=>{ if (categoryCollapsed.has(categoryKey)) categoryCollapsed.delete(categoryKey); else categoryCollapsed.add(categoryKey); renderProjects(); }));
      const add = document.createElement('button'); add.className = 'group-import'; add.setAttribute('aria-label', `导入${label}到${project.name}`); add.append(icon('plus'));
      add.addEventListener('click', () => importProject(project, kind).catch(report)); groupRow.append(groupButton, add); category.append(groupRow); children.append(category);
      if (categoryCollapsed.has(categoryKey)) continue;
      const assetList = document.createElement('ul'); assetList.className = 'tree-list'; category.append(assetList);
      for (const asset of assets) {
        const item = document.createElement('li'); const assetRow = document.createElement('div'); assetRow.className = `tree-row project-asset ${asset.exists ? '' : 'missing'}`;
        assetRow.style.setProperty('--depth', 2); assetRow.dataset.asset = asset.id; assetRow.dataset.kind = kind;assetRow.dataset.project=project.id;
        const pairedModel = kind === 'reference' ? asset.relatedModelIds?.[0] : kind === 'render' ? Object.keys(project.links).find(id => project.links[id] === asset.id) : asset.id;
        const linked = kind === 'model' ? !!project.links[asset.id] || !!asset.referenceIds?.length : !!pairedModel;
        const related = currentModel?.projectId === project.id && (kind === 'reference' ? project.models.find(m => m.id === currentModel.assetId)?.referenceIds?.includes(asset.id) : kind === 'model' && (project.references || []).find(r => r.id === currentModel.renderId)?.relatedModelIds?.includes(asset.id));
        assetRow.classList.toggle('related',!!related);
        assetRow.classList.toggle('selected', currentModel?.projectId === project.id && (kind === 'model' ? currentModel.assetId === asset.id : kind === 'reference' ? referenceImage?.renderId === asset.id && presentation !== 'structure' : currentModel.imageRole !== 'reference' && currentModel.renderId === asset.id));
        const assetButton = document.createElement('button'); assetButton.className = 'row-label'; assetButton.disabled = !asset.exists;
        assetButton.title = `${asset.name}\n${asset.exists ? (linked ? '已对应' : '待对应，点击链接图标指定') : '文件已移动或丢失'}`;
        if (kind === 'model' && asset.referenceIds?.length) assetButton.title += '\n参考：'+project.references.filter(r => asset.referenceIds.includes(r.id)).map(r => r.name).join('、');
        if (kind === 'reference' && asset.relatedModelIds?.length) assetButton.title += '\n对应模型：'+project.models.filter(m => asset.relatedModelIds.includes(m.id)).map(m => m.name).join('、');
        if (asset.stale) assetButton.title += '\n模型已经更新，这张旧成图需要重新渲染';
        const assetName = document.createElement('span'); assetName.className = 'row-name'; assetName.textContent = asset.name + (asset.stale ? '（旧成图）' : '');
        assetButton.append(icon(kind === 'model' ? 'cube' : 'image', 'node-icon'), assetName);
        assetButton.addEventListener('click', async () => { try { await projectAction(async () => {
          if (activeProject?.id !== project.id) await chooseProject(project, false);
          if (kind === 'model') await loadModel(await api.projectModel(project.id, asset.id)); else await showProjectRender(project, asset);
        }); } catch (error) { report(error); } });
        const pair = document.createElement('button'); pair.className = `pair-button ${linked ? 'paired' : 'pending'}`;
        pair.setAttribute('aria-label', `设置对应 ${asset.name}`); pair.title = linked ? '已对应，点击修改' : '尚未对应，点击指定'; pair.append(icon('link'));
        pair.addEventListener('click', () => openPairDialog(project, kind === 'model' ? asset.id : pairedModel, kind === 'reference' ? asset.id : null));
        assetRow.append(assetButton, pair); item.append(assetRow); assetList.append(item);
      }
    }
  }
  if (!projectList.length) { const hint = document.createElement('li'); hint.className = 'tree-message'; hint.textContent = '添加或打开项目，开始整理您的创意'; list.append(hint); }
  $('file-tree').replaceChildren(list);
  updateProjectControls();
  const paired = activeProject ? Object.keys(activeProject.links).length : 0;
  const pending = activeProject ? activeProject.models.length + activeProject.renders.length - paired * 2 : 0;
  $('project-summary').textContent = activeProject ? `${paired} 组已对应${pending ? ` · ${pending} 项待对应` : ''}` : '选择一个项目开始浏览';
}
async function importProject(project, kind = 'all', files = null) {
  return projectAction(async () => {
  status('正在导入项目文件');
  const result = files ? await api.dropProjectFiles(project.id, files) : await api.importProjectFiles(project.id, kind, currentModel?.projectId === project.id ? currentModel.assetId : null);
  if (!result) { status('已取消导入'); return; }
  const oldModels = new Set(project.models.map(item => item.id)), oldRenders = new Set((project.images || project.renders).map(item => item.id));
  updateProject(result); await chooseProject(result, false);
  const addedModel = result.models.find(item => item.exists && !oldModels.has(item.id));
  const addedRender = result.images.find(item => item.exists && !oldRenders.has(item.id));
  if (addedModel) await loadModel(await api.projectModel(result.id, addedModel.id));
  else if (addedRender) await showProjectRender(result, addedRender);
  else if (currentModel?.assetId && result.models.some(item => item.id === currentModel.assetId)) await loadModel(await api.projectModel(result.id, currentModel.assetId));
  else clearProjectView();
  status(`已导入 · ${Object.keys(result.links).length} 组已对应`);
  });
}
async function showProjectRender(project, render, expectedHash = null, preferredModelId = null) {
  if (!render) throw new Error('图片不在当前项目中');
  if (render.imageRole === 'reference') {
    const descriptor = await api.projectRender(project.id,render.id,expectedHash);
    const modelId = preferredModelId || (render.relatedModelIds || []).find(id=>id===currentModel?.assetId) || render.relatedModelIds?.at(-1);
    if (modelId && project.models.some(m=>m.id===modelId&&m.exists)) {
      const model=await api.projectModel(project.id,modelId);
      if(currentModel?.projectId!==project.id||currentModel.assetId!==modelId||currentModel.sha256!==model.sha256)await loadModel(model);
      else {currentModel.referenceImages=model.referenceImages;currentModel.referenceIds=model.referenceIds;configureReferences(model.referenceImages,render.id);}
    }
    else { clearProjectView();currentModel=descriptor;viewport.closest('.viewport-panel').dataset.screen='model';$('welcome-screen').hidden=true;$('empty-project').hidden=true;configureRender(descriptor); }
    showReference(descriptor);setPresentation('reference');renderProjects();document.dispatchEvent(new CustomEvent('workbench:model',{detail:descriptor}));return;
  }
  const modelId = Object.keys(project.links).find(id => project.links[id] === render.id && project.models.some(model => model.id === id && model.exists));
  if (modelId) {
    if (currentModel?.projectId !== project.id || currentModel.assetId !== modelId) await loadModel(await api.projectModel(project.id, modelId));
  } else {
    clearProjectView();
    currentModel = await api.projectRender(project.id, render.id, expectedHash);
    viewport.closest('.viewport-panel').dataset.screen = 'model'; $('welcome-screen').hidden = true;
    $('model-name').textContent = render.name; $('model-format').textContent = render.imageRole === 'reference' ? '参考' : '成图'; $('empty-project').hidden = true; configureRender(currentModel);
  }
  setPresentation('render'); renderProjects();
  document.dispatchEvent(new CustomEvent('workbench:model', { detail: currentModel }));
}
function openPairDialog(project, modelId, referenceId = null) {
  $('pair-dialog').dataset.project = project.id; $('pair-dialog-error').hidden = true;
  $('pair-dialog').dataset.reference = referenceId || '';
  $('pair-model').replaceChildren(...project.models.filter(item => item.exists).map(item => { const option = new Option(item.name, item.id); option.selected = item.id === modelId; return option; }));
  fillPairRenders(); $('pair-dialog').showModal();
}
function fillPairRenders() {
  const project = projectList.find(item => item.id === $('pair-dialog').dataset.project); const modelId = $('pair-model').value;
  const placeholder = new Option('暂不关联成图', '');
  const options = project.renders.filter(item => item.exists && !Object.entries(project.links).some(([model, render]) => model !== modelId && render === item.id)).map(item => new Option(item.name + (item.stale ? '（旧成图）' : ''), item.id));
  $('pair-render').replaceChildren(placeholder, ...options);
  $('pair-render').value = project.links[modelId] || '';
  const selected = project.models.find(m => m.id === modelId)?.referenceIds || [];
  $('pair-references').replaceChildren(...(project.references || []).filter(r => r.exists).map(r => { const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=r.id;input.checked=selected.includes(r.id)||r.id===$('pair-dialog').dataset.reference;label.append(input,document.createTextNode(r.name));return label; }));
  $('confirm-pair').disabled = !modelId;
}
$('pair-model').addEventListener('change', fillPairRenders);
$('close-pair-dialog').addEventListener('click', () => $('pair-dialog').close());
$('pair-form').addEventListener('submit', async event => {
  event.preventDefault(); $('confirm-pair').disabled = true;
  try { await projectAction(async () => { const modelId = $('pair-model').value; const project = await api.bindProjectFiles($('pair-dialog').dataset.project, modelId, $('pair-render').value || null, [...$('pair-references').querySelectorAll('input:checked')].map(i => i.value)); updateProject(project); $('pair-dialog').close(); await chooseProject(project, false); await loadModel(await api.projectModel(project.id, modelId)); }); }
  catch (error) { $('pair-dialog-error').textContent = error.message; $('pair-dialog-error').hidden = false; }
  finally { $('confirm-pair').disabled = false; }
});
$('add-project').addEventListener('click', () => { $('project-name').value = ''; $('project-parent').value = ''; $('project-dialog-error').hidden = true; $('project-dialog').showModal(); });
$('close-project-dialog').addEventListener('click', () => $('project-dialog').close());
$('choose-project-directory').addEventListener('click', async () => { try { const directory = await api.chooseProjectParent(); if (directory) $('project-parent').value = directory; } catch (error) { report(error); } });
$('project-form').addEventListener('submit', async event => {
  event.preventDefault(); $('confirm-project').disabled = true; $('project-dialog-error').hidden = true;
  try {
    if (!$('project-parent').value) throw new Error('请先选择项目保存位置');
    await projectAction(async () => { const project = await api.createProject($('project-name').value, $('project-parent').value);
    updateProject(project); $('project-dialog').close(); await chooseProject(project); });
  } catch (error) { $('project-dialog-error').textContent = error.message; $('project-dialog-error').hidden = false; }
  finally { $('confirm-project').disabled = false; }
});
document.querySelectorAll('button[data-presentation]').forEach(button => button.addEventListener('click', () => setPresentation(button.dataset.presentation)));
const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let pointerStart;
canvas.addEventListener('pointerdown', event => { if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY, moved: false }; });
canvas.addEventListener('pointermove', event => { if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) pointerStart.moved = true; });
canvas.addEventListener('pointerup', event => {
  if (projectBusyDepth) { pointerStart = null; return; }
  if (event.button !== 0 || !pointerStart) return;
  const dragged = pointerStart.moved || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5; pointerStart = null;
  if (dragged || !content) return;
  const bounds = canvas.getBoundingClientRect();
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(content, true).find(item => visibleInHierarchy(item.object));
  selectObject(hit?.object || null);
});
canvas.addEventListener('pointercancel', () => pointerStart = null);
canvas.addEventListener('dblclick', () => { if (selected) focus(selected); });
setupPointEditing({ canvas, image: $('final-render'), referenceImage: $('reference-render'), getImageModel: element => element.id === 'reference-render' ? referenceImage : currentModel, tree: $('structure-tree'), getNode: id => nodeById.get(id), getModel: () => currentModel, getProject: () => activeProject, getSelected: () => selected, select: selectObject, report,
  captureView(event) {
    const hidden = [], isolatedHidden = []; let index = 0;
    content?.traverse(node => { if (!node.visible) hidden.push(index); if (isolatedVisibility?.get(node) === false) isolatedHidden.push(index); index++; });
    const rect = canvas.getBoundingClientRect();
    const selectedPath = selected ? [] : null; for (let p = selected; p && p !== content && p !== stage; p = p.parent) selectedPath.unshift(p.parent.children.indexOf(p));
    return { presentation, modelId: currentModel?.assetId || null, modelHash: currentModel?.sha256 || null, imageZoom: {render:imageZoom.render.state(),reference:imageZoom.reference.state()}, viewMode, position: camera.position.toArray(), target: controls.target.toArray(), up: camera.up.toArray(), zoom: camera.zoom, near: camera.near, far: camera.far, minDistance: controls.minDistance, maxDistance: Number.isFinite(controls.maxDistance) ? controls.maxDistance : 1000, hidden, isolated: isIsolated, isolatedHidden, selectedPath, grid: grid.visible, anchor: { u: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), v: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) } };
  },
  async restoreView(target, view) {
    if (![view.position, view.target, view.up].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)) || ![view.near, view.far, view.minDistance, view.maxDistance].every(Number.isFinite)) throw new Error('这条意见的画面记录不完整，请重新定位。');
    const project = projectList.find(p => p.id === target.projectId);
    if (!project || activeProject?.id !== project.id) throw new Error('请先回到这条意见所属的项目。');
    if (target.assetId) {
      const descriptor = await api.projectModel(project.id, target.assetId);
      if (target.sourceHash && descriptor.sha256 !== target.sourceHash) throw new Error('原模型已发生变化，请重新定位这一处。');
      if (target.kind === 'image' && (descriptor.renderId !== target.renderId || target.renderHash && descriptor.renderSha256 !== target.renderHash)) throw new Error('原成图或配对已变化，请重新定位这一处。');
      if (currentModel?.assetId !== target.assetId || currentModel?.projectId !== project.id) await loadModel(descriptor);
      if (currentModel?.assetId !== target.assetId) throw new Error('原模型未能打开，请重试。');
    } else {
      const descriptor = await api.projectRender(project.id, target.renderId,target.renderHash);
      if (target.renderHash && descriptor.renderSha256 !== target.renderHash) throw new Error('原成图已发生变化，请重新定位这一处。');
      if(view.modelId&&view.modelHash){const old=await api.projectModel(project.id,view.modelId);if(old.sha256!==view.modelHash)throw new Error('意见记录中的结构模型已变化，请重新定位。');}
      await showProjectRender(project, project.images.find(r => r.id === target.renderId),target.renderHash,view.modelId);
    }
    if (activeProject?.id !== project.id) throw new Error('项目已切换，请重新选择意见。');
    let node = null;
    if (target.kind === 'object') {
      node = content;
      for (const step of target.object.hierarchy.slice(1)) node = node?.children[step.childIndex];
      if (!node || target.object.gltfNodeIndex !== undefined && sourceObjects.get(node.uuid)?.gltfNodeIndex !== target.object.gltfNodeIndex) throw new Error('原对象结构已变化，请重新定位这一处。');
    } else if (Array.isArray(view.selectedPath)) { node = content; for (const index of view.selectedPath) node = node?.children[index]; }
    const hidden = new Set(view.hidden || []), isolatedHidden = new Set(view.isolatedHidden || []); let index = 0;
    isolatedVisibility = view.isolated ? new Map() : null; isIsolated = !!view.isolated;
    content?.traverse(item => { item.visible = !hidden.has(index); if (isolatedVisibility) isolatedVisibility.set(item, !isolatedHidden.has(index)); index++; });
    let restoredMode=view.presentation || (target.kind === 'image' ? 'render' : 'structure');
    if(target.kind==='image'&&!target.assetId){const ref=project.references.some(r=>r.id===target.renderId);if(ref&&restoredMode==='render')restoredMode='reference';if(!ref&&restoredMode==='reference')restoredMode='render';}
    selectObject(node, true); setPresentation(restoredMode,false);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const damping = controls.enableDamping; controls.enableDamping = false; controls.update();
    controls.target.fromArray(view.target); camera.position.fromArray(view.position); camera.up.fromArray(view.up || [0, 1, 0]); camera.zoom = view.zoom || 1;
    camera.near = view.near; camera.far = view.far; controls.minDistance = view.minDistance; controls.maxDistance = view.maxDistance;
    camera.updateProjectionMatrix(); controls.update(); controls.enableDamping = damping;
    viewMode = view.viewMode || 'perspective'; setViewButtons(); grid.visible = !!view.grid; $('grid').classList.toggle('active', grid.visible); $('grid').setAttribute('aria-pressed', String(grid.visible)); updateShowAll();
    if (target.kind === 'image') {
      const isReference = project.references.some(r=>r.id===target.renderId),image = $(isReference?'reference-render':'final-render'); await image.decode();await new Promise(requestAnimationFrame);
      imageZoom.render.restore(view.imageZoom?.render);imageZoom.reference.restore(view.imageZoom?.reference);
      const b = image.getBoundingClientRect(), scale = Math.min(b.width / image.naturalWidth, b.height / image.naturalHeight);
      return { clientX: b.left + (b.width - image.naturalWidth * scale) / 2 + target.point.u * image.naturalWidth * scale, clientY: b.top + (b.height - image.naturalHeight * scale) / 2 + target.point.v * image.naturalHeight * scale };
    }
    const b = canvas.getBoundingClientRect(); return { clientX: b.left + (view.anchor?.u ?? .5) * b.width, clientY: b.top + (view.anchor?.v ?? .5) * b.height };
  },
  pick(event) {
    if (!content || projectBusyDepth) return null;
    const b = canvas.getBoundingClientRect(); pointer.set((event.clientX - b.left) / b.width * 2 - 1, -(event.clientY - b.top) / b.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera); return raycaster.intersectObject(content, true).find(hit => visibleInHierarchy(hit.object));
  },
  getObject(node) {
    const hierarchy = [];
    for (let p = node; p && p !== stage; p = p.parent) hierarchy.unshift({ name: sourceObjects.get(p.uuid)?.name || objectLabel(p), childIndex: p === content ? 0 : p.parent.children.indexOf(p), ...sourceObjects.get(p.uuid) });
    return { name: objectLabel(node), type: node.type, hierarchy, ...Object.fromEntries(Object.entries(sourceObjects.get(node.uuid) || {}).filter(([key]) => key !== 'name')) };
  }
});
$('clear-selection').addEventListener('click', () => selectObject(null));
$('fit').addEventListener('click', () => focus(content));
$('focus-selected').addEventListener('click', () => focus(selected));
$('isolate').addEventListener('click', isolate); $('show-all').addEventListener('click', showAll);
$('grid').addEventListener('click', () => workspaceLayout.update({showGrid:!grid.visible}));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { viewMode = button.dataset.view; if (viewMode === 'perspective') { camera.position.set(8, 6.2, 9); controls.target.set(0, 0, 0); } setViewButtons(); focus(content); }));
document.querySelectorAll('[data-window]').forEach(button => button.addEventListener('click', () => api.windowAction(button.dataset.window)));
$('open-folder').addEventListener('click', async () => { try { await projectAction(async () => { const project = await api.openProject(); if (project) { updateProject(project); await chooseProject(project); } }); } catch (error) { report(error); } });
$('go-home').addEventListener('click', () => { activeProject = null; clearProjectView(); $('open-file').replaceChildren(icon('plus'), document.createTextNode('打开模型')); renderProjects(); status('创意首页'); });
$('open-file').addEventListener('click', async () => { try { if (activeProject) { await importProject(activeProject); return; } const result = await api.openFile(); if (result) { await setRoot(result.root); await loadModel(result.model); } } catch (error) { report(error); } });
$('refresh').addEventListener('click', async () => { fileCache.clear(); try { if (activeProject) { await projectAction(async () => { const assetId = currentModel?.assetId, renderId = currentModel?.renderId; const project = await api.refreshProject(activeProject.id); updateProject(project); await chooseProject(project, false); if (assetId && project.models.some(item => item.id === assetId && item.exists)) await loadModel(await api.projectModel(project.id, assetId)); else if (renderId && project.images.some(r => r.id === renderId && r.exists)) await showProjectRender(project, project.images.find(r => r.id === renderId)); else clearProjectView(); }); } else { projectList = await api.listProjects(); renderProjects(); } status('项目与文件已刷新'); } catch (error) { report(error); } });
$('toast').querySelector('button').addEventListener('click', () => $('toast').hidden = true);
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') selectObject(null);
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); focus(selected || content); }
});
let dragDepth = 0;
document.addEventListener('dragenter', event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) { dragDepth++; $('drop-zone').hidden = false; } });
document.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', event => { event.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; $('drop-zone').hidden = true; } });
document.addEventListener('drop', async event => { event.preventDefault(); dragDepth = 0; $('drop-zone').hidden = true; const file = event.dataTransfer.files[0]; if (!file) return; try { if (activeProject) { await importProject(activeProject, 'all', event.dataTransfer.files); return; } const result = await api.dropFile(file); await setRoot(result.root); if (result.model) await loadModel(result.model); } catch (error) { report(error); } });
renderer.setAnimationLoop(() => { if (content && !['render','reference'].includes(presentation)) { controls.update(); composer.render(); } });
async function initialize() {
  try { const initial = await api.initial(); projectList = initial.projects || []; root = initial.root; activeProject = null; clearProjectView(); renderProjects(); status('创意首页'); }
  catch (error) { status('初始化失败'); report(error); console.error(error); }
}
window.workbenchModelContext = () => {
  if(!activeProject)return null;
  const selectedImage=presentation==='reference'?referenceImage:null,descriptor=selectedImage||currentModel;
  return {projectId:activeProject.id,assetId:descriptor?.projectId===activeProject.id?descriptor.assetId||null:null,renderId:descriptor?.projectId===activeProject.id?descriptor.renderId||null:null,renderHash:descriptor?.renderSha256||null,selectedStructure:selected?objectLabel(selected):null};
};
api.onCodexEvent(event => {
  if (!['model-updated', 'image-updated'].includes(event.type)) return;
  const currentContext=window.workbenchModelContext();
  const showResult = activeProject?.id === event.source.projectId && (currentContext?.assetId || null) === (event.source.assetId || null) && (event.source.assetId || (currentContext?.renderId || null) === (event.source.renderId || null));
  projectAction(async () => {
    updateProject(event.project);
    if (event.image) {
      if (showResult) await showProjectRender(event.project, event.project.images.find(r => r.id === event.image.renderId));
      else await renderFiles();
      notify(event.delivery?.mode === 'image_in_place' ? '当前图片已更新。' : '新图片已保存，可预览并继续添加修改意见。');
      return;
    }
    if (showResult) {
      if (event.delivery?.mode === 'render_only' && currentModel?.assetId === event.model.assetId && currentModel?.sha256 === event.model.sha256) {
        currentModel = event.model; configureRender(event.model, 'render'); renderProjects();
        document.dispatchEvent(new CustomEvent('workbench:model', { detail: event.model }));
      } else await loadModel(event.model);
      const array = [...nodeById.values()].find(node => node.userData.workbench_array);
      if (array) { selectObject(array); focus(content); }
    } else await renderFiles();
    notify(event.delivery?.mode === 'render_only' ? '当前版本的成图已保存并配对，模型版本保持不变。' : event.delivery?.mode === 'in_place' ? event.delivery.renderInvalidated ? '当前版本已更新，旧成图已解除配对，请重新渲染。' : '当前版本已更新，版本号保持不变。' : event.delivery?.renderIncluded ? `${event.model.name} 已保存，成图已对应。` : `${event.model.name} 已另存，此版本未附带新渲染。`);
  }).catch(report);
});
// Read-only QA snapshots expose no filesystem operations.
window.workbenchState = () => ({ screen: viewport.closest('.viewport-panel').dataset.screen, model: currentModel?.name, presentation, hasRender: !!currentModel?.renderUrl && currentModel.imageRole !== 'reference', hasReference: !!referenceImage, referenceId: referenceImage?.renderId || null, imageZoom: {render:imageZoom.render.state(),reference:imageZoom.reference.state()}, projectId: activeProject?.id || null, projectCount: projectList.length, selected: selected ? { uuid: selected.uuid, name: objectLabel(selected) } : null,
  outlineCount: outline.selectedObjects.length, gridVisible:grid.visible, axesVisible:axes.visible, sceneBackground:scene.background.getHexString(), camera: camera.position.toArray(), target: controls.target.toArray(), meshCount: content ? meshCount(content) : 0,
  objects: content ? [...nodeById.values()].filter(node => node.isMesh).map(node => {
    const box = new THREE.Box3().setFromObject(node); const position = box.getCenter(new THREE.Vector3()).project(camera); const bounds = canvas.getBoundingClientRect();
    return { uuid: node.uuid, name: objectLabel(node), visible: visibleInHierarchy(node), screen: { x: bounds.left + (position.x + 1) * bounds.width / 2, y: bounds.top + (1 - position.y) * bounds.height / 2 } };
  }) : [] });
const workspaceLayout=setupWorkspaceLayout({
  onPreferences(preferences,changed) {
    if (changed.includes('showGrid')) {grid.visible=preferences.showGrid;$('grid').classList.toggle('active',grid.visible);$('grid').setAttribute('aria-pressed',String(grid.visible));}
    if (changed.includes('showAxes')) axes.visible=preferences.showAxes;
    if (changed.includes('theme')) {
      document.querySelector('.brand-logo').src=`./branding/visualization-lab-logo-v1${preferences.theme==='dark'?'-dark':''}.svg`;
      applySceneTheme();
    }
  },
  getViewState:()=>({showGrid:grid.visible,showAxes:axes.visible}),
  onError:notify,
});
setupSidebarMenu({getProjects:()=>projectList,report,changed:async(result,target)=>{
  if(result.removedProject){projectList=projectList.filter(p=>p.id!==target.projectId);if(activeProject?.id===target.projectId){activeProject=null;clearProjectView();$('open-file').replaceChildren(icon('plus'),document.createTextNode('打开模型'));}renderProjects();status(result.detached?'项目已从列表移除，原文件保留':'项目已移入回收站');return;}
  const project=result.project||result;updateProject(project);
  if(activeProject?.id===project.id){
    if(currentModel?.assetId&&project.models.some(m=>m.id===currentModel.assetId&&m.exists)){
      const mode=presentation,zoom={render:imageZoom.render.state(),reference:imageZoom.reference.state()},previousRef=referenceImage?.renderId;
      currentModel=await api.projectModel(project.id,currentModel.assetId);configureRender(currentModel,mode);
      for(const [name,id] of [['render','final-render'],['reference','reference-render']]){const image=$(id),url=image.getAttribute('src');if(url&&(name==='render'||previousRef===referenceImage?.renderId)){const restore=()=>{if(image.getAttribute('src')===url)imageZoom[name].restore(zoom[name]);};image.addEventListener('load',restore,{once:true});if(image.complete)restore();}}
      document.dispatchEvent(new CustomEvent('workbench:model',{detail:presentation==='reference'?referenceImage:currentModel}));
    }else if(currentModel?.renderId&&project.images.some(r=>r.id===currentModel.renderId&&r.exists))await showProjectRender(project,project.images.find(r=>r.id===currentModel.renderId));
    else clearProjectView();
  }
  renderProjects();status(target.operation==='rename'?'名称已更新':result.detached?'条目已从项目移除，原文件保留':'文件已移入回收站');
}});
startStartup();
initialize();
