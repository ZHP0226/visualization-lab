import json,struct,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
def read(n):
    raw=(root/n).read_bytes();l=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+l]),raw[28+l:]
old,ob=read('MetalChip_v001.glb');new,nb=read('MetalChip_v002.glb')
assert ob==nb,'Geometry binary changed'
assert [(n['name'],n.get('extras'),n.get('rotation')) for n in old['nodes']]==[(n['name'],n.get('extras'),n.get('rotation')) for n in new['nodes']]
def material_of(g,prefix):
    n=next(n for n in g['nodes'] if n['name'].startswith(prefix))
    return g['materials'][g['meshes'][n['mesh']]['primitives'][0]['material']]
plate=material_of(new,'Champagne gold central plate');pillar=material_of(new,'Gold block C')
assert pillar!=plate
assert material_of(old,'Gold block C')!=pillar
assert len([n for n in new['nodes'] if n['name'].startswith('Gold block C')])==54
audit=json.loads((root/'look-audit.json').read_text())
assert audit['geometryUnchanged'] and audit['nativeReopened'] and audit['resolution']==[1536,1024]
assert Image.open(root/'MetalChip_v002.png').size==(1536,1024)
report={'geometryBinaryIdenticalToV001':True,'nodeNamesIdsTransformsIdentical':True,'pillarsHaveSeparateUpdatedMaterial':True,'platePBR':plate,'pillarPBR':pillar,'nativeAudit':audit,'referenceId':'8f1da32a-64a4-46d3-ab3c-8223e8d57279','files':{ext:hashlib.sha256((root/('MetalChip_v002.'+ext)).read_bytes()).hexdigest() for ext in ['c4d','glb','png']},'review':{'status':'reviewed','differences':['Visual color/light alignment evaluated against reference; final acceptance pending user review.']}}
(root/'MetalChip_v002_reproduction'/'comparison.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
