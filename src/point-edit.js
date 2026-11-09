import { imagePoint } from '../electron/point-edit-data.cjs';
import { saveNote, notesError } from './edit-notes.js';

export function setupPointEditing({ canvas, image, referenceImage, getImageModel, tree, getNode, getModel, getProject, getSelected, select, pick, getObject, captureView, restoreView, report }) {
  const dialog = document.getElementById('point-edit-dialog'), input = document.getElementById('point-edit-input');
  const error = document.getElementById('point-edit-error'),markers=[document.getElementById('point-edit-marker'),document.getElementById('reference-point-marker')].filter(Boolean);
  let activeImage=image,marker=markers[0];
  let target = null, position = null;
  let editing = null, view = null, saving = false, restoreTicket = 0;
  let rightDown = null;
  canvas.addEventListener('pointerdown', event => { if (event.button === 2) rightDown = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointercancel', () => { rightDown = null; });
  const clear = () => { if (dialog.open) dialog.close(); target = position = null; markers.forEach(m=>m.hidden=true); };
  canvas.title = '点击选择部件，右击描述局部修改；拖动旋转，右键拖动平移';
  for(const element of [image,referenceImage].filter(Boolean)){element.title='滚轮缩放 · 放大后拖动 · 双击或按0适配 · 右击添加修改意见';element.addEventListener('workbench:image-zoom',()=>{if(activeImage===element)placeMarker();});}
  function placeMarker() {
    if (!position) return;
    const rect = activeImage.getBoundingClientRect(), wrap = activeImage.parentElement.getBoundingClientRect();
    const scale = Math.min(rect.width / activeImage.naturalWidth, rect.height / activeImage.naturalHeight);
    marker.style.left = `${rect.left - wrap.left + (rect.width - activeImage.naturalWidth * scale) / 2 + position.u * activeImage.naturalWidth * scale}px`;
    marker.style.top = `${rect.top - wrap.top + (rect.height - activeImage.naturalHeight * scale) / 2 + position.v * activeImage.naturalHeight * scale}px`;
  }
  function open(event, value, note = null) {
    target = value; editing = note; view = note?.view || captureView(event); input.value = note?.request || ''; error.textContent = '';
    document.getElementById('point-edit-target').textContent = value.kind === 'object' ? `模型 · ${value.object.name} · ${value.fileName}` : `图片 · ${value.fileName}`;
    dialog.showModal();
    // Opening motion scales the visual bounds; clamp using the final layout size.
    const rect = { width: dialog.offsetWidth, height: dialog.offsetHeight };
    dialog.style.left = `${Math.max(12, Math.min(event.clientX + 10, innerWidth - rect.width - 12))}px`;
    dialog.style.top = `${Math.max(12, Math.min(event.clientY + 10, innerHeight - rect.height - 12))}px`;
    input.focus();
  }
  function objectMenu(event, node) {
    const model = getModel(), project = getProject();
    if (!node || !model || !canvas.dataset.loaded) return;
    if (!project || model.projectId !== project.id || !model.assetId) return report(new Error('请先将模型加入项目，再添加局部修改指令。'));
    select(node); marker.hidden = true; position = null;
    const object = getObject(node);
    open(event, { version: 1, kind: 'object', projectId: project.id, assetId: model.assetId, fileName: model.name, sourceHash: model.sha256, object });
  }
  tree.addEventListener('contextmenu', event => {
    const row = event.target.closest('[data-node]'); if (!row) return;
    event.preventDefault(); objectMenu(event, getNode(row.dataset.node));
  });
  canvas.addEventListener('contextmenu', event => {
    event.preventDefault();
    const dragged = rightDown && Math.hypot(event.clientX - rightDown.x, event.clientY - rightDown.y) > 5; rightDown = null;
    if (dragged) return;
    // Respect a tree-selected group if the hit belongs to it; otherwise select the hit.
    const hit = pick(event), selected = getSelected();
    let node = hit?.object || selected;
    if (selected && node) for (let p = node; p; p = p.parent) if (p === selected) { node = selected; break; }
    objectMenu(event, node);
  });
  for (const element of [image,referenceImage].filter(Boolean)) element.addEventListener('contextmenu', event => {
    event.preventDefault();
    const model = getImageModel ? getImageModel(element) : getModel(), project = getProject();
    if (!model?.renderUrl || !element.complete) return;
    activeImage=element;markers.forEach(m=>m.hidden=true);marker=element===referenceImage?markers[1]:markers[0];
    const point = imagePoint(element.getBoundingClientRect(), element.naturalWidth, element.naturalHeight, event.clientX, event.clientY);
    if (!point) return; // Ignore object-fit letterboxing.
    if (!project || model.projectId !== project.id) return report(new Error('请先将成图加入项目，再添加局部修改指令。'));
    position = point; marker.hidden = false; placeMarker();
    const render = (project.images || project.renders).find(r => r.id === model.renderId);
    open(event, { version: 1, kind: 'image', projectId: project.id, assetId: model.assetId || null, renderId: model.renderId, fileName: render?.name || model.name, sourceHash: model.sha256, renderHash: model.renderSha256, point });
  });
  document.getElementById('point-edit-form').addEventListener('submit', async event => {
    event.preventDefault(); if (saving) return;
    if (!target || !input.value.trim()) { error.textContent = '请描述这一处要怎样修改。'; input.focus(); return; }
    saving = true; const submit = dialog.querySelector('[type=submit]'); submit.disabled = true;
    try {
      await saveNote({ ...(editing ? { id: editing.id, rev: editing.rev } : {}), target, request: input.value, view });
      dialog.close(); document.getElementById('chat-input').focus();
      document.getElementById('chat-announcement').textContent = '修改意见已保存，点击发送可统一提交。';
    } catch (e) { error.textContent = e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
    finally { saving = false; submit.disabled = false; }
  });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); document.getElementById('point-edit-form').requestSubmit(); } });
  document.getElementById('point-edit-cancel').addEventListener('click', () => { if (!saving) clear(); });
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); else clear(); });
  document.addEventListener('workbench:model', () => { if (dialog.open && input.value.trim() && target?.projectId === getProject()?.id) { position = null; marker.hidden = true; } else clear(); });
  document.addEventListener('workbench:edit-note', async event => {
    const own = ++restoreTicket, note = event.detail; notesError(null);
    try {
      const anchor = await restoreView(note.target, note.view);
      if (own !== restoreTicket) return;
      activeImage=referenceImage&&getImageModel?.(referenceImage)?.renderId===note.target.renderId?referenceImage:image;
      markers.forEach(m=>m.hidden=true);marker=activeImage===referenceImage?markers[1]:markers[0];
      position = note.target.kind === 'image' ? note.target.point : null; marker.hidden = !position; placeMarker();
      open(anchor, note.target, note);
    } catch (e) { if (own === restoreTicket) notesError(e); }
  });
  document.querySelectorAll('[data-presentation]').forEach(b => b.addEventListener('click', clear));
  const observer=new ResizeObserver(placeMarker);for(const element of [image,referenceImage].filter(Boolean))observer.observe(element.parentElement);
}
