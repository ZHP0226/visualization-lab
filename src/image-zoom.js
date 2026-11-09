export function setupImageZoom(image, resetButton) {
  const wrap=image.parentElement;let scale=1,x=0,y=0,drag=null;
  image.tabIndex=0;image.style.transformOrigin='0 0';image.style.touchAction='none';
  function apply(){
    const w=wrap.clientWidth,h=wrap.clientHeight;
    if(w&&h){x=Math.max(w*(1-scale),Math.min(0,x));y=Math.max(h*(1-scale),Math.min(0,y));}
    image.style.transform=`translate(${x}px,${y}px) scale(${scale})`;image.style.cursor=scale>1?(drag?'grabbing':'grab'):'default';
    image.dataset.zoom=String(scale);resetButton.disabled=scale===1;
    image.dispatchEvent(new Event('workbench:image-zoom'));
  }
  function zoom(next,px=wrap.clientWidth/2,py=wrap.clientHeight/2){next=Math.max(1,Math.min(10,next));const factor=next/scale;x=px-(px-x)*factor;y=py-(py-y)*factor;scale=next;apply();}
  function reset(){scale=1;x=y=0;drag=null;apply();}
  image.addEventListener('wheel',event=>{event.preventDefault();const b=wrap.getBoundingClientRect();zoom(scale*Math.exp(-Math.max(-400,Math.min(400,event.deltaY))*.002),event.clientX-b.left,event.clientY-b.top);},{passive:false});
  image.addEventListener('pointerdown',event=>{if(event.button!==0||scale===1)return;event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY};image.setPointerCapture(event.pointerId);apply();});
  image.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;x+=event.clientX-drag.x;y+=event.clientY-drag.y;drag.x=event.clientX;drag.y=event.clientY;apply();});
  const end=event=>{if(drag?.id===event.pointerId){drag=null;apply();}};
  image.addEventListener('pointerup',end);image.addEventListener('pointercancel',end);image.addEventListener('dblclick',reset);image.addEventListener('load',reset);resetButton.addEventListener('click',reset);
  image.addEventListener('keydown',event=>{if(['+','=','-','0'].includes(event.key)){event.preventDefault();event.key==='0'?reset():zoom(scale*(event.key==='-'?1/1.25:1.25));}});
  new ResizeObserver(apply).observe(wrap);reset();
  return {reset,state:()=>({scale,x:wrap.clientWidth?x/wrap.clientWidth:0,y:wrap.clientHeight?y/wrap.clientHeight:0}),restore(value){if(value&&[value.scale,value.x,value.y].every(Number.isFinite)){scale=Math.max(1,Math.min(10,value.scale));x=value.x*wrap.clientWidth;y=value.y*wrap.clientHeight;apply();}}};
}
