from __future__ import print_function
import os,sys,c4d
here=os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,here)
root=os.path.dirname(here)
native=os.path.join(root,'MetalChip_v001.c4d')
doc=c4d.documents.LoadDocument(native,c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
assert doc is not None
c4d.documents.InsertBaseDocument(doc)
c4d.documents.SetActiveDocument(doc)
def walk(o):
    while o:
        yield o
        for ch in walk(o.GetDown()): yield ch
        o=o.GetNext()
for obj in walk(doc.GetFirstObject()):
    if obj.CheckType(c4d.Olight):
        obj[c4d.LIGHT_AREADETAILS_SAMPLES]=64
        obj[c4d.LIGHT_SHADOW_MINSAMPLES]=32
        obj[c4d.LIGHT_SHADOW_MAXSAMPLES]=128
mat=doc.GetFirstMaterial()
while mat:
    for i in range(mat.GetReflectionLayerCount()):
        lid=mat.GetReflectionLayerIndex(i).GetDataID()
        mat[lid+c4d.REFLECTION_LAYER_SAMPLING_SAMPLE_COUNT]=4.0
    mat=mat.GetNext()
rd=doc.GetActiveRenderData()
rd[c4d.RDATA_AATHRESHOLD]=.025
ao=rd.GetFirstVideoPost()
if ao:
    ao[c4d.VPAMBIENTOCCLUSION_MINSAMPLES]=24
    ao[c4d.VPAMBIENTOCCLUSION_MAXSAMPLES]=96
    ao[c4d.VPAMBIENTOCCLUSION_ACCURACY]=.85
assert c4d.documents.SaveDocument(doc,native,c4d.SAVEDOCUMENTFLAGS_DONTADDTORECENTLIST,c4d.FORMAT_C4DEXPORT)
from inspect_render import inspect_export_render
inspect_export_render(native,root,os.path.join(here,'MetalChip_reference.png'),False)
