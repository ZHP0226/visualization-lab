# coding: utf-8
# SPDX-License-Identifier: MIT
from __future__ import print_function,division
import os,sys,math,json,time,hashlib
import c4d
from common import write_glb,digest

def inspect_export_render(native, output, reference, preview):
    doc=c4d.documents.LoadDocument(native,c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
    if doc is None:raise RuntimeError('Saved native C4D project did not reopen')
    c4d.documents.InsertBaseDocument(doc);c4d.documents.SetActiveDocument(doc)
    doc.SetDocumentPath(output)
    doc.ExecutePasses(None,True,True,True,c4d.BUILDFLAGS_NONE)
    def walk(o):
        while o:
            yield o
            for ch in walk(o.GetDown()):yield ch
            o=o.GetNext()
    objects=list(walk(doc.GetFirstObject()))
    def camera_state(document):
        result=[]
        for cam in walk(document.GetFirstObject()):
            if not cam.CheckType(c4d.Ocamera):continue
            m=cam.GetMg()
            result.append([cam.GetName(),[[v.x,v.y,v.z] for v in [m.off,m.v1,m.v2,m.v3]],[cam[k] for k in [c4d.CAMERA_PROJECTION,c4d.CAMERAOBJECT_APERTURE,c4d.CAMERA_FOCUS,c4d.CAMERAOBJECT_FILM_OFFSET_X,c4d.CAMERAOBJECT_FILM_OFFSET_Y]]])
        return result
    source_doc=c4d.documents.LoadDocument(os.path.join(output,'MetalChip_v001.c4d'),c4d.SCENEFILTER_OBJECTS|c4d.SCENEFILTER_MATERIALS,None)
    assert source_doc is not None
    assert camera_state(doc)==camera_state(source_doc),'Camera changed'
    settings=json.load(open(os.path.join(output,'MetalChip_v002_reproduction','look-settings.json')))
    native_objects_by_name=dict((o.GetName(),o) for o in objects)
    for name,spec in settings['lights'].items():
        assert abs(native_objects_by_name[name][c4d.LIGHT_BRIGHTNESS]-spec['power'])<1e-7
    checks_camera=True
    model=next(o for o in objects if o.GetName().startswith('01 CHIP -'))
    checks={'nativeReopened':True,'goldBlocks':sum(o.GetName().startswith('Gold block C') for o in objects),'contactPads':sum(o.GetName().startswith(('North contact ','South contact ','West contact ','East contact ')) for o in objects),'cornerHoles':sum('Counterbored_Through_Hole' in o.GetName() for o in objects),'nativeObjectCount':len(objects),'cameras':sum(o.CheckType(c4d.Ocamera) for o in objects),'areaLights':sum(o.CheckType(c4d.Olight) for o in objects)}
    assert checks['goldBlocks']==54 and checks['contactPads']==44 and checks['cornerHoles']==4,checks
    material_specs=[];material_ids={}
    mat=doc.GetFirstMaterial()
    missing=[]
    while mat:
        name=mat.GetName();key='material_%02d'%len(material_specs)
        color=mat[c4d.MATERIAL_COLOR_COLOR]
        gold='gold' in name.lower();silver='silver' in name.lower()
        layer=mat.GetReflectionLayerIndex(0)
        roughness=float(mat[layer.GetDataID()+c4d.REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS]) if layer else .5
        material_specs.append({'id':key,'color':[color.x,color.y,color.z],'metallic':1 if gold or silver else 0,'roughness':roughness})
        material_ids[name]=key
        sh=mat.GetFirstShader()
        while sh:
            if sh.CheckType(c4d.Xbitmap):
                filename=sh[c4d.BITMAPSHADER_FILENAME]
                if not os.path.isfile(os.path.join(output,filename)):missing.append(filename)
            sh=sh.GetNext()
        mat=mat.GetNext()
    assert not missing,missing
    meshes=[];specs=[]
    def effective_material(o,inherited):
        for tag in o.GetTags():
            if tag.CheckType(c4d.Ttexture):
                m=tag[c4d.TEXTURETAG_MATERIAL]
                if m:return material_ids[m.GetName()]
        return inherited
    def emit(poly,matrix,label,group,material):
        pts=[]
        for p in poly.GetAllPoints():
            q=matrix*p
            pts.append([q.x*.001,-q.z*.001,q.y*.001])
        triangles=[]
        for p in poly.GetAllPolygons():
            triangles.append([p.a,p.b,p.c])
            if p.c!=p.d:triangles.append([p.a,p.c,p.d])
        if not pts or not triangles:return
        key='part_%04d'%len(meshes)
        meshes.append({'id':key,'vertices':pts,'triangles':triangles})
        low=[min(p[i] for p in pts) for i in range(3)];high=[max(p[i] for p in pts) for i in range(3)]
        specs.append({'id':key,'name':label,'group':group,'shape':'custom','size':[high[i]-low[i] for i in range(3)],'position':[(high[i]+low[i])/2 for i in range(3)],'material':material})
    def cached(o,parent_matrix,label,group,material):
        while o:
            matrix=parent_matrix*o.GetMl()
            if o.CheckType(c4d.Opolygon):emit(o,matrix,label,group,effective_material(o,material))
            cached(o.GetDown(),matrix,label,group,material)
            o=o.GetNext()
    def native_objects(o,group,material):
        while o:
            m=effective_material(o,material)
            if o.CheckType(c4d.Opolygon):emit(o,o.GetMg(),o.GetName(),group,m)
            elif o.GetCache():cached(o.GetCache(),o.GetMg(),o.GetName(),group,m)
            native_objects(o.GetDown(),group,m)
            o=o.GetNext()
    section=model.GetDown()
    while section:
        # Visit only this section; sibling sections get their own semantic group.
        material=effective_material(section,material_specs[0]['id'])
        native_objects(section.GetDown(),section.GetName(),material)
        section=section.GetNext()
    assert len(meshes)>300,len(meshes)
    # Independent vertical rays through each mounting-hole center, using actual evaluated triangles.
    blocked=[]
    for sx in [-1,1]:
      for sz in [-1,1]:
        x,y=sx*.04325,-sz*.04325
        for mesh in meshes:
          for t in mesh['triangles']:
            a,b,c=[mesh['vertices'][i] for i in t]
            det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(det)<1e-16:continue
            u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det
            v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det
            if u>1e-8 and v>1e-8 and u+v<1-1e-8:blocked.append([sx,sz,mesh['id']]);break
    assert not blocked,blocked[:8]
    checks['cameraUnchanged']=True;checks['updatedLightPowersVerified']=True;checks['holeAxesClear']=True;checks['exportedMeshes']=len(meshes);checks['missingTextures']=missing
    plan={'materials':material_specs,'objects':specs}
    model_file=os.path.join(output,'MetalChip_v002.glb')
    write_glb(model_file,plan,meshes)
    with open(os.path.join(output,'geometry_v002.json'),'w') as f:json.dump({'objects':specs,'checks':checks},f,indent=2)
    with open(os.path.join(output,'MetalChip_v002_reproduction','export-audit.json'),'w') as f:json.dump({'checks':checks,'materials':material_specs,'files':{'glb':digest(model_file),'native':digest(native)}},f,indent=2)
    print('V002_NATIVE_REOPENED_EXPORTED',checks);sys.stdout.flush()

if __name__=='__main__':
    root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    inspect_export_render(os.path.join(root,'MetalChip_v002.c4d'),root,os.path.join(root,'MetalChip_reference.png'),False)
