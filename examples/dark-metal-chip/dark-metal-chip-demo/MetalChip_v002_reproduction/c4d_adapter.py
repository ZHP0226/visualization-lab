# coding: utf-8
from __future__ import print_function, division
import argparse,os,sys,json,io
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import c4d
from common import load_plan,geometry_audit,write_glb,write_audit,digest
p=argparse.ArgumentParser();p.add_argument('--job',required=True)
a=argparse.Namespace(**json.load(io.open(p.parse_args().job,encoding='utf-8')))
plan=load_plan(a.plan);native=a.stem+'.c4d'
if sys.version_info[0]<3:native=native.encode('ascii')
def vec(v):return c4d.Vector(v[0],v[2],-v[1])
def canonical(v):return [v.x,-v.z,v.y]
def aim(obj,target):obj.SetAbsRot(c4d.utils.VectorToHPB(vec(target)-obj.GetAbsPos()))
def load():
    d=c4d.documents.LoadDocument(native,c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
    if d is None:raise ValueError('Saved C4D project could not be reopened')
    return d
def render(doc,file):
    if sys.version_info[0]<3:file=file.encode('ascii')
    rd=doc.GetActiveRenderData();w=int(rd[c4d.RDATA_XRES]);h=int(rd[c4d.RDATA_YRES]);bmp=c4d.bitmaps.MultipassBitmap(w,h,c4d.COLORMODE_RGB)
    result=c4d.documents.RenderDocument(doc,rd.GetData(),bmp,c4d.RENDERFLAGS_EXTERNAL)
    if result!=c4d.RENDERRESULT_OK:raise RuntimeError('C4D render failed: '+str(result))
    if bmp.Save(file,c4d.FILTER_PNG,c4d.BaseContainer(),c4d.SAVEBIT_0)!=c4d.IMAGERESULT_OK:raise RuntimeError('PNG export failed')
if a.replay_output:
    before=digest(native);render(load(),a.replay_output);assert digest(native)==before;print('FRAMEWORK_REPLAY_OK')
else:
    if plan['camera']['projection']!='perspective':raise ValueError('The verified C4D baseline currently supports perspective; implement and verify an explicit orthographic camera adapter before using it.')
    doc=c4d.documents.BaseDocument();mats={};groups={}
    for spec in plan['materials']:
        m=c4d.Material();m.SetName(spec['id']);m[c4d.MATERIAL_COLOR_COLOR]=c4d.Vector(*spec['color']);m[c4d.MATERIAL_USE_REFLECTION]=False;m[c4d.MATERIAL_USE_SPECULAR]=True;m[c4d.MATERIAL_SPECULAR_WIDTH]=spec.get('roughness',.5);doc.InsertMaterial(m);mats[spec['id']]=m
    for spec in plan['objects']:
        shape=spec['shape'];size=spec['size']
        if shape=='box':obj=c4d.BaseObject(c4d.Ocube);obj[c4d.PRIM_CUBE_LEN]=c4d.Vector(size[0],size[2],size[1])
        elif shape=='sphere':obj=c4d.BaseObject(c4d.Osphere);obj[c4d.PRIM_SPHERE_RAD]=1;obj[c4d.PRIM_SPHERE_SUB]=32;obj.SetAbsScale(c4d.Vector(size[0]/2,size[2]/2,size[1]/2))
        elif shape=='cylinder':obj=c4d.BaseObject(c4d.Ocylinder);obj[c4d.PRIM_CYLINDER_RADIUS]=1;obj[c4d.PRIM_CYLINDER_HEIGHT]=2;obj[c4d.PRIM_CYLINDER_SEG]=48;obj.SetAbsScale(c4d.Vector(size[0]/2,size[2]/2,size[1]/2))
        else:raise ValueError('Custom geometry requires a project-specific builder using the common audit/export utilities.')
        obj.SetName(spec['id']);group=spec.get('group','Structure')
        if group not in groups:groups[group]=c4d.BaseObject(c4d.Onull);groups[group].SetName(group);doc.InsertObject(groups[group])
        obj.InsertUnderLast(groups[group]);obj.SetAbsPos(vec(spec['position']));tag=c4d.TextureTag();tag.SetMaterial(mats[spec['material']]);obj.InsertTag(tag);obj.MakeTag(c4d.Tphong)
    c=plan['camera'];cam=c4d.BaseObject(c4d.Ocamera);cam.SetName('Camera');doc.InsertObject(cam);cam.SetAbsPos(vec(c['position']));aim(cam,c['target']);cam[c4d.CAMERA_FOCUS]=c.get('focalLength',45);doc.GetRenderBaseDraw().SetSceneCamera(cam)
    for index,spec in enumerate(plan['lights']):
        light=c4d.BaseObject(c4d.Olight);light.SetName('Light_'+str(index));doc.InsertObject(light);light.SetAbsPos(vec(spec['position']));aim(light,c['target']);light[c4d.LIGHT_TYPE]=c4d.LIGHT_TYPE_AREA;light[c4d.LIGHT_COLOR]=c4d.Vector(*spec['color']);light[c4d.LIGHT_BRIGHTNESS]=spec['power']/500.;light[c4d.LIGHT_AREADETAILS_SIZEX]=spec['size'];light[c4d.LIGHT_AREADETAILS_SIZEY]=spec['size'];light[c4d.LIGHT_SHADOWTYPE]=c4d.LIGHT_SHADOWTYPE_AREA
    r=plan['render'];rd=doc.GetActiveRenderData();rd[c4d.RDATA_TRUECOLORDITHERING]=False;rd[c4d.RDATA_XRES]=r['width'];rd[c4d.RDATA_YRES]=r['height'];rd[c4d.RDATA_RENDERENGINE]=c4d.RDATA_RENDERENGINE_STANDARD;rd[c4d.RDATA_ANTIALIASING]=c4d.RDATA_ANTIALIASING_BEST;rd[c4d.RDATA_AAMINLEVEL]=c4d.RDATA_AAMINLEVEL_1;rd[c4d.RDATA_AAMAXLEVEL]=c4d.RDATA_AAMAXLEVEL_4
    doc.ExecutePasses(None,True,True,True,c4d.BUILDFLAGS_0)
    if not c4d.documents.SaveDocument(doc,native,c4d.SAVEDOCUMENTFLAGS_0,c4d.FORMAT_C4DEXPORT):raise RuntimeError('Saving native C4D project failed')
    doc=load();rd=doc.GetActiveRenderData();doc.ExecutePasses(None,True,True,True,c4d.BUILDFLAGS_0);poly=doc.Polygonize();meshes=[]
    for spec in plan['objects']:
        obj=poly.SearchObject(spec['id'])
        if obj is None or not obj.CheckType(c4d.Opolygon):raise ValueError('Saved evaluated mesh missing: '+spec['id'])
        matrix=obj.GetMg();points=[canonical(matrix*p) for p in obj.GetAllPoints()];triangles=[]
        for q in obj.GetAllPolygons():
            triangles.append([q.a,q.b,q.c])
            if q.c!=q.d:triangles.append([q.a,q.c,q.d])
        meshes.append(dict(id=spec['id'],vertices=points,triangles=triangles))
    geometry_audit(plan,meshes);write_glb(a.stem+'.glb',plan,meshes)
    if not a.no_render:render(doc,a.stem+'.png')
    write_audit(a.plan,plan,a.stem,meshes,'c4d',c4d.GetC4DVersion(),native,None if a.no_render else a.stem+'.png',dict(engine='C4D Standard',width=int(rd[c4d.RDATA_XRES]),height=int(rd[c4d.RDATA_YRES]),antialiasingMin=1,antialiasingMax=4,materialModel='Legacy color/specular width; metallic is GLB metadata only',trueColorDithering=False,seedApplicability='No stochastic procedural geometry is used; Cycles sample/seed parameters are not C4D renderer parameters.'))
    print('FRAMEWORK_BUILD_AND_AUDIT_OK')
