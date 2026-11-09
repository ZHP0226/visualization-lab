// Edits a GLB revision while preserving all unrelated nodes, materials and binary data.
const TOOL_SPECS = [
  { type: 'function', name: 'get_model_structure', description: '读取工作台当前关联模型的结构和可编辑阵列。修改前必须先调用，使用返回的阵列 ID。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { type: 'function', name: 'edit_model_array', description: '实际修改已读取模型的阵列，另存新的 GLB 并在工作台载入。当前支持三角形外轮廓排列及三角柱单元；保留芯片其他结构与材质。rows 为 2～30，未指定数量可传 null 自动选择接近原数量的排数。', inputSchema: { type: 'object', properties: { arrayId: { type: 'string' }, layout: { type: 'string', enum: ['triangle'] }, unitShape: { type: 'string', enum: ['triangle'] }, rows: { type: ['integer', 'null'], minimum: 2, maximum: 30 } }, required: ['arrayId', 'layout', 'unitShape', 'rows'], additionalProperties: false } }
];
function readGLB(buffer) {
  if (buffer.length < 28 || buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error('模型不是有效的 GLB 2.0');
  let json, binary;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + length > buffer.length) throw new Error('GLB 数据不完整');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8').trim());
    else if (type === 0x004e4942) binary = data;
    else throw new Error('此 GLB 含尚未支持的数据块');
    offset += length + 8;
  }
  if (!json?.nodes || !binary || json.buffers?.length !== 1 || json.buffers[0].uri) throw new Error('请使用带内嵌几何数据的 GLB');
  return { json, binary };
}
function nodeBounds(json, id) {
  const node = json.nodes[id], mesh = json.meshes?.[node?.mesh];
  if (!mesh || node.skin !== undefined || node.matrix || node.rotation || node.scale) throw new Error('此阵列含变形或复杂单元变换，当前版本尚不支持');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.primitives) {
    const a = json.accessors[p.attributes.POSITION];
    if (!a?.min || !a?.max) throw new Error('阵列缺少几何边界');
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], a.min[axis] + (node.translation?.[axis] || 0));
      max[axis] = Math.max(max[axis], a.max[axis] + (node.translation?.[axis] || 0));
    }
  }
  return { min, max };
}
function arrays(json) {
  const result = [];
  // Only nodes reachable from the active scene can be edited.
  const visit = id => {
    const node = json.nodes[id];
    const units = (node.children || []).filter(i => json.nodes[i]?.mesh !== undefined && (node.extras?.workbench_array || /^(?:Gold block C\d+ R\d+|三角单元 R\d+|Array unit\b)/i.test(json.nodes[i].name || '')));
    if (units.length >= 3) result.push({ id: String(id), label: node.name || `阵列 ${id}`, unitCount: units.length, layout: node.extras?.workbench_array?.layout || 'grid', unitShape: node.extras?.workbench_array?.unitShape || 'box', units });
    for (const child of node.children || []) visit(child);
  };
  for (const id of json.scenes?.[json.scene || 0]?.nodes || []) visit(id);
  return result;
}
function inspectGLB(buffer) {
  const { json } = readGLB(buffer);
  return { arrays: arrays(json).map(({ units, ...item }) => item), capabilities: ['三角形轮廓阵列', '三角柱单元'], groups: json.nodes.filter(n => n.children?.length > 1).map(n => n.name).filter(Boolean).slice(0, 25) };
}
function writeGLB(json, binary) {
  const raw = Buffer.from(JSON.stringify(json)), text = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(text);
  const bin = Buffer.alloc(Math.ceil(binary.length / 4) * 4); binary.copy(bin);
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + text.length + bin.length, 8); header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, text, binHeader, bin]);
}
function editArray(buffer, args) {
  if (!args || args.layout !== 'triangle' || args.unitShape !== 'triangle') throw new Error('目前支持三角形阵列和三角柱单元');
  if (args.rows != null && (!Number.isInteger(args.rows) || args.rows < 2 || args.rows > 30)) throw new Error('阵列排数必须为 2～30');
  const { json, binary } = readGLB(buffer), array = arrays(json).find(a => a.id === args.arrayId);
  if (!array) throw new Error('未找到指定的可编辑阵列，请先读取当前模型结构');
  const bounds = array.units.map(id => nodeBounds(json, id));
  const min = [0, 1, 2].map(a => Math.min(...bounds.map(b => b.min[a]))), max = [0, 1, 2].map(a => Math.max(...bounds.map(b => b.max[a])));
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const width = median(bounds.map(b => b.max[0] - b.min[0])), height = median(bounds.map(b => b.max[1] - b.min[1]));
  const depth = width * Math.sqrt(3) / 2;
  const rows = args.rows ?? Math.max(2, Math.min(30, Math.round((Math.sqrt(8 * array.unitCount + 1) - 1) / 2)));
  const side = Math.min(max[0] - min[0] - width, (max[2] - min[2] - depth) / (Math.sqrt(3) / 2));
  if (![width, height, side].every(v => Number.isFinite(v) && v > 0) || side / (rows - 1) < width * 1.05) throw new Error('单元过密或边界无效，请减少排数');
  const points = [[0, 0, -depth / 2], [-width / 2, 0, depth / 2], [width / 2, 0, depth / 2]];
  points.push(...points.map(p => [p[0], height, p[2]]));
  const faces = [[2, 1, 0], [3, 4, 5]];
  for (let i = 0; i < 3; i++) { const next = (i + 1) % 3; faces.push([i, next, next + 3], [i, next + 3, i + 3]); }
  const positions = [], normals = [];
  for (const face of faces) {
    const [a, b, c] = face.map(i => points[i]), u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...normal);
    for (const p of [a, b, c]) { positions.push(...p); normals.push(...normal.map(n => n / length)); }
  }
  const chunks = [binary]; let byteLength = binary.length;
  const attribute = (values, withBounds) => {
    const data = Buffer.alloc(values.length * 4); values.forEach((value, i) => data.writeFloatLE(value, i * 4));
    const view = json.bufferViews.length; json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length, target: 34962 });
    chunks.push(data); byteLength += data.length;
    const accessor = { bufferView: view, componentType: 5126, count: values.length / 3, type: 'VEC3' };
    if (withBounds) { accessor.min = [0, 1, 2].map(a => Math.min(...values.filter((_, i) => i % 3 === a))); accessor.max = [0, 1, 2].map(a => Math.max(...values.filter((_, i) => i % 3 === a))); }
    const index = json.accessors.length; json.accessors.push(accessor); return index;
  };
  const material = json.meshes[json.nodes[array.units[0]].mesh].primitives[0].material;
  const mesh = json.meshes.length;
  json.meshes.push({ name: 'Triangular prism unit', primitives: [{ attributes: { POSITION: attribute(positions, true), NORMAL: attribute(normals, false) }, ...(material === undefined ? {} : { material }), mode: 4 }] });
  const children = [], centerX = (min[0] + max[0]) / 2, centerZ = (min[2] + max[2]) / 2, triangleHeight = side * Math.sqrt(3) / 2;
  for (let row = 0; row < rows; row++) for (let col = 0; col <= row; col++) {
    children.push(json.nodes.length);
    json.nodes.push({ name: `三角单元 R${String(row + 1).padStart(2, '0')} C${String(col + 1).padStart(2, '0')}`, mesh, translation: [centerX + (col - row / 2) * side / (rows - 1), min[1], centerZ - triangleHeight / 2 + row * triangleHeight / (rows - 1)] });
  }
  const details = { layout: 'triangle', unitShape: 'triangle', rows, unitCount: children.length, previousCount: array.unitCount };
  const newGroup = json.nodes.length;
  json.nodes.push({ name: `三角形阵列 · ${rows}排 / ${children.length}单元`, children, extras: { workbench_array: details } });
  const parent = json.nodes[Number(array.id)];
  parent.children = parent.children.filter(i => !array.units.includes(i)); parent.children.push(newGroup);
  // If replacing an already generated array, retain its identifying metadata on the new group only.
  if (parent.extras?.workbench_array) delete parent.extras.workbench_array;
  json.buffers[0].byteLength = byteLength;
  return { buffer: writeGLB(json, Buffer.concat(chunks)), details };
}
module.exports = { TOOL_SPECS, readGLB, inspectGLB, editArray };
