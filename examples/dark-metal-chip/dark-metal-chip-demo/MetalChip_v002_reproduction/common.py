# coding: utf-8
from __future__ import print_function
import io, json, math, os, struct, hashlib, sys

VERSION = '1.0.0'
try:
    STRING_TYPES = (basestring,)
except NameError:
    STRING_TYPES = (str,)

def digest(file):
    h = hashlib.sha256()
    with open(file, 'rb') as f:
        while True:
            b = f.read(1024 * 1024)
            if not b: break
            h.update(b)
    return h.hexdigest()

def write_json(file, value):
    with io.open(file, 'w', encoding='utf-8') as f:
        f.write(json.dumps(value, ensure_ascii=False, indent=2) + u'\n')

def finite(values, length):
    return isinstance(values, list) and len(values) == length and all(isinstance(x, (int, float)) and not isinstance(x, bool) and not math.isnan(x) and not math.isinf(x) for x in values)

def load_plan(file):
    with io.open(file, encoding='utf-8') as f: p = json.load(f)
    if p.get('schemaVersion') != 1 or p.get('coordinateSystem') != 'Z_UP_RIGHT_HANDED': raise ValueError('Unsupported plan version or coordinate system')
    if not p.get('subject') or not isinstance(p.get('assumptions'), list): raise ValueError('Subject and explicit assumptions are required')
    objects, materials = p.get('objects', []), p.get('materials', [])
    if not 1 <= len(objects) <= 10000 or len(set(o['id'] for o in objects)) != len(objects): raise ValueError('Object inventory is empty or has duplicate IDs')
    ids = set(m['id'] for m in materials)
    if len(ids) != len(materials): raise ValueError('Duplicate material IDs')
    for m in materials:
        if not finite(m.get('color'), 3) or not all(0 <= c <= 1 for c in m['color']): raise ValueError('Invalid material color')
        if not all(0 <= m.get(k, 0) <= 1 for k in ['metallic', 'roughness']): raise ValueError('Invalid material parameters')
    for o in objects:
        if o.get('shape') not in ['box', 'sphere', 'cylinder', 'custom'] or o.get('material') not in ids: raise ValueError('Unsupported shape or missing material')
        if not finite(o.get('position'), 3) or not finite(o.get('size'), 3) or not all(v > 0 for v in o['size']): raise ValueError('Invalid geometry dimensions')
    c, r = p.get('camera', {}), p.get('render', {})
    if not finite(c.get('position'), 3) or not finite(c.get('target'), 3) or c['position'] == c['target']: raise ValueError('Invalid camera')
    if c.get('projection') not in ['perspective', 'orthographic']: raise ValueError('Specify a camera projection')
    if not all(isinstance(r.get(k), int) and not isinstance(r[k], bool) for k in ['width', 'height', 'samples', 'seed']): raise ValueError('Render dimensions, samples and seed must be integers')
    if not (16 <= r['width'] <= 8192 and 16 <= r['height'] <= 8192 and 1 <= r['samples'] <= 4096 and 0 <= r['seed'] < 2147483647): raise ValueError('Render parameters out of range')
    if not p.get('lights') or not all(finite(l.get('position'), 3) and finite(l.get('color'), 3) and l.get('power', 0) > 0 and l.get('size', 0) > 0 for l in p['lights']): raise ValueError('Explicit light rig required')
    ref = p.get('reference')
    if ref and digest(ref['file']) != ref['sha256']: raise ValueError('Reference changed after structural analysis')
    return p

def geometry_audit(plan, meshes):
    expected = set(o['id'] for o in plan['objects'])
    if set(m['id'] for m in meshes) != expected or len(meshes) != len(expected): raise ValueError('Native geometry IDs or counts disagree with the plan')
    records = []
    for mesh in meshes:
        points, triangles = mesh['vertices'], mesh['triangles']
        if not points or not triangles or not all(len(v) == 3 and all(not math.isnan(x) and not math.isinf(x) for x in v) for v in points): raise ValueError('Empty or nonfinite evaluated geometry')
        low = [min(v[i] for v in points) for i in range(3)]; high = [max(v[i] for v in points) for i in range(3)]
        item = next(o for o in plan['objects'] if o['id'] == mesh['id'])
        # Primitive builders have exact axis-aligned dimensions. Custom geometry supplies its own shape review.
        if item['shape'] != 'custom':
            for i in range(3):
                if abs((high[i] - low[i]) - item['size'][i]) > max(item['size'][i] * .025, 1e-5): raise ValueError('Evaluated size differs from plan: ' + mesh['id'])
                if abs((high[i] + low[i]) / 2 - item['position'][i]) > max(item['size'][i] * .01, 1e-5): raise ValueError('Evaluated position differs from plan: ' + mesh['id'])
        records.append(dict(id=mesh['id'], vertices=len(points), triangles=len(triangles), bounds=[low, high]))
    return records

def write_glb(file, plan, meshes):
    data = bytearray(); views = []; accessors = []; glmeshes = []; nodes = []
    materials = plan['materials']; mat_ids = dict((m['id'], i) for i, m in enumerate(materials))
    def add(values, count, vector=False):
        offset = len(data); data.extend(struct.pack('<' + 'f' * len(values), *values))
        views.append(dict(buffer=0, byteOffset=offset, byteLength=len(values) * 4, target=34962))
        a = dict(bufferView=len(views)-1, componentType=5126, count=count, type='VEC3')
        if vector:
            a['min'] = [min(values[i::3]) for i in range(3)]; a['max'] = [max(values[i::3]) for i in range(3)]
        accessors.append(a); return len(accessors)-1
    groups = {}
    for mesh in meshes:
        positions = []; normals = []
        for tri in mesh['triangles']:
            a, b, c = [mesh['vertices'][i] for i in tri]
            u = [b[i]-a[i] for i in range(3)]; v = [c[i]-a[i] for i in range(3)]
            n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
            length = math.sqrt(sum(x*x for x in n))
            if length < 1e-15: continue
            for point in [a,b,c]: positions.extend(point); normals.extend([x/length for x in n])
        if not positions: raise ValueError('No nondegenerate triangles: ' + mesh['id'])
        p = add(positions, len(positions)//3, True); n = add(normals, len(normals)//3)
        spec = next(o for o in plan['objects'] if o['id'] == mesh['id'])
        glmeshes.append(dict(name=mesh['id'], primitives=[dict(attributes=dict(POSITION=p, NORMAL=n), material=mat_ids[spec['material']])]))
        # glTF is Y-up. Canonical Z-up is mapped with a proper rotation, never a reflection.
        node = dict(name=spec.get('name', spec['id']), mesh=len(glmeshes)-1, rotation=[-math.sqrt(.5),0,0,math.sqrt(.5)], extras=dict(workbench_id=spec['id']))
        nodes.append(node); groups.setdefault(spec.get('group', 'Structure'), []).append(len(nodes)-1)
    roots=[]
    for name, children in sorted(groups.items()): nodes.append(dict(name=name, children=children)); roots.append(len(nodes)-1)
    glmaterials=[]
    for m in materials:
        glmaterials.append(dict(name=m['id'], doubleSided=True, pbrMetallicRoughness=dict(baseColorFactor=[v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in m['color']]+[1], metallicFactor=m.get('metallic',0), roughnessFactor=m.get('roughness',.5))))
    gl=dict(asset=dict(version='2.0',generator='Visualization Lab Framework '+VERSION),scene=0,scenes=[dict(nodes=roots)],nodes=nodes,meshes=glmeshes,materials=glmaterials,buffers=[dict(byteLength=len(data))],bufferViews=views,accessors=accessors)
    js=json.dumps(gl,ensure_ascii=False,separators=(',',':')).encode('utf-8'); js+=b' '*((-len(js))%4)
    binary=bytes(data) if sys.version_info[0] >= 3 else str(data)
    binary+=b'\0'*((-len(binary))%4)
    with open(file,'wb') as f:
        f.write(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))); f.write(struct.pack('<II',len(js),0x4e4f534a)); f.write(js); f.write(struct.pack('<II',len(binary),0x004e4942)); f.write(binary)

def write_audit(plan_file, plan, stem, meshes, software, version, native, render, settings):
    geometry=geometry_audit(plan, meshes)
    projectCodeHashes=dict((n,digest(os.path.join(os.path.dirname(plan_file),n))) for n in os.listdir(os.path.dirname(plan_file)) if n.endswith('.py') and os.path.isfile(os.path.join(os.path.dirname(plan_file),n)))
    codeHashes=dict((n,digest(os.path.join(os.path.dirname(__file__),n))) for n in ['common.py','run.py','blender_adapter.py','c4d_adapter.py'])
    write_json(os.path.join(os.path.dirname(plan_file),'audit.json'),dict(frameworkVersion=VERSION,codeHashes=codeHashes,projectCodeHashes=projectCodeHashes,software=software,softwareVersion=str(version),pythonVersion=sys.version,platform=sys.platform,planSha256=digest(plan_file),nativeReopened=True,geometry=geometry,renderSettings=settings,files=dict(model=dict(name=os.path.basename(stem+'.glb'),sha256=digest(stem+'.glb')),native=dict(name=os.path.basename(native),sha256=digest(native)),render=dict(name=os.path.basename(render),sha256=digest(render)) if render else None),reference=plan.get('reference'),review=plan.get('review',dict(status='pending',differences=[]))))
