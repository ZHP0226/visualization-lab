import {normalizeUIPreferences,UI_PREFERENCES_KEY} from './workspace-layout.mjs';
let preferences;
try {preferences=normalizeUIPreferences(JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY)));}
catch {preferences=normalizeUIPreferences(null);}
const root=document.documentElement;
root.dataset.theme=preferences.theme;
root.style.setProperty('--ui-font-scale',String(preferences.fontScale/100));
root.classList.add('startup-active');
root.dataset.startupState='loading';
// Independent escape hatch also covers a missing renderer bundle or failed font/GPU setup.
window.__startupFallback=setTimeout(()=>{
  root.classList.remove('startup-active');root.dataset.startupState='fallback';
  const shell=document.getElementById('workbench-shell');if(shell)shell.inert=false;
  document.getElementById('startup-overlay')?.remove();
  window.workbench?.setStartupActive(false).catch(error=>console.warn('Startup scheduling:',error.message));
  document.dispatchEvent(new Event('workbench:startup-timeout'));
},20000);
