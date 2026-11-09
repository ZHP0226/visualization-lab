import sys,json,struct
from pathlib import Path
import numpy as np
here=Path(__file__).resolve().parent;root=here.parent
sys.path.insert(0,str(here))
from common import write_audit,write_json,digest,load_plan
raw=(root/'MetalChip_v001.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0]
g=json.loads(raw[20:20+n]);binary=raw[28+n:]
inventory=json.loads((root/'geometry.json').read_text())
plan=json.loads((here/'analysis_plan.json').read_text(encoding='utf8'))
plan['objects']=inventory['objects']
plan['materials']=[dict(id='material_%02d'%i,color=[v*12.92 if v<=.0031308 else 1.055*v**(1/2.4)-.055 for v in m['pbrMetallicRoughness']['baseColorFactor'][:3]],metallic=m['pbrMetallicRoughness']['metallicFactor'],roughness=m['pbrMetallicRoughness']['roughnessFactor']) for i,m in enumerate(g['materials'])]
plan['review']={'status':'reviewed','differences':['First native render reviewed; user color and lighting acceptance pending.','Gold is lighter and pillar contrast is softer than reference.','Camera and hidden geometry are illustrative reconstructions.']}
plan['assumptions'].append('As-built exact object inventory expanded from the reviewed component plan using reopened C4D evaluated geometry.')
write_json(str(here/'structure.json'),plan)
load_plan(str(here/'structure.json'))
meshes=[]
for node in g['nodes']:
    if 'mesh' not in node:continue
    p=g['meshes'][node['mesh']]['primitives'][0];a=g['accessors'][p['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
    xyz=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
    meshes.append(dict(id=node['extras']['workbench_id'],vertices=xyz.tolist(),triangles=np.arange(len(xyz)).reshape(-1,3).tolist()))
native_audit=json.loads((root/'audit.json').read_text())
write_audit(str(here/'structure.json'),plan,str(root/'MetalChip_v001'),meshes,'c4d',native_audit['version'],str(root/'MetalChip_v001.c4d'),str(root/'MetalChip_v001.png'),{'width':1536,'height':1024,'engine':'Cinema 4D Standard','areaSamples':64,'shadowSamples':[32,128],'reflectionSampleSetting':4.0,'ambientOcclusionSamples':[24,96],'exposure':'native default','colorManagement':'native document defaults'})
audit=json.loads((here/'audit.json').read_text(encoding='utf8'));audit['nativeChecks']=native_audit['checks'];audit['nativeRender']=native_audit['render'];audit['independentVerification']=json.loads((here/'independent_verification.json').read_text());audit['environmentNotes']=['R21 emitted authentication warning; native saving, reopening, export, and rendering nevertheless completed. No license settings modified.','ASCII junction used to avoid R21 non-ASCII save-path failure.'];audit['referenceIds']=['8f1da32a-64a4-46d3-ab3c-8223e8d57279']
write_json(str(here/'audit.json'),audit)
print('AUDIT_OK',len(meshes),audit['files'])
