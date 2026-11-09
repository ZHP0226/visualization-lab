# coding: utf-8
# SPDX-License-Identifier: MIT
from __future__ import print_function,division
import c4d,os,sys,json,math,time,hashlib,shutil,struct
from c4d import Vector as V
HERE=os.path.dirname(os.path.abspath(__file__))
def option(name,default):return next((s.split('=',1)[1] for s in sys.argv if s.startswith('--'+name+'=')),default)
source=os.path.abspath(option('source',os.path.join(HERE,'..','MetalChip_v001.c4d')))
settings_file=os.path.abspath(option('settings',os.path.join(HERE,'look-settings.json')))
output=os.path.abspath(option('output-dir',os.path.join(HERE,'output')))
if os.path.exists(os.path.join(output,'MetalChip_v002.c4d')):
    expected=option('replace-draft-sha','')
    actual=hashlib.sha256(open(os.path.join(output,'MetalChip_v002.c4d'),'rb').read()).hexdigest()
    if actual!=expected:raise RuntimeError('Output already exists or draft changed; refusing overwrite')
if not os.path.isdir(output):os.makedirs(output)
settings=json.load(open(settings_file))
if not os.path.isdir(os.path.join(output,'tex')):shutil.copytree(os.path.join(os.path.dirname(source),'tex'),os.path.join(output,'tex'))
doc=c4d.documents.LoadDocument(source,c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
if doc is None:raise RuntimeError('Source native project did not open')
doc.SetDocumentPath(output);c4d.documents.InsertBaseDocument(doc);c4d.documents.SetActiveDocument(doc)
def walk(o):
    while o:
        yield o
        for child in walk(o.GetDown()):yield child
        o=o.GetNext()
objects=list(walk(doc.GetFirstObject()));byname=dict((o.GetName(),o) for o in objects)
def chip_signature():
    chip=next(o for o in objects if o.GetName().startswith('01 CHIP -'))
    rows=[]
    for o in walk(chip.GetDown()):
        matrix=o.GetMg();row=[o.GetName(),o.GetType(),[[v.x,v.y,v.z] for v in [matrix.off,matrix.v1,matrix.v2,matrix.v3]]]
        if o.CheckType(c4d.Opolygon):row += [[[v.x,v.y,v.z] for v in o.GetAllPoints()],[[p.a,p.b,p.c,p.d] for p in o.GetAllPolygons()]]
        if o.CheckType(c4d.Ocube):v=o[c4d.PRIM_CUBE_LEN];row += [[v.x,v.y,v.z],o[c4d.PRIM_CUBE_FRAD],o[c4d.PRIM_CUBE_SUBF]]
        rows.append(row)
    return hashlib.sha256(json.dumps(rows,sort_keys=True).encode('utf-8')).hexdigest()
before=chip_signature()
materials={};m=doc.GetFirstMaterial()
while m:materials[m.GetName()]=m;m=m.GetNext()
def change_material(m,spec):
    if 'displayColor' in spec:m[c4d.MATERIAL_COLOR_COLOR]=V(*spec['displayColor'])
    if 'bump' in spec:m[c4d.MATERIAL_BUMP_STRENGTH]=spec['bump']
    if 'diffuse' in spec:m[c4d.MATERIAL_USE_COLOR]=spec['diffuse']>0;m[c4d.MATERIAL_COLOR_BRIGHTNESS]=spec['diffuse']
    if 'luminance' in spec:m[c4d.MATERIAL_USE_LUMINANCE]=True;m[c4d.MATERIAL_LUMINANCE_COLOR]=V(*spec['luminance']);m[c4d.MATERIAL_LUMINANCE_BRIGHTNESS]=1
    layer=m.GetReflectionLayerIndex(0)
    if layer:
        lid=layer.GetDataID()
        for field,constant in [('roughness',c4d.REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS),('reflection',c4d.REFLECTION_LAYER_MAIN_VALUE_REFLECTION),('samples',c4d.REFLECTION_LAYER_SAMPLING_SAMPLE_COUNT),('specular',c4d.REFLECTION_LAYER_MAIN_VALUE_SPECULAR)]:
            if field in spec:m[lid+constant]=spec[field]
        if 'tint' in spec:m[lid+c4d.REFLECTION_LAYER_COLOR_COLOR]=V(*spec['tint'])
        if 'coloredSpecular' in spec:m[lid+c4d.REFLECTION_LAYER_MAIN_COLORED_SPECULAR]=spec['coloredSpecular']
        if 'metal' in spec:m[lid+c4d.REFLECTION_LAYER_FRESNEL_METAL]=getattr(c4d,'REFLECTION_FRESNEL_METAL_'+spec['metal'].upper())
    m.Message(c4d.MSG_UPDATE);m.Update(True,True)
for name,spec in settings['materials'].items():change_material(materials[name],spec)
for spec in settings.get('materialGroups',[]):
    m=materials[spec['source']].GetClone();m.SetName(spec['name']);doc.InsertMaterial(m);change_material(m,spec)
    for o in objects:
        if o.GetName().startswith(spec['objectPrefix']):o.GetTag(c4d.Ttexture)[c4d.TEXTURETAG_MATERIAL]=m
for name,spec in settings['lights'].items():
    o=byname[name];o[c4d.LIGHT_BRIGHTNESS]=spec['power']
    if 'color' in spec:o[c4d.LIGHT_COLOR]=V(*spec['color'])
    if 'position' in spec:
        o.SetAbsPos(V(*spec['position']));o.SetAbsRot(c4d.utils.VectorToHPB((V(0,6,0)-o.GetAbsPos()).GetNormalized()))
    if 'size' in spec:o[c4d.LIGHT_AREADETAILS_SIZEX]=spec['size'][0];o[c4d.LIGHT_AREADETAILS_SIZEY]=spec['size'][1]
    o[c4d.LIGHT_AREADETAILS_SAMPLES]=settings.get('lightSamples',48)
for name,spec in settings['cards'].items():
    o=byname[name];tag=o.GetTag(c4d.Ttexture);m=tag[c4d.TEXTURETAG_MATERIAL].GetClone()
    m.SetName('Match '+name);doc.InsertMaterial(m);tag[c4d.TEXTURETAG_MATERIAL]=m
    m[c4d.MATERIAL_LUMINANCE_BRIGHTNESS]=spec['brightness'];m[c4d.MATERIAL_LUMINANCE_COLOR]=V(*spec.get('color',[1,1,1]))
    if 'position' in spec:o.SetAbsPos(V(*spec['position']));o.SetAbsRot(c4d.utils.VectorToHPB((V(0,6,0)-o.GetAbsPos()).GetNormalized()))
    if 'size' in spec:o[c4d.PRIM_CUBE_LEN]=V(*spec['size'])
    m.Message(c4d.MSG_UPDATE);m.Update(True,True)
env=materials['10 Dim studio reflection environment'];env[c4d.MATERIAL_LUMINANCE_BRIGHTNESS]=settings['environment'];env.Message(c4d.MSG_UPDATE)
for name in settings.get('hideStudioObjects',[]):byname[name][c4d.ID_BASEOBJECT_VISIBILITY_RENDER]=c4d.OBJECT_OFF
for name,spec in settings.get('studioObjects',{}).items():
    if 'size' in spec:byname[name][c4d.PRIM_CUBE_LEN]=V(*spec['size'])
assert chip_signature()==before,'Chip geometry or transforms changed'
rd=doc.GetActiveRenderData()
width,height=settings.get('resolution',[960,640]);rd[c4d.RDATA_XRES]=width;rd[c4d.RDATA_YRES]=height
rd[c4d.RDATA_AATHRESHOLD]=.03
doc.ExecutePasses(None,True,True,True,c4d.BUILDFLAGS_NONE)
native=os.path.join(output,'MetalChip_v002.c4d')
if not c4d.documents.SaveDocument(doc,native,c4d.SAVEDOCUMENTFLAGS_DONTADDTORECENTLIST,c4d.FORMAT_C4DEXPORT):raise RuntimeError('Native save failed')
reopened=c4d.documents.LoadDocument(native,c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
if reopened is None:raise RuntimeError('Native reopen failed')
doc=reopened;c4d.documents.InsertBaseDocument(doc);c4d.documents.SetActiveDocument(doc);doc.SetDocumentPath(output)
objects=list(walk(doc.GetFirstObject()));assert chip_signature()==before
rd=doc.GetActiveRenderData();data=rd.GetData();bmp=c4d.bitmaps.BaseBitmap();bmp.Init(width,height)
print('SAVED_REOPENED_AND_GEOMETRY_UNCHANGED',before);sys.stdout.flush()
started=time.time();marks=set()
def progress(amount,phase):
    mark=(int(phase),int(amount*4))
    if mark not in marks:marks.add(mark);print('RENDER_PROGRESS',mark);sys.stdout.flush()
result=c4d.documents.RenderDocument(doc,data,bmp,c4d.RENDERFLAGS_EXTERNAL,prog=progress)
if result!=c4d.RENDERRESULT_OK:raise RuntimeError('Render failed: %s'%result)
png=os.path.join(output,'MetalChip_v002.png')
if bmp.Save(png,c4d.FILTER_PNG)!=c4d.IMAGERESULT_OK:raise RuntimeError('PNG save failed')
def sha(p):return hashlib.sha256(open(p,'rb').read()).hexdigest()
audit={'software':'Cinema 4D R21','version':c4d.GetC4DVersion(),'nativeReopened':True,'geometryUnchanged':True,'chipGeometrySignature':before,'sourceNativeSha256':sha(source),'settingsSha256':sha(settings_file),'resolution':[width,height],'renderSeconds':time.time()-started,'renderResult':int(result),'files':{'c4d':sha(native),'png':sha(png)},'review':'pending'}
with open(os.path.join(output,'look-audit.json'),'w') as f:json.dump(audit,f,indent=2)
print('LOOK_RENDER_DONE',audit);sys.stdout.flush()
