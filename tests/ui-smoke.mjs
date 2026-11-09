// SPDX-License-Identifier: MIT
// 使用示例副本和临时用户目录；统计仅本地捕获，不调用在线统计或 AI。
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {_electron} from 'playwright';
import electronPath from 'electron';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'vl-ui-smoke-'));
const profile=path.join(temporary,'profile'),project=path.join(temporary,'dark-metal-chip-demo');
const output=path.resolve(process.env.VL_SMOKE_OUTPUT||path.join(temporary,'evidence'));
await fs.mkdir(profile,{recursive:true});await fs.mkdir(output,{recursive:true});
await fs.cp(path.join(root,'examples/dark-metal-chip/dark-metal-chip-demo'),project,{recursive:true});
await fs.writeFile(path.join(profile,'workbench-settings.json'),JSON.stringify({projects:[project]}));
const env={...process.env,WORKBENCH_TEST:'1',WORKBENCH_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
let app;
const failures=[],network=[];
const capturedFile=path.join(profile,'usage-statistics-captured.jsonl');
async function events(){return (await fs.readFile(capturedFile,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;})).trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));}
async function stored(){return JSON.parse(await fs.readFile(path.join(profile,'usage-statistics.json'),'utf8'));}
async function start(){
 app=await _electron.launch({executablePath:process.env.VL_SMOKE_EXE||electronPath,args:process.env.VL_SMOKE_EXE?[]:[root],env,timeout:30000});
 const page=await app.firstWindow();
 page.on('pageerror',e=>failures.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.hide();win.setSize(1440,1000);});
 await page.waitForFunction(()=>window.workbenchState?.().projectCount===1,null,{timeout:25000});
 await page.waitForFunction(()=>!document.documentElement.classList.contains('startup-active'),null,{timeout:25000});
 assert.equal(await app.evaluate(({app})=>app.getVersion()),metadata.version);
 return page;
}
try{
 let page=await start();
 await page.locator('#usage-consent-dialog').waitFor({state:'visible'});
 const initial=await page.evaluate(()=>window.workbench.usageStatistics());
 assert.equal(initial.available,true);assert.equal(String(initial.projectId),'719835');assert.equal(initial.consent,null);
 assert.deepEqual(await events(),[]);
 const choice=process.env.VL_SMOKE_CHOICE==='allow'?'allow':'decline';
 await page.locator(choice==='allow'?'#usage-allow':'#usage-decline').click();
 await page.locator('#usage-consent-dialog').waitFor({state:'hidden'});
 if(choice==='decline'){assert.equal((await stored()).installId,null);assert.equal((await stored()).consent,false);assert.deepEqual(await events(),[]);}
 await page.locator('.project-root .row-label').click();
 await page.locator('.project-asset[data-kind="model"] .row-label').filter({hasText:'MetalChip_v002.glb'}).click();
 await page.waitForFunction(()=>window.workbenchState?.().meshCount===495);
 await page.locator('button[data-presentation="compare"]').click();
 await page.waitForFunction(()=>['final-render','reference-render'].every(id=>{const i=document.getElementById(id);return i.complete&&i.naturalWidth===1536;}));
 const compare=await page.evaluate(()=>window.workbenchState());
 assert.equal(compare.hasRender,true);assert.equal(compare.hasReference,true);assert.equal(compare.presentation,'compare');assert.equal(compare.meshCount,495);
 const part=await page.evaluate(()=>window.workbenchState().objects.find(o=>/Continuous brushed silver outer wall/.test(o.name)));
 assert.ok(part);await page.locator(`#structure-tree [data-node="${part.uuid}"]`).click({button:'right'});
 await page.locator('#point-edit-dialog').waitFor({state:'visible'});
 await page.locator('#point-edit-dialog').evaluate(async el=>{await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
 assert.ok(await page.locator('#point-edit-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),'Right-click dialog must remain within the viewport after opening motion');
 await page.locator('#point-edit-input').fill('把金属边框改成浅香槟金，保留原来的结构。');
 await page.locator('#point-edit-form button[type=submit]').click();await page.locator('#point-edit-dialog').waitFor({state:'hidden'});
 await page.waitForFunction(()=>window.workbenchNotesState?.().pending===1);
 assert.equal(await page.locator('#chat-input').inputValue(),'');
 await page.screenshot({path:path.join(output,'workbench-compare-light.png')});
 await page.locator('#open-settings').click();await page.locator('#settings-theme').selectOption('dark');
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 await page.locator('#settings-dialog').evaluate(async el=>{await new Promise(requestAnimationFrame);await Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})));});
 await page.waitForFunction(()=>{const el=document.getElementById('settings-dialog');return el.open&&Number(getComputedStyle(el).opacity)===1;});
 await page.screenshot({path:path.join(output,'workbench-settings-dark.png')});
 await page.locator('#settings-theme').selectOption('light');
 if(choice==='decline')await page.locator('#usage-statistics-enabled').check();
 await page.waitForFunction(async()=>{const s=await window.workbench.usageStatistics();return s.consent===true&&s.lastResult==='accepted';});
 await page.evaluate(()=>window.workbench.recordUsageActivity());
 const captured=await events();assert.equal(captured.length,2);assert.deepEqual(captured.map(e=>e.event),['workbench_first_open','workbench_daily_active']);
 assert.ok(captured.every(e=>e.properties.app_version===metadata.version&&e.properties.is_test===true&&!('api_key' in e)));
 const id=(await stored()).installId;assert.ok(id);
 await app.close();app=null;
 page=await start();
 assert.equal((await page.evaluate(()=>window.workbench.usageStatistics())).consent,true);
 assert.equal(await page.locator('#usage-consent-dialog').getAttribute('open'),null);
 await page.evaluate(()=>window.workbench.recordUsageActivity());
 assert.equal((await stored()).installId,id);assert.equal((await events()).length,2);
 await page.locator('#open-settings').click();await page.locator('#usage-statistics-enabled').uncheck();
 await page.waitForFunction(async()=>(await window.workbench.usageStatistics()).consent===false);
 await page.evaluate(()=>window.workbench.recordUsageActivity());assert.equal((await events()).length,2);assert.equal((await stored()).pending.length,0);
 assert.equal(network.length,0,'Smoke test must not issue HTTP requests');assert.deepEqual(failures,[]);
 const manifest=JSON.parse(await fs.readFile(path.join(project,'.visualization-project.json'),'utf8'));
 assert.equal(manifest.models.length,2);assert.equal(manifest.renders.length,3);
 const result={passed:true,version:metadata.version,checks:['startup and initialization','sample project restored','495 editable meshes loaded','reference/model/render comparison','right-click dialog stays within viewport and saves pending opinion','light and dark settings','official PostHog configuration available','first-use consent '+choice,'two minimal local test events at version '+metadata.version,'restart preserves identifier and deduplicates','settings opt-out stops capture','no HTTP requests','no renderer errors'],model:compare.model,meshCount:compare.meshCount,networkRequests:network.length,localTestEvents:captured.length,rendererErrors:failures};
 await fs.writeFile(path.join(output,'ui-smoke.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(e){if(app){const page=await app.firstWindow().catch(()=>null);if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}throw e;}
finally{await app?.close();if(!output.startsWith(temporary+path.sep))await fs.rm(temporary,{recursive:true,force:true});else console.log('Local evidence: '+output);}
