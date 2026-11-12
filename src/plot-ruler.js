const NS='http://www.w3.org/2000/svg';
const element=(tag,attributes={})=>{const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;};
const label=value=>Number(value.toFixed(1)).toString();
export function setupPlotRuler(paper){
 const frame=document.createElement('div');frame.className='plot-sheet-frame';paper.before(frame);frame.append(paper);
 const grid=element('svg',{'class':'plot-size-grid','aria-hidden':'true'}),top=element('svg',{'class':'plot-ruler plot-ruler-top','aria-label':'水平毫米刻度尺'}),left=element('svg',{'class':'plot-ruler plot-ruler-left','aria-label':'垂直毫米刻度尺'}),corner=document.createElement('span');corner.className='plot-ruler-unit';corner.textContent='mm';frame.append(grid,top,left,corner);
 let size=[50,50],visible=true;try{visible=localStorage.getItem('vl.plot.ruler')!=='off';}catch{}
 function ticks(svg,length,pixels,vertical){
  svg.replaceChildren();svg.setAttribute('viewBox',vertical?`0 0 27 ${pixels}`:`0 0 ${pixels} 22`);
  const scale=pixels/length,step=scale>=2?1:5,numberStep=scale>=2?10:20;
  for(let mm=0;mm<=length+.0001;mm+=step){const at=mm*scale,major=mm%numberStep===0,medium=mm%5===0,extent=major?7:medium?5:3;
   svg.append(element('line',vertical?{x1:27-extent,x2:27,y1:at,y2:at}:{x1:at,x2:at,y1:22-extent,y2:22}));
   if((major&&pixels-at>23)||mm===0){const text=element('text',vertical?{x:17,y:Math.max(9,at+3),'text-anchor':'end'}:{x:mm===0?2:at,y:11,'text-anchor':mm===0?'start':'middle'});text.textContent=label(mm);svg.append(text);}
  }
  const end=element('text',vertical?{x:17,y:pixels-3,'text-anchor':'end'}:{x:pixels-2,y:11,'text-anchor':'end'});end.textContent=label(length);svg.append(end);
 }
 function draw(){
  const rect=paper.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const [w,h]=size;frame.style.setProperty('--plot-aspect',String(w/h));grid.setAttribute('viewBox',`0 0 ${w} ${h}`);grid.replaceChildren();
  for(const vertical of [true,false]){const length=vertical?w:h;for(let mm=5;mm<length;mm+=5)grid.append(element('line',{...vertical?{x1:mm,x2:mm,y1:0,y2:h}:{x1:0,x2:w,y1:mm,y2:mm},'class':mm%10===0?'major':'minor','vector-effect':'non-scaling-stroke'}));}
  ticks(top,w,rect.width,false);ticks(left,h,rect.height,true);
  frame.dataset.sizeMm=size.join(',');frame.title=`图件尺寸 ${label(w)} × ${label(h)} mm；网格每格5 mm，标尺按导出尺寸标注`;
 }
 function show(value){visible=value;frame.dataset.rulers=String(value);try{localStorage.setItem('vl.plot.ruler',value?'on':'off');}catch{}return value;}
 new ResizeObserver(draw).observe(paper);show(visible);
 return {setSize(value){if(Array.isArray(value)&&value.length===2&&value.every(v=>Number.isFinite(v)&&v>0))size=value.slice();frame.style.setProperty('--plot-aspect',String(size[0]/size[1]));draw();},toggle(){return show(!visible);},visible:()=>visible};
}
