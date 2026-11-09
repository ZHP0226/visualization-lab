import sys,json,struct,hashlib
from pathlib import Path
import numpy as np
here=Path(__file__).resolve().parent;root=here.parent
sys.path.insert(0,str(here))
from common import write_audit,write_json,load_plan
plan=json.loads((root/'MetalChip_v001_reproduction'/'structure.json').read_text(encoding='utf8'))
inventory=json.loads((root/'geometry_v002.json').read_text())
export=json.loads((here/'export-audit.json').read_text())
plan['objects']=inventory['objects'];plan['materials']=export['materials']
plan['review']={'status':'reviewed','differences':['Geometry and camera preserved from v001.','Native material/light appearance visually checked against reference; final user acceptance pending.','GLB has updated basic PBR; C4D reflection shaders are native-only.']}
plan['render']['samples']=64
write_json(str(here/'structure.json'),plan);load_plan(str(here/'structure.json'))
raw=(root/'MetalChip_v002.glb').read_bytes();l=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+l]);binary=raw[28+l:]
meshes=[]
for n in g['nodes']:
    if 'mesh' not in n:continue
    p=g['meshes'][n['mesh']]['primitives'][0];a=g['accessors'][p['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
    xyz=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
    meshes.append(dict(id=n['extras']['workbench_id'],vertices=xyz.tolist(),triangles=np.arange(len(xyz)).reshape(-1,3).tolist()))
native=json.loads((root/'look-audit.json').read_text());settings=json.loads((here/'look-settings.json').read_text())
write_audit(str(here/'structure.json'),plan,str(root/'MetalChip_v002'),meshes,'c4d',native['version'],str(root/'MetalChip_v002.c4d'),str(root/'MetalChip_v002.png'),{'width':1536,'height':1024,'engine':'Cinema 4D Standard','lightSamples':64,'settings':settings})
audit=json.loads((here/'audit.json').read_text(encoding='utf8'))
audit['nativeChecks']=native;audit['exportChecks']=export['checks'];audit['comparison']=json.loads((here/'comparison.json').read_text(encoding='utf8'));audit['independentVerification']=json.loads((here/'independent_verification.json').read_text())
audit['projectEntryCode']={'MetalChip_v002_build.py':hashlib.sha256((root/'MetalChip_v002_build.py').read_bytes()).hexdigest()}
write_json(str(here/'audit.json'),audit)
print('FRAMEWORK_AUDIT_OK',len(meshes),audit['files'])
