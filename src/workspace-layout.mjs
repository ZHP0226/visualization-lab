export const DEFAULT_UI_PREFERENCES = Object.freeze({
  layout: Object.freeze({left:240, right:256, chat:336}),
  glassRefraction:true, motion:'system', showGrid:true, showAxes:false, fontScale:100, theme:'light',
});
export const UI_PREFERENCES_KEY = 'visualization-lab.ui-preferences.v1';
const ranges = {left:[180,420], right:[200,420], chat:[280,640]};
const clamp = (value,min,max) => Math.round(Math.max(min,Math.min(max,value)));
const record = value => value && typeof value==='object' && !Array.isArray(value) ? value : {};
export function normalizeUIPreferences(input) {
  const value=record(input), layout=record(value.layout), normalized={...DEFAULT_UI_PREFERENCES,layout:{}};
  for (const key of Object.keys(ranges)) normalized.layout[key]=typeof layout[key]==='number' && Number.isFinite(layout[key]) ? clamp(layout[key],...ranges[key]) : DEFAULT_UI_PREFERENCES.layout[key];
  for (const key of ['glassRefraction','showGrid','showAxes']) if (typeof value[key]==='boolean') normalized[key]=value[key];
  if (value.motion==='reduced') normalized.motion='reduced';
  if (typeof value.fontScale==='number' && Number.isFinite(value.fontScale)) normalized.fontScale=clamp(value.fontScale,80,140);
  if (value.theme==='dark') normalized.theme='dark';
  return normalized;
}
export function fitWorkspaceLayout(layout, width, height) {
  const result=normalizeUIPreferences({layout}).layout, available=width-24-360;
  if (result.left+result.right>available) {
    const extra=result.left-180+result.right-200;
    const fraction=extra>0 ? Math.max(0,available-380)/extra : 0;
    result.left=180+Math.floor((result.left-180)*fraction);
    result.right=200+Math.floor((result.right-200)*fraction);
  }
  result.chat=clamp(result.chat,280,Math.min(640,Math.max(280,height-12-170)));
  return result;
}

export function setupWorkspaceLayout({onPreferences=()=>{},getViewState=()=>({}),onError=()=>{}}={}) {
  const workspace=document.querySelector('.workspace'), centre=document.querySelector('.center-column');
  const dialog=document.getElementById('settings-dialog'), message=document.getElementById('settings-save-status');
  let preferences;
  try {preferences=normalizeUIPreferences(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)));}
  catch {preferences=normalizeUIPreferences(null);}
  let effective, drag=null, frame=0;
  const handles=[...document.querySelectorAll('[data-resize-panel]')];
  function dimensions() {
    const style=getComputedStyle(workspace);
    return {width:workspace.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height:centre.clientHeight};
  }
  function bounds(key) {
    const size=dimensions();
    return key==='left' ? [180,Math.min(420,size.width-24-360-effective.right)]
      : key==='right' ? [200,Math.min(420,size.width-24-360-effective.left)]
      : [280,Math.min(640,Math.max(280,size.height-12-170))];
  }
  function apply() {
    const size=dimensions();effective=fitWorkspaceLayout(preferences.layout,size.width,size.height);
    workspace.style.setProperty('--project-width',`${effective.left}px`);
    workspace.style.setProperty('--structure-width',`${effective.right}px`);
    centre.style.setProperty('--chat-height',`${effective.chat}px`);
    document.body.classList.toggle('without-refraction',!preferences.glassRefraction);
    document.body.classList.toggle('reduce-interface-motion',preferences.motion==='reduced');
    document.documentElement.dataset.theme=preferences.theme;
    document.documentElement.style.setProperty('--ui-font-scale',String(preferences.fontScale/100));
    const fontSize=document.getElementById('settings-font-size');fontSize.value=String(preferences.fontScale);
    fontSize.setAttribute('aria-valuetext',`${preferences.fontScale}%${preferences.fontScale===100?'，默认大小':''}`);
    document.getElementById('settings-font-value').value=`${preferences.fontScale}%`;
    for (const handle of handles) {
      const key=handle.dataset.resizePanel,[min,max]=bounds(key);
      handle.setAttribute('aria-valuemin',String(min));handle.setAttribute('aria-valuemax',String(max));
      handle.setAttribute('aria-valuenow',String(effective[key]));handle.setAttribute('aria-valuetext',`${effective[key]} 像素`);
    }
    document.getElementById('settings-layout-summary').textContent=`项目栏 ${effective.left}px · 结构栏 ${effective.right}px · 对话区 ${effective.chat}px`;
  }
  function save() {
    try {localStorage.setItem(UI_PREFERENCES_KEY,JSON.stringify(preferences));message.textContent='已保存到本机';document.getElementById('settings-error').textContent='';}
    catch {const text='无法保存界面偏好，本次调整仅在当前窗口有效';document.getElementById('settings-error').textContent=text;message.textContent='尚未保存';onError(text);}
  }
  function update(patch) {
    preferences=normalizeUIPreferences({...preferences,...patch,layout:{...preferences.layout,...record(patch.layout)}});
    apply();onPreferences(preferences,Object.keys(patch));save();
  }
  function finishDrag() {
    if (!drag) return;
    const previous=drag;drag=null;document.body.classList.remove('resizing-layout');
    if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id);
    save();
  }
  for (const handle of handles) {
    const key=handle.dataset.resizePanel;
    handle.addEventListener('pointerdown',event=>{
      if (event.button!==0) return;
      event.preventDefault();handle.focus();preferences.layout={...effective};
      drag={handle,id:event.pointerId,key,start:key==='chat'?event.clientY:event.clientX,value:effective[key]};
      document.body.classList.add('resizing-layout');document.body.style.setProperty('--resize-cursor',key==='chat'?'row-resize':'col-resize');handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event=>{
      if (!drag || drag.handle!==handle) return;
      const movement=(key==='chat'?event.clientY:event.clientX)-drag.start;
      preferences.layout[key]=clamp(drag.value+(key==='left'?movement:-movement),...bounds(key));apply();
    });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) handle.addEventListener(event,finishDrag);
    handle.addEventListener('dblclick',()=>update({layout:{[key]:DEFAULT_UI_PREFERENCES.layout[key]}}));
    handle.addEventListener('keydown',event=>{
      const valid=key==='chat'?['ArrowUp','ArrowDown','Home','End']:['ArrowLeft','ArrowRight','Home','End'];
      if (!valid.includes(event.key)) return;
      event.preventDefault();event.stopPropagation();preferences.layout={...effective};
      const [min,max]=bounds(key),step=event.shiftKey?40:10;
      let next=event.key==='Home'?min:event.key==='End'?max:effective[key];
      if (event.key.startsWith('Arrow')) {const towardEnd=event.key==='ArrowRight'||event.key==='ArrowDown';next+=step*(key==='left'?(towardEnd?1:-1):(towardEnd?-1:1));}
      update({layout:{[key]:clamp(next,min,max)}});
    });
  }
  window.addEventListener('blur',finishDrag);
  new ResizeObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;apply();});}).observe(workspace);
  function syncDialog() {
    const view=getViewState();
    document.getElementById('settings-refraction').checked=preferences.glassRefraction;
    document.getElementById('settings-motion').value=preferences.motion;
    document.getElementById('settings-theme').value=preferences.theme;
    document.getElementById('settings-grid').checked=view.showGrid ?? preferences.showGrid;
    document.getElementById('settings-axes').checked=view.showAxes ?? preferences.showAxes;
  }
  document.getElementById('open-settings').addEventListener('click',()=>{syncDialog();if(!dialog.open)dialog.showModal();});
  document.getElementById('close-settings').addEventListener('click',()=>dialog.close());
  document.getElementById('reset-workspace-layout').addEventListener('click',()=>update({layout:{...DEFAULT_UI_PREFERENCES.layout}}));
  document.getElementById('settings-refraction').addEventListener('change',event=>update({glassRefraction:event.target.checked}));
  document.getElementById('settings-motion').addEventListener('change',event=>update({motion:event.target.value}));
  document.getElementById('settings-font-size').addEventListener('input',event=>update({fontScale:Number(event.target.value)}));
  document.getElementById('reset-font-size').addEventListener('click',()=>update({fontScale:100}));
  document.getElementById('settings-theme').addEventListener('change',event=>update({theme:event.target.value}));
  document.getElementById('settings-grid').addEventListener('change',event=>update({showGrid:event.target.checked}));
  document.getElementById('settings-axes').addEventListener('change',event=>update({showAxes:event.target.checked}));
  apply();onPreferences(preferences,Object.keys(preferences));
  return {update};
}
