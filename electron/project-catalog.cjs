const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MANIFEST } = require('./projects.cjs');

// A project being listed does not make it the active project or load a model.
async function restoreProjectCatalog(store, directories, roots = [], excludedProjects = []) {
  const excludedIds=new Set(),excludedPaths=new Set();
  for(const row of Array.isArray(excludedProjects)?excludedProjects:[]){if(typeof row?.id==='string')excludedIds.add(row.id);if(typeof row?.directory==='string'&&path.isAbsolute(row.directory)){let file=path.resolve(row.directory);try{file=await fs.realpath(file);}catch{}excludedPaths.add(process.platform==='win32'?file.toLowerCase():file);}}
  const candidates = new Set((Array.isArray(directories) ? directories : []).filter(p => typeof p === 'string' && path.isAbsolute(p)));
  for (const root of roots) {
    let entries; try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      try { if ((await fs.stat(path.join(directory, MANIFEST))).isFile()) candidates.add(directory); } catch {}
    }
  }
  const result = [], seenPaths = new Set(), seenIds = new Set();
  for (const directory of candidates) {
    let key = path.resolve(directory), project;
    try { key = await fs.realpath(directory); } catch {}
    key = process.platform === 'win32' ? key.toLowerCase() : key;
    if(excludedPaths.has(key))continue;
    if (seenPaths.has(key)) continue; seenPaths.add(key);
    if(excludedIds.size){try{const document=JSON.parse(await fs.readFile(path.join(directory,MANIFEST),'utf8'));if(excludedIds.has(document.id))continue;}catch{}}
    try { project = await store.register(directory, { refresh: false }); }
    catch (error) {
      project = { id: 'unavailable-' + createHash('sha256').update(key).digest('hex').slice(0, 20), name: path.basename(directory), directory, models: [], renders: [], links: {}, unavailable: true, error: error.message };
    }
    if (!seenIds.has(project.id)) { result.push(project); seenIds.add(project.id); }
    else if (!project.unavailable) store.projects.set(project.id, result.find(p => p.id === project.id).directory);
  }
  return result;
}
module.exports = { restoreProjectCatalog };
