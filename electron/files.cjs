const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.fbx', '.obj']);
const ASSET_EXTENSIONS = new Set([...MODEL_EXTENSIONS, '.bin', '.mtl', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.tga', '.ktx2', '.basis', '.dds']);
function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
class FileLibrary {
  constructor() { this.roots = new Map(); }
  async grant(directory) {
    const root = await fs.realpath(directory);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('请选择文件夹');
    for (const [id, value] of this.roots) if (value === root) return this.describe(id);
    const id = randomUUID();
    this.roots.set(id, root);
    return this.describe(id);
  }
  describe(id) {
    const root = this.roots.get(id);
    if (!root) throw new Error('文件夹尚未打开');
    return { id, name: path.basename(root), path: root };
  }
  async resolve(id, relative = '') {
    const root = this.roots.get(id);
    if (!root || typeof relative !== 'string') throw new Error('无效的文件夹');
    const candidate = path.resolve(root, relative);
    if (!inside(root, candidate)) throw new Error('文件超出了打开的文件夹');
    const real = await fs.realpath(candidate);
    if (!inside(root, real)) throw new Error('文件链接超出了打开的文件夹');
    return real;
  }
  async list(id, relative = '') {
    const directory = await this.resolve(id, relative);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter(entry => !entry.isSymbolicLink() && (entry.isDirectory() || (entry.isFile() && MODEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
      .map(entry => ({ name: entry.name, directory: entry.isDirectory(), relative: path.join(relative, entry.name).split(path.sep).join('/'), extension: path.extname(entry.name).toLowerCase() }));
  }
  async model(id, relative) {
    const real = await this.resolve(id, relative);
    const extension = path.extname(real).toLowerCase();
    if (!MODEL_EXTENSIONS.has(extension) || !(await fs.stat(real)).isFile()) throw new Error('仅支持 GLB、glTF、FBX、OBJ 文件');
    const safeRelative = path.relative(this.roots.get(id), real).split(path.sep).join('/');
    const assetURL = relative => `workbench://app/model/${id}/${relative.split('/').map(encodeURIComponent).join('/')}`;
    let renderUrl = null;
    for (const imageExtension of ['.png', '.jpg', '.webp']) {
      const imageRelative = safeRelative.slice(0, -extension.length) + '.render' + imageExtension;
      try {
        const image = await this.resolve(id, imageRelative);
        if ((await fs.stat(image)).isFile()) { renderUrl = assetURL(imageRelative); break; }
      } catch { /* A model may legitimately have no final render. */ }
    }
    return { rootId: id, relative: safeRelative, name: path.basename(real), extension, size: (await fs.stat(real)).size,
      url: assetURL(safeRelative), renderUrl };
  }
}
module.exports = { FileLibrary, inside, MODEL_EXTENSIONS, ASSET_EXTENSIONS };
