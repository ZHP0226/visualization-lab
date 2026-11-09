import os,json,struct,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parent.parent
raw=(root/'MetalChip_v001.glb').read_bytes()
magic,version,total=struct.unpack_from('<III',raw)
assert magic==0x46546c67 and version==2 and total==len(raw)
jlen,jtype=struct.unpack_from('<II',raw,12)
g=json.loads(raw[20:20+jlen]); off=20+jlen
blen,btype=struct.unpack_from('<II',raw,off); binary=raw[off+8:off+8+blen]
assert all('uri' not in b for b in g['buffers'])
nodes=[n for n in g['nodes'] if 'mesh' in n]
names=[n['name'] for n in nodes]
counts={'pillars':sum(n.startswith('Gold block C') for n in names),'contacts':sum(n.startswith(('North contact ','South contact ','West contact ','East contact ')) for n in names),'mounts':sum('Counterbored_Through_Hole' in n for n in names),'traces':sum(n.startswith('Reference trace ') for n in names)}
assert counts==dict(pillars=54,contacts=44,mounts=4,traces=122),counts
assert len({n['extras']['workbench_id'] for n in nodes})==len(nodes)
triangles=[]
for n in nodes:
    for p in g['meshes'][n['mesh']]['primitives']:
        a=g['accessors'][p['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
        xyz=np.frombuffer(binary,dtype='<f4',count=a['count']*3,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,3)
        assert np.isfinite(xyz).all()
        triangles.append(xyz.reshape(-1,3,3))
t=np.concatenate(triangles);a,b,c=t[:,0],t[:,1],t[:,2]
den=(b[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,1]-c[:,1])
valid=np.abs(den)>1e-15
a,b,c,den=a[valid],b[valid],c[valid],den[valid]
# Test center and an eight-point disk inside the narrowest 1.66mm bore.
for sx in [-1,1]:
    for sz in [-1,1]:
        for k in range(9):
            angle=2*np.pi*(k-1)/8; r=0 if k==0 else .0012
            x=sx*.04325+r*np.cos(angle); y=-sz*.04325+r*np.sin(angle)
            u=((b[:,1]-c[:,1])*(x-c[:,0])+(c[:,0]-b[:,0])*(y-c[:,1]))/den
            v=((c[:,1]-a[:,1])*(x-c[:,0])+(a[:,0]-c[:,0])*(y-c[:,1]))/den
            assert not np.any((u>1e-7)&(v>1e-7)&(u+v<1-1e-7)),(sx,sz,k)
im=Image.open(root/'MetalChip_v001.png');im.verify()
assert Image.open(root/'MetalChip_v001.png').size==(1536,1024)
checks={'counts':counts,'meshCount':len(nodes),'triangleCount':int(len(t)),'embeddedGLB':True,'finiteGeometry':True,'holeDiskRaysClear':36,'pngSize':[1536,1024]}
(root/'MetalChip_v001_reproduction'/'independent_verification.json').write_text(json.dumps(checks,indent=2),encoding='utf8')
print(json.dumps(checks))
