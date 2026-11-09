const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inspectGLB, editArray, readGLB } = require('../electron/model-edit.cjs');
function fixture() {
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Chip array', children: [] }, { name: 'Unrelated base', mesh: 0 }], meshes: [], accessors: [], bufferViews: [], materials: [{ name: 'gold', pbrMetallicRoughness: { metallicFactor: 1 } }], buffers: [{ byteLength: 4 }] };
  for (let x = 0; x < 9; x++) for (let z = 0; z < 6; z++) {
    json.nodes[0].children.push(json.nodes.length);
    const i = json.accessors.length;
    json.accessors.push({ min: [x * .04, .09, z * .05], max: [x * .04 + .021, .12, z * .05 + .024], componentType: 5126, type: 'VEC3', count: 3 });
    json.meshes.push({ primitives: [{ attributes: { POSITION: i }, material: 0 }] });
    json.nodes.push({ name: `Gold block C${x + 1} R${z + 1}`, mesh: json.meshes.length - 1 });
  }
  json.scenes[0].nodes.push(1);
  const raw = Buffer.from(JSON.stringify(json)), body = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 32); raw.copy(body);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + body.length + 4, 8); header.writeUInt32LE(body.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const bin = Buffer.alloc(12); bin.writeUInt32LE(4); bin.writeUInt32LE(0x004e4942, 4); bin.writeUInt32LE(123456, 8);
  return Buffer.concat([header, body, bin]);
}
test('replaces the array with triangular rows and true triangular prisms, preserving unrelated geometry and material', () => {
  const input = fixture(), original = readGLB(input), originalHash = require('node:crypto').createHash('sha256').update(input).digest('hex');
  assert.equal(inspectGLB(input).arrays[0].unitCount, 54);
  const result = editArray(input, { arrayId: '0', layout: 'triangle', unitShape: 'triangle', rows: null });
  const output = readGLB(result.buffer), array = inspectGLB(result.buffer).arrays[0], parent = output.json.nodes[Number(array.id)];
  assert.equal(array.unitCount, 55); assert.equal(result.details.rows, 10);
  const rows = new Map();
  for (const id of parent.children) { const unit = output.json.nodes[id]; rows.set(unit.translation[2], (rows.get(unit.translation[2]) || 0) + 1); }
  assert.deepEqual([...rows.values()], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const mesh = output.json.meshes[output.json.nodes[parent.children[0]].mesh], accessor = output.json.accessors[mesh.primitives[0].attributes.POSITION];
  const view = output.json.bufferViews[accessor.bufferView], vertices = [];
  for (let i = 0; i < accessor.count; i++) vertices.push([0, 1, 2].map(a => output.binary.readFloatLE(view.byteOffset + (i * 3 + a) * 4)));
  assert.equal(accessor.count / 3, 8); // A triangular prism has two triangular caps and six side triangles.
  const top = Math.max(...vertices.map(p => p[1]));
  assert.equal(new Set(vertices.filter(p => p[1] === top).map(p => p[0] + ',' + p[2])).size, 3);
  assert.deepEqual(output.json.nodes[1], original.json.nodes[1]);
  assert.deepEqual(output.json.materials, original.json.materials);
  assert.deepEqual(output.binary.subarray(0, original.binary.length), original.binary);
  assert.equal(require('node:crypto').createHash('sha256').update(input).digest('hex'), originalHash);
  assert.throws(() => editArray(input, { arrayId: '0', layout: 'triangle', unitShape: 'triangle', rows: 30 }), /过密/);
  assert.throws(() => editArray(input, { arrayId: '../../file', layout: 'triangle', unitShape: 'triangle', rows: null }), /未找到/);
});
