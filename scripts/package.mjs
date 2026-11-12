// SPDX-License-Identifier: MIT
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const metadata=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(process.platform!=='win32')throw new Error('This portable packaging script currently supports Windows only.');
const outputIndex=process.argv.indexOf('--out');
if(outputIndex>=0&&!process.argv[outputIndex+1])throw new Error('--out requires a directory');
const destination=path.resolve(outputIndex>=0?process.argv[outputIndex+1]:path.join(root,'release',`VisualizationLab-v${metadata.version}-windows-x64`));
try{await fs.access(destination);throw new Error('Output already exists. Preserve it and choose a new --out directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
const runtime=path.join(root,'node_modules/electron/dist');
try{await fs.access(path.join(runtime,'electron.exe'));}catch{throw new Error('Electron runtime missing. Run npm run setup:runtime first.');}
await fs.access(path.join(root,'dist/renderer.js'));
await fs.cp(runtime,destination,{recursive:true});
await fs.rename(path.join(destination,'electron.exe'),path.join(destination,'可视化工作台.exe'));
execFileSync(process.env.PYTHON||'python',[path.join(root,'scripts/set-windows-icon.py'),path.join(destination,'可视化工作台.exe'),path.join(root,'assets/icon.ico'),metadata.version],{stdio:'inherit',windowsHide:true});
const appDir=path.join(destination,'resources/app');
await fs.mkdir(appDir,{recursive:true});
for(const directory of ['electron','dist','assets'])await fs.cp(path.join(root,directory),path.join(appDir,directory),{recursive:true,filter:f=>!['__pycache__'].includes(path.basename(f))&&!f.endsWith('.pyc')});
if(process.env.VL_TELEMETRY_CONFIG){
  const config=JSON.parse(await fs.readFile(path.resolve(process.env.VL_TELEMETRY_CONFIG),'utf8'));
  if(!['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(config.host)||!/^phc_[A-Za-z0-9_-]{20,}$/.test(config.token||''))throw new Error('Invalid optional telemetry configuration');
  await fs.writeFile(path.join(appDir,'electron/telemetry-config.json'),JSON.stringify(config,null,2)+'\n');
}
await fs.writeFile(path.join(appDir,'package.json'),JSON.stringify({name:metadata.name,version:metadata.version,main:metadata.main,license:metadata.license,author:metadata.author}));
await fs.cp(path.join(root,'licenses'),path.join(destination,'licenses'),{recursive:true});
await fs.copyFile(path.join(destination,'LICENSE'),path.join(destination,'licenses/Electron-runtime.txt'));
for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md','README.md','CHANGELOG.md','requirements-plotting.txt'])await fs.copyFile(path.join(root,name),path.join(destination,name));
await fs.cp(path.join(root,'docs'),path.join(destination,'docs'),{recursive:true});
await fs.cp(path.join(root,'examples'),path.join(destination,'examples'),{recursive:true,filter:f=>!f.endsWith('.blend1')&&!f.endsWith('.pyc')&&path.basename(f)!=='__pycache__'});
console.log('Prepared local portable application: '+destination);
