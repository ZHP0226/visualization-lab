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
    model=next(o for o in objects if o.GetName().startswith('01 CHIP -'))
    checks={'nativeReopened':True,'goldBlocks':sum(o.GetName().startswith('Gold block C') for o in objects),'contactPads':sum(o.GetName().startswith(('North contact ','South contact ','West contact ','East contact ')) for o in objects),'cornerHoles':sum('Counterbored_Through_Hole' in o.GetName() for o in objects),'nativeObjectCount':len(objects),'cameras':sum(o.CheckType(c4d.Ocamera) for o in objects),'areaLights':sum(o.CheckType(c4d.Olight) for o in objects)}
    assert checks['goldBlocks']==54 and checks['contactPads']==44 and checks['cornerHoles']==4,checks
    material_specs=[];material_ids={}
    mat=doc.GetFirstMaterial()
    missing=[]
    while mat:
        name=mat.GetName();key='material_%02d'%len(material_specs)
        color=mat[c4d.MATERIAL_COLOR_COLOR]
        gold='Gold' in name;silver='Silver' in name
        material_specs.append({'id':key,'color':[color.x,color.y,color.z],'metallic':1 if gold or silver else 0,'roughness':.21 if gold else .23 if silver else .31})
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
    checks['holeAxesClear']=True;checks['exportedMeshes']=len(meshes);checks['missingTextures']=missing
    plan={'materials':material_specs,'objects':specs}
    model_file=os.path.join(output,'MetalChip_v001.glb')
    write_glb(model_file,plan,meshes)
    with open(os.path.join(output,'geometry.json'),'w') as f:json.dump({'objects':specs,'checks':checks},f,indent=2)
    before=digest(native)
    rd=doc.GetActiveRenderData();data=rd.GetData()
    width,height=(960,640) if preview else (1536,1024)
    data[c4d.RDATA_XRES]=width;data[c4d.RDATA_YRES]=height
    bmp=c4d.bitmaps.BaseBitmap();bmp.Init(width,height)
    started=time.time();marks=set()
    def progress(amount,phase):
        mark=(int(phase),int(amount*4))
        if mark not in marks:marks.add(mark);print('RENDER_PROGRESS',mark);sys.stdout.flush()
    result=c4d.documents.RenderDocument(doc,data,bmp,c4d.RENDERFLAGS_EXTERNAL,prog=progress)
    if result!=c4d.RENDERRESULT_OK:raise RuntimeError('C4D render failed: %s'%result)
    image=os.path.join(output,'MetalChip_v001.png')
    saved=bmp.Save(image,c4d.FILTER_PNG)
    if saved!=c4d.IMAGERESULT_OK:raise RuntimeError('PNG save failed: %s'%saved)
    assert digest(native)==before,'Render must not rewrite the native model'
    times={'reference':os.path.getmtime(reference),'native':os.path.getmtime(native),'model':os.path.getmtime(model_file),'render':os.path.getmtime(image)}
    assert times['reference']<=times['native']<=times['model']<=times['render'],times
    audit={'software':'Cinema 4D R21','version':c4d.GetC4DVersion(),'workflow':'reference -> fresh procedural modeling -> saved native reopened -> GLB -> C4D render','checks':checks,'actualFileModificationTimes':times,'referenceSha256':digest(reference),'render':{'engine':'Cinema 4D Standard','width':width,'height':height,'result':int(result),'seconds':time.time()-started},'files':{ext:{'name':'MetalChip_v001.'+ext,'sha256':digest(os.path.join(output,'MetalChip_v001.'+ext))} for ext in ['c4d','glb','png']},'review':{'status':'pending','scientificBoundary':'Illustrative chip packaging and lighting; not a fabricated device or measured optical data'},'glbMaterialBoundary':'Editable geometry with approximate PBR materials; native C4D shaders remain in the C4D project.'}
    with open(os.path.join(output,'audit.json'),'w') as f:json.dump(audit,f,indent=2)
    print('EPISODE3_C4D_REBUILT_REOPENED_EXPORTED_RENDERED',checks);sys.stdout.flush()
