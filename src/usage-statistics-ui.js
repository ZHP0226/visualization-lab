import {buildWelcomeBody} from './usage-welcome-copy.js';
const api=window.workbench;
const text='参与后，软件会向 PostHog（美国）发送随机安装标识、软件版本、系统类型和使用日期，用于统计首次使用、活跃安装实例及版本分布。不会发送项目、文件路径、聊天内容或 API 密钥。你可以随时在设置中关闭。';
const section=document.createElement('section');section.className='settings-section';section.id='usage-statistics-section';
section.innerHTML='<h3>使用统计</h3><label class="settings-row"><span>参与使用统计<small>帮助了解软件使用情况，可随时关闭</small></span><input id="usage-statistics-enabled" type="checkbox"></label><p id="usage-statistics-description" class="settings-description"></p><p id="usage-statistics-state" class="settings-description" role="status"></p>';
section.querySelector('#usage-statistics-description').textContent=text;
document.querySelector('#settings-dialog .settings-about').before(section);
const dialog=document.createElement('dialog');dialog.id='usage-consent-dialog';dialog.className='project-dialog usage-consent-dialog';dialog.setAttribute('aria-labelledby','usage-consent-title');dialog.setAttribute('aria-describedby','usage-consent-subtitle');
dialog.innerHTML='<header class="usage-guide-header"><span class="usage-guide-brand">VISUALIZATION LAB</span><h2 id="usage-consent-title">欢迎使用可视化实验室</h2><p id="usage-consent-subtitle">软件介绍、使用方法与可选使用统计说明</p></header><div id="usage-consent-description" class="usage-guide-body" tabindex="0" role="region" aria-label="软件介绍、使用方法与完整统计说明"></div><footer class="usage-guide-footer"><div class="usage-consent-actions"><button id="usage-decline" type="button" class="button">取消</button><button id="usage-allow" type="button" class="button primary">同意</button></div><p id="usage-consent-error" role="alert"></p></footer>';
dialog.querySelector('#usage-consent-description').append(buildWelcomeBody());document.body.append(dialog);
const toggle=document.getElementById('usage-statistics-enabled'),status=document.getElementById('usage-statistics-state');
let current=null,started=document.documentElement.dataset.startupState==='finished',choiceBusy=false,lastActivity=0;
function render(value){current=value;toggle.checked=value.consent===true;toggle.disabled=!value.available||choiceBusy;status.textContent=!value.available?'当前统计配置暂不可用，软件功能正常。':value.consent===true?'已参与使用统计。关闭后停止后续发送。':'当前未参与使用统计。';}
async function choose(value){if(choiceBusy)return;choiceBusy=true;toggle.disabled=true;for(const b of dialog.querySelectorAll('button'))b.disabled=true;try{render(await api.setUsageStatisticsConsent(value));dialog.close();}catch(e){document.getElementById('usage-consent-error').textContent='保存失败，请重试。';status.textContent='保存失败，未变更统计选择。';toggle.checked=current?.consent===true;}finally{choiceBusy=false;toggle.disabled=!current?.available;for(const b of dialog.querySelectorAll('button'))b.disabled=false;}}
toggle.addEventListener('change',()=>choose(toggle.checked));document.getElementById('usage-allow').onclick=()=>choose(true);document.getElementById('usage-decline').onclick=()=>choose(false);
dialog.addEventListener('cancel',e=>{e.preventDefault();e.stopImmediatePropagation();choose(false);});
function maybeAsk(){if(started&&current?.available&&current.consent===null&&!document.querySelector('dialog[open]'))dialog.showModal();}
document.addEventListener('workbench:startup-finished',()=>{started=true;maybeAsk();});
const observer=new MutationObserver(()=>{if(current&&current.consent!==null){observer.disconnect();return;}maybeAsk();});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
api.usageStatistics().then(value=>{render(value);maybeAsk();}).catch(()=>{status.textContent='统计设置暂不可用，软件功能正常。';toggle.disabled=true;});
function activity(event){if(!event.isTrusted||!started||current?.consent!==true||document.visibilityState!=='visible'||!document.hasFocus())return;const time=Date.now();if(time-lastActivity<30000)return;lastActivity=time;api.recordUsageActivity().catch(()=>{});}
window.addEventListener('focus',activity);document.addEventListener('pointerdown',activity,{passive:true,capture:true});document.addEventListener('keydown',activity,{passive:true,capture:true});
