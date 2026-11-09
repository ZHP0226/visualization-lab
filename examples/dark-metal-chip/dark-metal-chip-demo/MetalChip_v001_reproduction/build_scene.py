# -*- coding: utf-8 -*-
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 ZHP0226
# Rebuilds a new Cinema 4D scene using this project's reusable chip geometry.
from __future__ import print_function
import c4d, os, sys, math, json, time, traceback
from c4d import Vector as V

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(next((s.split('=',1)[1] for s in sys.argv if s.startswith('--output-dir=')),os.path.join(HERE,'output')))
if os.path.exists(os.path.join(ROOT,'MetalChip_v001.c4d')):
    raise RuntimeError('Output exists; choose a new --output-dir. Existing projects are never overwritten.')
if not os.path.isdir(ROOT): os.makedirs(ROOT)
import shutil
if not os.path.isdir(os.path.join(ROOT,'tex')): shutil.copytree(os.path.join(HERE,'tex'),os.path.join(ROOT,'tex'))
PREVIEW = '--final' not in sys.argv
VERSION = 'MetalChip_v001'
doc = c4d.documents.BaseDocument()
units=doc[c4d.DOCUMENT_DOCUNIT]
units.SetUnitScale(1.0,c4d.DOCUMENT_UNIT_MM)
doc[c4d.DOCUMENT_DOCUNIT]=units
doc.SetDocumentName('MetalChip_v001.c4d')
doc.SetDocumentPath(ROOT)
c4d.documents.InsertBaseDocument(doc)
c4d.documents.SetActiveDocument(doc)
counts = {}

def insert(obj, name, parent=None):
    obj.SetName(name)
    if parent: obj.InsertUnderLast(parent)
    else: doc.InsertObject(obj)
    counts['objects'] = counts.get('objects', 0) + 1
    return obj

def group(name, parent=None):
    return insert(c4d.BaseObject(c4d.Onull), name, parent)

def assign(obj, mat):
    tag = c4d.TextureTag()
    tag[c4d.TEXTURETAG_MATERIAL] = mat
    tag[c4d.TEXTURETAG_PROJECTION] = c4d.TEXTURETAG_PROJECTION_UVW
    obj.InsertTag(tag)

def bitmap_shader(mat, filename):
    shader = c4d.BaseShader(c4d.Xbitmap)
    shader[c4d.BITMAPSHADER_FILENAME] = 'tex/' + filename
    mat.InsertShader(shader)
    return shader

def material(name, color, metal=False, rough=0.2, reflection=0.75, bump=None, bump_strength=0.006):
    mat = c4d.Material()
    mat.SetName(name)
    mat.RemoveReflectionAllLayers()
    mat[c4d.MATERIAL_USE_COLOR] = not metal
    mat[c4d.MATERIAL_COLOR_COLOR] = V(*color)
    mat[c4d.MATERIAL_COLOR_BRIGHTNESS] = 0.12 if metal else 0.8
    mat[c4d.MATERIAL_USE_REFLECTION] = reflection > 0
    if reflection > 0:
        layer=mat.AddReflectionLayer()
        layer.SetName('Brushed conductor' if metal else 'Surface reflection')
        lid=layer.GetDataID()
        mat[lid+c4d.REFLECTION_LAYER_MAIN_DISTRIBUTION] = c4d.REFLECTION_DISTRIBUTION_GGX
        mat[lid+c4d.REFLECTION_LAYER_MAIN_VALUE_ROUGHNESS] = rough
        mat[lid+c4d.REFLECTION_LAYER_MAIN_VALUE_REFLECTION] = reflection
        mat[lid+c4d.REFLECTION_LAYER_MAIN_VALUE_SPECULAR] = 0.28 if metal else 0.12
        mat[lid+c4d.REFLECTION_LAYER_MAIN_COLORED_SPECULAR] = metal
        mat[lid+c4d.REFLECTION_LAYER_COLOR_COLOR] = V(1)
        mat[lid+c4d.REFLECTION_LAYER_FRESNEL_MODE] = c4d.REFLECTION_FRESNEL_CONDUCTOR if metal else c4d.REFLECTION_FRESNEL_DIELECTRIC
        if metal:
            mat[lid+c4d.REFLECTION_LAYER_FRESNEL_METAL] = c4d.REFLECTION_FRESNEL_METAL_ALUMINUM if 'Silver' in name else c4d.REFLECTION_FRESNEL_METAL_GOLD
        if not metal: mat[lid+c4d.REFLECTION_LAYER_FRESNEL_VALUE_IOR] = 1.48
        mat[lid+c4d.REFLECTION_LAYER_SAMPLING_SAMPLE_COUNT] = 2.0 if PREVIEW else 2.5
    if bump:
        shader=bitmap_shader(mat,bump)
        mat[c4d.MATERIAL_USE_BUMP]=True
        mat[c4d.MATERIAL_BUMP_SHADER]=shader
        mat[c4d.MATERIAL_BUMP_STRENGTH]=bump_strength
    mat.Message(c4d.MSG_UPDATE)
    mat.Update(True,True)
    doc.InsertMaterial(mat)
    return mat

silver=material('01 Brushed Silver Frame',(0.73,0.76,0.80),True,0.23,0.83,'brushed_height.png',0.008)
gold=material('02 Champagne Gold Die',(0.92,0.76,0.47),True,0.21,0.82,'brushed_height.png',0.004)
gold_polish=material('03 Polished Gold Edges',(0.98,0.79,0.47),True,0.14,0.8)
gold_trace=material('04 Fine Gold Conductors',(0.97,0.79,0.48),True,0.19,0.82)
black=material('05 Black Ceramic Base',(0.018,0.019,0.023),False,0.31,0.28,'ceramic_height.png',0.006)
substrate=material('06 Recessed Graphite Substrate',(0.18,0.165,0.14),False,0.3,0.3,'brushed_height.png',0.009)
floor_mat=material('07 Dark Satin Studio Floor',(0.15,0.153,0.16),False,0.32,0.32,'graphite_height.png',0.005)
wall_mat=material('08 Black Studio Wall',(0.012,0.012,0.014),False,0.6,0.03)

def mesh(name,points,polygons,mat,parent=None,phong=True):
    obj=c4d.PolygonObject(len(points),len(polygons))
    obj.SetAllPoints([V(*p) for p in points])
    for i,p in enumerate(polygons): obj.SetPolygon(i,c4d.CPolygon(*p))
    uv=c4d.UVWTag(len(polygons))
    for i,face in enumerate(polygons):
        p=[V(*points[k]) for k in face]
        while len(p)<4:p.append(p[-1])
        normal=(p[1]-p[0]).Cross(p[2]-p[0])
        if abs(normal.y)>=max(abs(normal.x),abs(normal.z)):
            coords=[V((q.x+50)/100,(q.z+50)/100,0) for q in p]
        elif abs(normal.x)>abs(normal.z):
            coords=[V((q.z+50)/100,q.y/100,0) for q in p]
        else:coords=[V((q.x+50)/100,q.y/100,0) for q in p]
        uv.SetSlow(i,*coords)
    obj.InsertTag(uv)
    if phong:
        tag=c4d.BaseTag(c4d.Tphong)
        tag[c4d.PHONGTAG_PHONG_ANGLELIMIT]=True
        tag[c4d.PHONGTAG_PHONG_ANGLE]=math.radians(35)
        obj.InsertTag(tag)
    obj.Message(c4d.MSG_UPDATE)
    insert(obj,name,parent)
    if mat:assign(obj,mat)
    counts['polygons']=counts.get('polygons',0)+len(polygons)
    return obj

def cube(name,size,pos,mat,parent=None,bevel=0.1):
    obj=c4d.BaseObject(c4d.Ocube)
    obj[c4d.PRIM_CUBE_LEN]=V(*size)
    if bevel>0:
        obj[c4d.PRIM_CUBE_DOFILLET]=True
        obj[c4d.PRIM_CUBE_FRAD]=min(bevel,min(size)*0.45)
        obj[c4d.PRIM_CUBE_SUBF]=3
    obj.SetAbsPos(V(*pos))
    insert(obj,name,parent)
    assign(obj,mat)
    return obj

def octagon(half,cut):
    return [(-half+cut,-half),(half-cut,-half),(half,-half+cut),(half,half-cut),(half-cut,half),(-half+cut,half),(-half,half-cut),(-half,-half+cut)]

def rounded_square(half,radius):
    points=[]
    for cx,cz,start in [(half-radius,-half+radius,-90),(half-radius,half-radius,0),(-half+radius,half-radius,90),(-half+radius,-half+radius,180)]:
        for i in range(9):
            a=math.radians(start+i*90/8.)
            points.append((cx+radius*math.cos(a),cz+radius*math.sin(a)))
    return points

def closed_rings(name,rings,mat,parent):
    n=len(rings[0]); points=[]; polys=[]
    for ring in rings:points.extend(ring)
    for k in range(len(rings)):
        nxt=(k+1)%len(rings)
        for i in range(n):
            j=(i+1)%n
            polys.append((k*n+i,nxt*n+i,nxt*n+j,k*n+j))
    return mesh(name,points,polys,mat,parent)

def solid_prism(name,poly,y0,y1,mat,parent,bevel=0.1):
    cx=sum(p[0] for p in poly)/len(poly);cz=sum(p[1] for p in poly)/len(poly)
    def contour(b,y):
        out=[]
        for x,z in poly:
            rad=math.hypot(x-cx,z-cz)
            out.append((cx+(x-cx)*(1-b/rad),y,cz+(z-cz)*(1-b/rad)))
        return out
    rings=[contour(bevel,y0),contour(0,y0+bevel),contour(0,y1-bevel),contour(bevel,y1)]
    n=len(poly);points=sum(rings,[]);polys=[]
    for k in range(3):
        for i in range(n):
            j=(i+1)%n
            polys.append((k*n+i,(k+1)*n+i,(k+1)*n+j,k*n+j))
    points.extend([(cx,y0,cz),(cx,y1,cz)])
    for i in range(n):
        j=(i+1)%n
        polys.append((4*n,i,j))
        polys.append((4*n+1,3*n+j,3*n+i))
    return mesh(name,points,polys,mat,parent)

def square_ring(name,outer,inner,y0,y1,mat,parent,bevel=0.12,cut=3.5):
    levels=[(outer-bevel,cut,y0),(outer,cut,y0+bevel),(outer,cut,y1-bevel),(outer-bevel,cut,y1),(inner+bevel,cut,y1),(inner,cut,y1-bevel),(inner,cut,y0+bevel),(inner+bevel,cut,y0)]
    rings=[[(x,y,z) for x,z in octagon(h,c)] for h,c,y in levels]
    return closed_rings(name,rings,mat,parent)

def radial_hit(poly,cx,cz,angle):
    dx=math.cos(angle);dz=math.sin(angle);best=1e20
    for i,(ax,az) in enumerate(poly):
        bx,bz=poly[(i+1)%len(poly)];ex=bx-ax;ez=bz-az
        det=dx*(-ez)-(-ex)*dz
        if abs(det)<1e-10:continue
        tx=ax-cx;tz=az-cz
        t=(tx*(-ez)+ex*tz)/det
        u=(dx*tz-dz*tx)/det
        if t>0 and -1e-8<=u<=1+1e-8:best=min(best,t)
    if best>1e10:raise RuntimeError('Ray did not intersect corner pad')
    return best

def mounting_pad(sx,sz,parent,base=False):
    # Four physical through-holes, machined counterbores, top and bottom bevels.
    lo=32.4;hi=50.;cut=3.8
    poly=[(lo,lo+1.2),(lo+1.2,lo),(hi-0.8,lo),(hi,lo+0.8),(hi,hi-cut),(hi-cut,hi),(lo+0.8,hi),(lo,hi-0.8)]
    poly=[(sx*x,sz*z) for x,z in poly]
    if sx*sz<0:poly.reverse()
    cx,cz=sx*43.25,sz*43.25
    angles=set(round(i*2*math.pi/128,9) for i in range(128))
    angles.update(round(math.atan2(z-cz,x-cx)%(2*math.pi),9) for x,z in poly)
    angles=sorted(angles)
    radii=[radial_hit(poly,cx,cz,a) for a in angles]
    rings=[]
    outer_levels=[(0.13,0.0),(0,0.15),(0,1.57),(0.13,1.72)] if base else [(0.13,1.65),(0,1.80),(0,7.82),(0.13,8.0)]
    for inset,y in outer_levels:
        rings.append([(cx+(rad-inset)*math.cos(a),y,cz+(rad-inset)*math.sin(a)) for a,rad in zip(angles,radii)])
    hole_levels=[(1.66,1.72),(1.66,0.0)] if base else [(2.20,8.0),(2.04,7.83),(2.04,5.4),(1.66,5.20),(1.66,1.65)]
    for radius,y in hole_levels:
        rings.append([(cx+radius*math.cos(a),y,cz+radius*math.sin(a)) for a in angles])
    prefix='Black_Base_Corner_%s%s_Open_Bore' if base else 'Corner_%s%s_Counterbored_Through_Hole'
    return closed_rings(prefix%('P' if sx>0 else 'N','P' if sz>0 else 'N'),rings,black if base else silver,parent)

model=group('01 CHIP - editable reference reconstruction')
body=group('01 Package and four machined mounting holes',model)
cube('Black ceramic base cross X',(100,1.72,64.8),(0,0.86,0),black,body,0.13)
cube('Black ceramic base cross Z',(64.8,1.72,100),(0,0.86,0),black,body,0.13)
square_ring('Continuous brushed silver outer wall',50,48.25,1.6,7.95,silver,body,0.14,3.8)
substrate_outline=[(-32.4,-48.3),(32.4,-48.3),(32.4,-32.4),(48.3,-32.4),(48.3,32.4),(32.4,32.4),(32.4,48.3),(-32.4,48.3),(-32.4,32.4),(-48.3,32.4),(-48.3,-32.4),(-32.4,-32.4)]
solid_prism('Recessed substrate - corner bores kept clear',substrate_outline,1.6,7.17,substrate,body,0.08)
for sx in [-1,1]:
    for sz in [-1,1]:
        mounting_pad(sx,sz,body)
        mounting_pad(sx,sz,body,True)
for side in [-1,1]:
    for station in [-32.8,32.8]:
        cube('Gold joint X %.1f %d'%(station,side),(0.68,6.15,1.88),(station,4.77,side*49.18),gold_polish,body,0.045)
        cube('Gold joint Z %.1f %d'%(station,side),(1.88,6.15,0.68),(side*49.18,4.77,station),gold_polish,body,0.045)

die=group('02 Layered central gold die',model)
solid_prism('Black insulating moat under die',rounded_square(26.75,1.65),7.18,7.70,black,die,0.12)
solid_prism('Lower polished gold lip',rounded_square(26.4,1.6),7.55,8.03,gold_polish,die,0.13)
solid_prism('Champagne gold central plate',rounded_square(25.85,1.45),7.92,8.92,gold,die,0.15)

array=group('03 Reference array - 9 columns x 6 rows - 54 blocks',model)
for i in range(9):
    for j in range(6):
        cube('Gold block C%02d R%02d'%(i+1,j+1),(2.1,2.95,2.40),((i-4)*3.65,10.395,(j-2.5)*5.35),gold,array,0.065)

pads=group('04 Four perimeter contact pad banks',model)
pad_specs=[('North',11,-1,False),('South',13,1,False),('West',9,-1,True),('East',11,1,True)]
for name,num,sign,swap in pad_specs:
    bank=group('%s - %d gold pads'%(name,num),pads)
    span=61.5;pitch=span/num;width=pitch-0.55
    for i in range(num):
        t=(i-(num-1)/2.)*pitch
        pos=(sign*45.17,7.57,t) if swap else (t,7.57,sign*45.17)
        size=(5.05,0.83,width) if swap else (width,0.83,5.05)
        cube('%s contact %02d'%(name,i+1),size,pos,gold_polish,bank,0.11)

def route_mesh(name,points,width,height,y,mat,parent):
    # Raised flat rectangular micro-conductor; all bends remain mesh geometry.
    left=[];right=[]
    for i,p in enumerate(points):
        prev=points[max(i-1,0)];nxt=points[min(i+1,len(points)-1)]
        dx=nxt[0]-prev[0];dz=nxt[1]-prev[1];ln=math.hypot(dx,dz)
        nx=-dz/ln*width/2;nz=dx/ln*width/2
        left.append((p[0]+nx,p[1]+nz));right.append((p[0]-nx,p[1]-nz))
    n=len(points);verts=[]
    for yy in [y,y+height]:
        for i in range(n):
            verts.extend([(left[i][0],yy,left[i][1]),(right[i][0],yy,right[i][1])])
    faces=[]
    for i in range(n-1):
        a=i*2;b=a+2
        faces.extend([(2*n+a,2*n+a+1,2*n+b+1,2*n+b),(a,b,b+1,a+1),(a,2*n+a,2*n+b,b),(a+1,b+1,2*n+b+1,2*n+a+1)])
    faces.extend([(0,1,2*n+1,2*n),(2*n-2,4*n-2,4*n-1,2*n-1)])
    return mesh(name,verts,faces,mat,parent,False)

def eyelet(name,x,z,y,parent,r=0.26):
    # Small plated diamond terminal with a real open center.
    n=12;rings=[]
    for rad,yy in [(r*0.53,y),(r*0.53,y+0.09),(r,y+0.09),(r,y)]:
        rings.append([(x+rad*math.cos(2*math.pi*i/n),yy,z+rad*math.sin(2*math.pi*i/n)) for i in range(n)])
    return closed_rings(name,rings,gold_trace,parent)

traces=group('05 Reference-fitted gold conductors and plated eyelets',model)
trace_data=json.load(open(os.path.join(HERE,'trace_paths.json')))
banks=[group(name,traces) for name in ['North - reference fitted','East - reference fitted','South - reference fitted','West - reference fitted']]
for i,item in enumerate(trace_data):
    path=item['points'];bank=banks[item['side']]
    route_mesh('Reference trace %03d'%(i+1),path,0.15,0.075,7.20,gold_trace,bank)
    x,z=path[0];eyelet('Inner plated terminal %03d'%(i+1),x,z,7.22,bank,0.23)
    x,z=path[-1];eyelet('Outer plated terminal %03d'%(i+1),x,z,7.22,bank,0.26)
counts['reference_fitted_traces']=len(trace_data)

# The broad diagonal buses are separated from the fine conductor artwork.
for sx in [-1,1]:
    for sz in [-1,1]:
        for lane in range(2):
            offset=lane*0.95
            route=[(sx*(26.6+offset),sz*26.6),(sx*(29.1+offset),sz*26.6),(sx*(35.4+offset),sz*32.9),(sx*(35.4+offset),sz*37.5)]
            route_mesh('Corner bus %d %d lane %d'%(sx,sz,lane+1),route,0.64,0.08,7.19,gold_trace,traces)

studio=group('02 DARK STUDIO - separate from chip')
cube('Continuous dark satin ground',(1600,4,1600),(0,-2,0),floor_mat,studio,0)
wall=cube('Plain dark back wall',(1200,400,3),(-210,198,-250),wall_mat,studio,0)
wall.SetAbsRot(V(math.radians(-40),0,0))

def aim(obj,target):
    direction=V(*target)-obj.GetAbsPos()
    obj.SetAbsRot(c4d.utils.VectorToHPB(direction.GetNormalized()))

camdata=json.load(open(os.path.join(HERE,'camera_fit.json')))
cameras=group('03 CAMERAS - reference framing 3x2')
camera=insert(c4d.BaseObject(c4d.Ocamera),'Reference camera 3x2',cameras)
camera.SetAbsPos(V(*camdata['camera_position']))
aim(camera,camdata['camera_target'])
camera[c4d.CAMERA_PROJECTION]=c4d.Pperspective
camera[c4d.CAMERAOBJECT_APERTURE]=36.
camera[c4d.CAMERA_FOCUS]=camdata['focal_mm']
camera[c4d.CAMERAOBJECT_FILM_OFFSET_X]=(768-camdata['principal_x_px'])/1536
camera[c4d.CAMERAOBJECT_FILM_OFFSET_Y]=(512-camdata['principal_y_px'])/1024
camera[c4d.CAMERAOBJECT_TARGETDISTANCE]=(camera.GetAbsPos()-V(*camdata['camera_target'])).GetLength()
doc.GetActiveBaseDraw().SetSceneCamera(camera)

lights=group('04 LIGHTING - editable studio sources')
def area(name,pos,target,size,power,color=(1,1,1)):
    light=insert(c4d.BaseObject(c4d.Olight),name,lights)
    light.SetAbsPos(V(*pos));aim(light,target)
    light[c4d.LIGHT_TYPE]=c4d.LIGHT_TYPE_AREA
    light[c4d.LIGHT_BRIGHTNESS]=power
    light[c4d.LIGHT_COLOR]=V(*color)
    light[c4d.LIGHT_SHADOWTYPE]=c4d.LIGHT_SHADOWTYPE_AREA
    light[c4d.LIGHT_AREADETAILS_SHAPE]=c4d.LIGHT_AREADETAILS_SHAPE_RECTANGLE
    light[c4d.LIGHT_AREADETAILS_SIZEX]=size[0]
    light[c4d.LIGHT_AREADETAILS_SIZEY]=size[1]
    light[c4d.LIGHT_AREADETAILS_SHOWINRENDER]=False
    light[c4d.LIGHT_AREADETAILS_SHOWINREFLECTION]=True
    light[c4d.LIGHT_AREADETAILS_SHOWINSPECULAR]=True
    light[c4d.LIGHT_DETAILS_FALLOFF]=c4d.LIGHT_DETAILS_FALLOFF_INVERSESQUARE
    light[c4d.LIGHT_DETAILS_OUTERDISTANCE]=150
    light[c4d.LIGHT_AREADETAILS_SAMPLES]=16 if PREVIEW else 24
    light[c4d.LIGHT_SHADOW_MINSAMPLES]=8 if PREVIEW else 12
    light[c4d.LIGHT_SHADOW_MAXSAMPLES]=32 if PREVIEW else 48
    return light

area('KEY - large softbox upper left',(-70,125,-85),(0,5,0),(150,115),1.10,(1.,0.985,0.96))
area('SIDE - broad silver reflection',(-105,90,110),(0,5,0),(115,130),0.65,(0.97,0.985,1.0))
area('FILL - right wall reflection',(125,90,-65),(0,7,0),(115,125),0.60,(1.,1.,1.))

# Physical softbox diffusion surfaces create broad, controlled metal reflections.
cards=group('05 REFLECTION CARDS - editable diffusion surfaces')
card_mat=c4d.Material();card_mat.SetName('09 White diffusion fabric - reflection card')
card_mat[c4d.MATERIAL_USE_COLOR]=False
card_mat[c4d.MATERIAL_USE_REFLECTION]=False
card_mat[c4d.MATERIAL_USE_LUMINANCE]=True
card_mat[c4d.MATERIAL_LUMINANCE_COLOR]=V(1.0,0.985,0.96)
card_mat[c4d.MATERIAL_LUMINANCE_BRIGHTNESS]=1.3
doc.InsertMaterial(card_mat)
for name,pos,size in [
    ('Key diffusion panel',(-85,135,-125),(140,120,0.1)),
    ('Left reflection panel',(-75,100,135),(150,150,0.1)),
    ('Right reflection panel',(145,100,-80),(150,150,0.1))]:
    card=cube(name,size,pos,card_mat,cards,0)
    aim(card,(0,6,0))
    tag=c4d.BaseTag(c4d.Tcompositing)
    tag[c4d.COMPOSITINGTAG_SEENBYCAMERA]=False
    tag[c4d.COMPOSITINGTAG_CASTSHADOW]=False
    tag[c4d.COMPOSITINGTAG_SEENBYAO]=False
    card.InsertTag(tag)

env_mat=c4d.Material();env_mat.SetName('10 Dim studio reflection environment')
env_mat[c4d.MATERIAL_USE_COLOR]=False
env_mat[c4d.MATERIAL_USE_REFLECTION]=False
env_mat[c4d.MATERIAL_USE_LUMINANCE]=True
env_mat[c4d.MATERIAL_LUMINANCE_COLOR]=V(0.28,0.29,0.31)
doc.InsertMaterial(env_mat)
sky=insert(c4d.BaseObject(c4d.Osky),'Dim studio environment - reflections only',cards)
assign(sky,env_mat)
tag=c4d.BaseTag(c4d.Tcompositing)
tag[c4d.COMPOSITINGTAG_SEENBYCAMERA]=False
tag[c4d.COMPOSITINGTAG_CASTSHADOW]=False
sky.InsertTag(tag)

rd=doc.GetActiveRenderData()
rd[c4d.RDATA_RENDERENGINE]=c4d.RDATA_RENDERENGINE_STANDARD
rd[c4d.RDATA_XRES]=1536
rd[c4d.RDATA_YRES]=1024
rd[c4d.RDATA_PIXELASPECT]=1.
rd[c4d.RDATA_FILMASPECT]=1.5
rd[c4d.RDATA_LOCKRATIO]=True
rd[c4d.RDATA_ANTIALIASING]=c4d.RDATA_ANTIALIASING_BEST
rd[c4d.RDATA_AAMINLEVEL]=1
rd[c4d.RDATA_AAMAXLEVEL]=2
rd[c4d.RDATA_AATHRESHOLD]=0.05 if PREVIEW else 0.035
rd[c4d.RDATA_REFLECTIONDEPTH]=5
rd[c4d.RDATA_RAYDEPTH]=12
rd[c4d.RDATA_SHADOWDEPTH]=12
rd[c4d.RDATA_SAVEIMAGE]=False
ao=c4d.documents.BaseVideoPost(c4d.VPambientocclusion)
if ao:
    ao[c4d.VPAMBIENTOCCLUSION_MINLENGTH]=0
    ao[c4d.VPAMBIENTOCCLUSION_MAXLENGTH]=2.0
    ao[c4d.VPAMBIENTOCCLUSION_MINSAMPLES]=8 if PREVIEW else 12
    ao[c4d.VPAMBIENTOCCLUSION_MAXSAMPLES]=24 if PREVIEW else 32
    ao[c4d.VPAMBIENTOCCLUSION_ACCURACY]=0.6 if PREVIEW else 0.8
    rd.InsertVideoPost(ao)

doc.SetActiveObject(model,c4d.SELECTION_NEW)
doc.SetTime(c4d.BaseTime(0))
doc.ExecutePasses(None,True,True,True,c4d.BUILDFLAGS_NONE)
doc.Message(c4d.MSG_UPDATE)
c4d.EventAdd()
path=os.path.join(ROOT,'MetalChip_v001.c4d')
if not c4d.documents.SaveDocument(doc,path,c4d.SAVEDOCUMENTFLAGS_DONTADDTORECENTLIST,c4d.FORMAT_C4DEXPORT):
    raise RuntimeError('Native C4D save failed')
print('SAVED_NATIVE',path,'COUNTS',counts)
sys.stdout.flush()


from inspect_render import inspect_export_render
inspect_export_render(path, ROOT, os.path.join(HERE,'MetalChip_reference.png'), PREVIEW)
