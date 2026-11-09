# coding: utf-8
import argparse, os, sys
sys.dont_write_bytecode=True
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
from common import load_plan, geometry_audit, write_glb, write_audit, digest

p=argparse.ArgumentParser();p.add_argument('--plan',required=True);p.add_argument('--stem',required=True);p.add_argument('--no-render',action='store_true');p.add_argument('--replay-output')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);plan=load_plan(a.plan);native=a.stem+'.blend'
def linear(c):return c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4
if a.replay_output:
    before=digest(native);bpy.ops.wm.open_mainfile(filepath=native);bpy.context.scene.render.filepath=a.replay_output;bpy.ops.render.render(write_still=True);assert digest(native)==before
    print('FRAMEWORK_REPLAY_OK');sys.exit(0)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
r=plan['render'];scene.cycles.samples=r['samples'];scene.cycles.seed=r['seed'];scene.cycles.use_adaptive_sampling=False;scene.cycles.use_denoising=False
scene.render.resolution_x=r['width'];scene.render.resolution_y=r['height'];scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.filepath=a.stem+'.png';scene.render.film_transparent=False
scene.view_settings.view_transform='Standard';scene.view_settings.exposure=0;scene.view_settings.gamma=1
world=bpy.data.worlds.new('Environment');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=[1,1,1,1];world.node_tree.nodes['Background'].inputs['Strength'].default_value=.15;scene.world=world
mats={}
for spec in plan['materials']:
    m=bpy.data.materials.new(spec['id']);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=[linear(c) for c in spec['color']]+[1];n.inputs['Metallic'].default_value=spec.get('metallic',0);n.inputs['Roughness'].default_value=spec.get('roughness',.5);mats[spec['id']]=m
groups={}
for spec in plan['objects']:
    shape=spec['shape']
    if shape=='box':bpy.ops.mesh.primitive_cube_add(size=2)
    elif shape=='sphere':bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1)
    elif shape=='cylinder':bpy.ops.mesh.primitive_cylinder_add(vertices=48,radius=1,depth=2)
    else:raise ValueError('Custom geometry requires a project-specific builder using the common audit/export utilities; it is not a supported primitive.')
    o=bpy.context.object;o.name=spec['id'];o['workbench_id']=spec['id'];o.location=spec['position'];o.scale=[v/2 for v in spec['size']];o.data.materials.append(mats[spec['material']])
    group=spec.get('group','Structure')
    if group not in groups:
        col=bpy.data.collections.new(group);scene.collection.children.link(col);groups[group]=col
    for c in list(o.users_collection):c.objects.unlink(o)
    groups[group].objects.link(o)
cam=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(cam);scene.camera=cam;c=plan['camera'];cam.location=c['position'];cam.rotation_euler=(Vector(c['target'])-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.type='ORTHO' if c['projection']=='orthographic' else 'PERSP';cam.data.ortho_scale=c.get('scale',6);cam.data.lens=c.get('focalLength',45);cam.data.clip_start=.001;cam.data.clip_end=100000
for index,spec in enumerate(plan['lights']):
    data=bpy.data.lights.new('Light_'+str(index),'AREA');data.energy=spec['power'];data.color=spec['color'];data.size=spec['size'];obj=bpy.data.objects.new(data.name,data);scene.collection.objects.link(obj);obj.location=spec['position'];obj.rotation_euler=(Vector(c['target'])-obj.location).to_track_quat('-Z','Y').to_euler()
bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=native,compress=False)
# Validation and rendering use the saved project, not an unsaved in-memory scene.
bpy.ops.wm.open_mainfile(filepath=native);scene=bpy.context.scene;deps=bpy.context.evaluated_depsgraph_get();meshes=[]
for spec in plan['objects']:
    o=bpy.data.objects.get(spec['id'])
    if not o or o.type!='MESH':raise ValueError('Saved native object missing: '+spec['id'])
    evaluated=o.evaluated_get(deps);m=evaluated.to_mesh();m.calc_loop_triangles();points=[list(o.matrix_world@v.co) for v in m.vertices];tris=[list(t.vertices) for t in m.loop_triangles];meshes.append(dict(id=spec['id'],vertices=points,triangles=tris));evaluated.to_mesh_clear()
geometry_audit(plan,meshes);write_glb(a.stem+'.glb',plan,meshes)
if not a.no_render:bpy.ops.render.render(write_still=True)
write_audit(a.plan,plan,a.stem,meshes,'blender',bpy.app.version_string,native,None if a.no_render else a.stem+'.png',dict(engine=scene.render.engine,device=scene.cycles.device,width=scene.render.resolution_x,height=scene.render.resolution_y,samples=scene.cycles.samples,seed=scene.cycles.seed,viewTransform=scene.view_settings.view_transform,adaptiveSampling=scene.cycles.use_adaptive_sampling,denoising=scene.cycles.use_denoising))
print('FRAMEWORK_BUILD_AND_AUDIT_OK')
