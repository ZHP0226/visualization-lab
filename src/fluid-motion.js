const ease='cubic-bezier(.2,.85,.25,1)';
export const reducedMotion=()=>document.body.classList.contains('reduce-interface-motion')||matchMedia('(prefers-reduced-motion:reduce)').matches;
let anchor=null;
const rest={transform:'translate(0px,0px) scale(1,1)',opacity:1,filter:'blur(0px)'};
function origin(element){const r=element.getBoundingClientRect(),a=anchor||{left:innerWidth/2,top:innerHeight/2,width:1,height:1};return `translate(${a.left+a.width/2-r.left-r.width/2}px,${a.top+a.height/2-r.top-r.height/2}px) scale(${Math.max(.06,Math.min(.4,a.width/r.width))},${Math.max(.025,Math.min(.3,a.height/r.height))})`;}
export function animateSurface(element,{closing=false,from=null}={}){
  if(reducedMotion())return null;
  const small={transform:origin(element),opacity:0,filter:'blur(6px)'};
  return element.animate(closing?[from||rest,small]:[from||small,rest],{duration:closing?190:430,easing:ease});
}
export function setupFluidMotion(){
  document.addEventListener('pointerdown',event=>{const control=event.target.closest('button,summary,select');anchor=control?control.getBoundingClientRect().toJSON():{left:event.clientX-8,top:event.clientY-8,width:16,height:16};},true);
  document.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&document.activeElement instanceof HTMLElement)anchor=document.activeElement.getBoundingClientRect().toJSON();},true);
  const attached=new WeakSet();
  function dialogMotion(dialog){
    const show=dialog.showModal.bind(dialog),close=dialog.close.bind(dialog);let animation=null,token=0,closing=false;
    const current=()=>{const style=getComputedStyle(dialog);return {transform:style.transform,opacity:style.opacity,filter:style.filter};};
    dialog.showModal=()=>{const from=dialog.open&&closing?current():null;token++;animation?.cancel();closing=false;if(!dialog.open)show();dialog.dataset.motionState='opening';animation=animateSurface(dialog,{from});const id=token;const done=()=>{if(token===id){delete dialog.dataset.motionState;animation=null;}};if(animation)animation.finished.then(done,done);else done();};
    dialog.close=value=>{if(!dialog.open||closing)return;const from=current();closing=true;const id=++token;animation?.cancel();dialog.dataset.motionState='closing';animation=animateSurface(dialog,{closing:true,from});const done=()=>{if(token!==id)return;closing=false;delete dialog.dataset.motionState;animation=null;close(value);};if(animation)animation.finished.then(done,done);else done();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
    if(dialog.id==='point-edit-dialog')dialog.addEventListener('close',()=>document.getElementById('chat-input').focus());
  }
  function detailsMotion(details){
    const descriptor=Object.getOwnPropertyDescriptor(HTMLDetailsElement.prototype,'open'),summary=details.querySelector(':scope>summary'),panel=[...details.children].find(el=>el!==summary);if(!summary||!panel)return;
    let wanted=descriptor.get.call(details),animation=null,token=0;
    Object.defineProperty(details,'open',{get:()=>wanted,set(value){value=!!value;if(wanted===value)return;const before=getComputedStyle(panel),from=descriptor.get.call(details)?{opacity:before.opacity,transform:before.transform}:null;wanted=value;const id=++token;animation?.cancel();summary.setAttribute('aria-expanded',String(value));panel.classList.toggle('fluid-closing',!value);
      panel.inert=!value;if(value)descriptor.set.call(details,true);
      const finish=()=>{if(id!==token)return;if(!wanted)descriptor.set.call(details,false);panel.classList.remove('fluid-closing');animation=null;};
      if(reducedMotion()){finish();return;}
      const collapsed={opacity:0,transform:'translateY(8px) scale(.94,.86)'},expanded={opacity:1,transform:'translateY(0px) scale(1,1)'};
      animation=panel.animate(value?[from||collapsed,expanded]:[from||expanded,collapsed],{duration:value?300:170,easing:ease});animation.finished.then(finish,finish);
    }});
    summary.addEventListener('click',event=>{event.preventDefault();details.open=!wanted;});
  }
  function attach(element){if(attached.has(element))return;attached.add(element);if(element.matches('dialog'))dialogMotion(element);else detailsMotion(element);}
  document.querySelectorAll('dialog,details').forEach(attach);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('dialog,details'))attach(node);node.querySelectorAll('dialog,details').forEach(attach);}}).observe(document.body,{childList:true,subtree:true});
  const stop=()=>{if(reducedMotion())document.getAnimations().forEach(animation=>animation.cancel());};new MutationObserver(stop).observe(document.body,{attributes:true,attributeFilter:['class']});matchMedia('(prefers-reduced-motion:reduce)').addEventListener('change',stop);
}
const treeAnimations=new WeakMap();
export function animateTreeDisclosure(container,selector,mutate){
  const beforeRow=container.querySelector(selector),beforeList=beforeRow?.parentElement.querySelector(':scope>.tree-list'),height=beforeList?.getBoundingClientRect().height||0,ghost=beforeList?.cloneNode(true),beforeIcon=beforeRow?.querySelector('.tree-toggle svg,.chevron'),rotation=beforeIcon?getComputedStyle(beforeIcon).transform:'none';
  let states=treeAnimations.get(container);if(!states){states=new Map();treeAnimations.set(container,states);}const old=states.get(selector);states.delete(selector);old?.cancel();if(old)container.style.overflowAnchor=old.originalAnchor;
  mutate();if(reducedMotion())return;
  const row=container.querySelector(selector);if(!row)return;const icon=row.querySelector('.tree-toggle svg,.chevron');if(icon)icon.animate([{transform:rotation},{transform:getComputedStyle(icon).transform}],{duration:260,easing:ease});let list=row.parentElement.querySelector(':scope>.tree-list'),closing=!list;
  if(closing){if(!ghost||!height)return;list=ghost;list.inert=true;list.setAttribute('aria-hidden','true');list.dataset.exiting='true';list.querySelectorAll('[data-asset],[data-node],[data-project],[data-group]').forEach(el=>{for(const key of ['asset','node','project','group'])delete el.dataset[key];});row.parentElement.append(list);}
  const finalHeight=closing?0:list.getBoundingClientRect().height;list.style.overflow='hidden';list.style.height=`${height}px`;const oldAnchor=container.style.overflowAnchor;container.style.overflowAnchor='none';
  const animation=list.animate([{height:`${height}px`,opacity:closing?1:.65},{height:`${finalHeight}px`,opacity:closing?0:1}],{duration:closing?220:320,easing:ease});animation.originalAnchor=oldAnchor;states.set(selector,animation);
  const done=()=>{if(states.get(selector)!==animation)return;states.delete(selector);container.style.overflowAnchor=oldAnchor;if(closing)list.remove();else{list.style.removeProperty('height');list.style.removeProperty('overflow');}};animation.finished.then(done,done);
}
