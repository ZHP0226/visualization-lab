import {BrandParticles} from './startup/particles.js';
import {TIMING} from './startup/timing.js';
import {createStartupRasters} from './startup/rasters.js';

const smooth=(a,b,t)=>{const q=Math.max(0,Math.min(1,(t-a)/(b-a)));return q*q*(3-2*q);};
export function startStartup() {
  const root=document.documentElement,shell=document.getElementById('workbench-shell'),overlay=document.getElementById('startup-overlay');
  const dark=root.dataset.theme==='dark',motion=matchMedia('(prefers-reduced-motion: reduce)');
  let particles=null,time=0,started=0,endTimer=0,raf=0,ended=false,reason='',phase='loading',frames=0;
  const state=()=>({time,phase,theme:dark?'dark':'light',ended,reason,frames,particleCount:particles?.count||0,duration:TIMING.duration,disposed:ended&&!particles});
  window.workbenchStartup=state;
  const setActive=active=>window.workbench.setStartupActive(active).catch(error=>console.warn('Startup scheduling:',error.message));
  setActive(true);
  function finish(why) {
    if(ended)return;ended=true;reason=why;phase='finished';
    if(why==='completed')time=TIMING.duration;
    cancelAnimationFrame(raf);clearTimeout(endTimer);clearTimeout(window.__startupFallback);
    document.removeEventListener('keydown',escape,true);motion.removeEventListener('change',reduce);
    overlay.removeEventListener('webglcontextlost',lost,true);
    document.removeEventListener('workbench:startup-timeout',timeout);
    root.classList.remove('startup-active');root.dataset.startupState='finished';root.style.removeProperty('--startup-reveal');shell.inert=false;
    if(overlay.contains(document.activeElement))document.activeElement.blur();
    overlay.remove();particles?.dispose();particles=null;
    setActive(false);
    document.dispatchEvent(new CustomEvent('workbench:startup-finished',{detail:{reason:why,theme:dark?'dark':'light'}}));
  }
  function escape(event){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish('skipped');}}
  function reduce(event){if(event.matches)finish('reduced-motion');}
  function lost(event){event.preventDefault();finish('context-lost');}
  function timeout(){finish('load-timeout');}
  function tick(now){
    if(ended)return;
    time=Math.min(TIMING.duration,(now-started)/1000);
    try {if(time<TIMING.dustEnd)particles.render(time);else if(phase!=='clear'&&phase!=='reveal')particles.render(TIMING.dustEnd);}
    catch(error){console.warn('Startup animation stopped:',error.message);finish('render-error');return;}
    frames++;phase=time>=TIMING.whiteEnd?'reveal':time>=TIMING.dustEnd?'clear':time>=TIMING.dustStart?'dissolving':time>=3.08?'brand':time>=2.05?'typography':'assembling';
    overlay.dataset.phase=phase;root.style.setProperty('--startup-reveal',String(smooth(TIMING.whiteEnd,TIMING.homeEnd,time)));
    if(time>=TIMING.duration){finish('completed');return;}raf=requestAnimationFrame(tick);
  }
  document.addEventListener('keydown',escape,true);motion.addEventListener('change',reduce);
  overlay.addEventListener('webglcontextlost',lost,true);
  document.addEventListener('workbench:startup-timeout',timeout);
  if(document.body.classList.contains('reduce-interface-motion')||motion.matches){finish('reduced-motion');return;}
  async function prepare(){
    const rasters=await createStartupRasters(dark);
    if(ended||!root.classList.contains('startup-active'))return;
    particles=new BrandParticles(rasters,{dark});
    overlay.prepend(particles.renderer.domElement);particles.renderer.domElement.setAttribute('aria-hidden','true');
    particles.render(0);clearTimeout(window.__startupFallback);root.dataset.startupState='playing';phase='assembling';
    started=performance.now();endTimer=setTimeout(()=>finish('completed'),TIMING.duration*1000);raf=requestAnimationFrame(tick);
  }
  prepare().catch(error=>{console.warn('Startup animation unavailable:',error.message);finish('load-error');});
}
