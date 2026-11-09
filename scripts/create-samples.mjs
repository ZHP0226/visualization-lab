import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'assets/library/示例模型');
await fs.mkdir(directory, { recursive: true });
const materials = {
  base: new THREE.MeshStandardMaterial({ color: '#6c8190', metalness: .38, roughness: .28 }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#c1e2df', metalness: .12, roughness: .18, transparent: true, opacity: .88, clearcoat: 1 }),
  gold: new THREE.MeshStandardMaterial({ color: '#d4ae6d', metalness: .76, roughness: .24 }),
  silver: new THREE.MeshStandardMaterial({ color: '#d8e1eb', metalness: .55, roughness: .3 }),
  blue: new THREE.MeshStandardMaterial({ color: '#8aa7ca', metalness: .32, roughness: .23 })
};
function box(parent, name, dimensions, position, material, radius = .05) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(...dimensions, 3, radius), material);
  mesh.name = name; mesh.position.set(...position); parent.add(mesh); return mesh;
}
function group(parent, name) { const node = new THREE.Group(); node.name = name; parent.add(node); return node; }
async function save(object, name) { const buffer = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true }); await fs.writeFile(path.join(directory, name), Buffer.from(buffer)); }
const chip = new THREE.Group(); chip.name = '光子芯片';
const foundation = group(chip, '芯片基底');
box(foundation, '硅基底', [6.8, .32, 4.5], [0, 0, 0], materials.base, .12);
box(foundation, '二氧化硅包层', [6.55, .2, 4.25], [0, .26, 0], materials.glass, .1);
const photonics = group(chip, '光子结构');
const ring = new THREE.Mesh(new THREE.TorusGeometry(.98, .078, 20, 160), materials.gold); ring.rotation.x = Math.PI / 2; ring.position.set(.25, .45, 0); ring.name = '微环谐振器'; photonics.add(ring);
box(photonics, '输入总线波导', [5.45, .13, .14], [0, .45, 1.18], materials.gold, .04);
box(photonics, '输出总线波导', [5.45, .13, .14], [0, .45, -1.18], materials.gold, .04);
const contacts = group(chip, '电极与端口');
for (const [index, x] of [-2.65, 2.65].entries()) for (const [j, z] of [-1.18, 1.18].entries()) {
  box(contacts, `耦合端口 ${index * 2 + j + 1}`, [.57, .18, .55], [x, .49, z], materials.gold, .05);
}
const pads = group(chip, '辅助电极');
for (const [index, x] of [-1.85, -.72, .72, 1.85].entries()) box(pads, `接触焊盘 ${index + 1}`, [.62, .095, .42], [x, .43, -1.79], materials.silver, .045);
await save(chip, '光子芯片.glb');
const layered = new THREE.Group(); layered.name = '分层器件';
const layers = group(layered, '器件层组');
box(layers, '下层电极', [4.8, .35, 3.5], [0, -.6, 0], materials.gold, .09);
box(layers, '介质层', [4.55, .3, 3.25], [0, 0, 0], materials.glass, .09);
box(layers, '上层电极', [4.8, .35, 3.5], [0, .6, 0], materials.gold, .09);
box(layered, '支撑基底', [5.5, .4, 4.1], [0, -1.05, 0], materials.blue, .13);
await save(layered, '分层器件.glb');
await fs.writeFile(path.join(directory, '几何示例.obj'), '# Local OBJ sample\nmtllib 几何示例.mtl\no 四棱锥\nv -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv 0 1.8 0\nusemtl Porcelain\nf 1 2 5\nf 2 3 5\nf 3 4 5\nf 4 1 5\nf 4 3 2 1\n');
await fs.writeFile(path.join(directory, '几何示例.mtl'), 'newmtl Porcelain\nKd 0.48 0.65 0.8\nKs 0.25 0.25 0.25\nNs 40\n');
await fs.writeFile(path.join(directory, '导出说明.txt'), '此文件用于验证文件栏过滤：工作台不应显示 txt 和 mtl 文件。\n');
console.log('Created two multi-part GLB examples and one OBJ/MTL example.');
