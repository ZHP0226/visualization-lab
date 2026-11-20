# coding: utf-8
"""Four-stage modeling: gray scene, independent native parts, native assembly.

Runs local installed software only. Each component has its own plan, reopened
native project, GLB, optional real PNG and audit. Final adapters import these
native objects instead of rebuilding the complete scene from primitives.
"""
from __future__ import print_function,division
import copy,io,json,math,os,shutil,subprocess,sys
from common import CODE,VERSION,digest,load_plan,validate_components,write_json

RECORD='component-workflow.json'

def read_json(file):
    with io.open(file,encoding='utf-8') as f:return json.load(f)

def ensure(directory):
    if not os.path.isdir(directory):os.makedirs(directory)

def same(a,b):return json.dumps(a,sort_keys=True,separators=(',',':'))==json.dumps(b,sort_keys=True,separators=(',',':'))

def files_for(stem,software):
    return dict(model=stem+'.glb',native=stem+('.blend' if software=='blender' else '.c4d'),render=stem+'.png')

def stage_record(directory,plan_file,stem,software,no_render):
    audit_file=os.path.join(directory,'audit.json');audit=read_json(audit_file)
    if not audit.get('nativeReopened') or audit.get('planSha256')!=digest(plan_file):raise ValueError('Stage native audit is stale')
    files=files_for(stem,software);result={}
    for role,file in files.items():
        if role=='render' and no_render:continue
        if audit['files'][role]['sha256']!=digest(file):raise ValueError('Stage artifact differs from native audit')
        result[role]=dict(file=file,sha256=digest(file))
    result['plan']=dict(file=plan_file,sha256=digest(plan_file));result['audit']=dict(file=audit_file,sha256=digest(audit_file))
    return dict(files=result,software=software,objectIds=[o['id'] for o in load_plan(plan_file)['objects']])

def component_plan(plan,part):
    result=copy.deepcopy(plan);result.pop('components',None);result.pop('componentWorkflow',None)
    result['objects']=[o for o in result['objects'] if o['id'] in part['objectIds']]
    result['materials']=[m for m in result['materials'] if any(o['material']==m['id'] for o in result['objects'])]
    low=[min(o['position'][i]-o['size'][i]/2 for o in result['objects']) for i in range(3)]
    high=[max(o['position'][i]+o['size'][i]/2 for o in result['objects']) for i in range(3)]
    center=[(low[i]+high[i])/2 for i in range(3)];span=max(max(high[i]-low[i] for i in range(3)),.001)
    c=result['camera'];direction=[c['position'][i]-c['target'][i] for i in range(3)];norm=math.sqrt(sum(x*x for x in direction))
    distance=span*max(2.5,c.get('focalLength',45)/12.)
    c['target']=center;c['position']=[center[i]+direction[i]/norm*distance for i in range(3)];c['scale']=span*1.5
    if part.get('camera'):result['camera']=copy.deepcopy(part['camera'])
    # Retarget and scale the original rig rather than bringing a sample scene in.
    original_center=plan['camera']['target'];original_span=max(max(o['size']) for o in plan['objects'])
    scale=span/max(original_span,.001)
    for light in result['lights']:
        light['position']=[center[i]+(light['position'][i]-original_center[i])*scale for i in range(3)]
        light['size']*=scale;light['power']*=scale*scale
    result['render']['width']=min(512,plan['render']['width']);result['render']['height']=min(512,plan['render']['height'])
    result['render']['samples']=min(32,plan['render']['samples']);result['subject']=part['name']
    return result

def run_stage(args,directory,plan,stem,assembly=None):
    ensure(directory)
    for name in CODE:shutil.copyfile(os.path.join(os.path.dirname(__file__),name),os.path.join(directory,name))
    file=os.path.join(directory,'structure.json');write_json(file,plan)
    command=[sys.executable,os.path.join(directory,'run.py'),'--software',args.software,'--executable',args.executable,'--plan',file,'--stem',stem,'--stage','raw']
    if args.no_render:command.append('--no-render')
    if assembly:command+=['--assembly-index',assembly]
    subprocess.check_call(command)
    return stage_record(directory,file,stem,args.software,args.no_render)

def validate_part(record,plan,part,software):
    if record.get('software')!=software or set(record.get('objectIds',[]))!=set(part['objectIds']):raise ValueError('Component does not match the current split: '+part['id'])
    for item in record['files'].values():
        if digest(item['file'])!=item['sha256']:raise ValueError('Component file changed: '+part['id'])
    saved=load_plan(record['files']['plan']['file'])
    wanted=[o for o in plan['objects'] if o['id'] in part['objectIds']]
    materials=[m for m in plan['materials'] if any(o['material']==m['id'] for o in wanted)]
    if not same(saved['objects'],wanted) or not same(saved['materials'],materials):raise ValueError('Component geometry or material specification changed; rebuild '+part['id'])

def record_component(plan_file,component_id,component_plan_file,stem,software,no_render=False):
    """Register a custom builder's actual native/GLB/render after write_audit()."""
    plan=load_plan(plan_file);parts=validate_components(plan);part=next((p for p in parts if p['id']==component_id),None)
    if part is None:raise ValueError('Unknown component ID')
    root=os.path.dirname(os.path.abspath(plan_file));file=os.path.join(root,RECORD);record=read_json(file)
    if not record.get('blockout'):raise ValueError('Save the gray scene first')
    item=stage_record(os.path.dirname(component_plan_file),component_plan_file,stem,software,no_render);item.update(id=part['id'],name=part['name']);validate_part(item,plan,part,software)
    record['components']=[p for p in record.get('components',[]) if p['id']!=component_id]+[item]
    record['assembly']=None;write_json(file,record)
    return item

def execute(args):
    plan=load_plan(args.plan);parts=validate_components(plan);root=os.path.dirname(os.path.abspath(args.plan));record_file=os.path.join(root,RECORD)
    record=read_json(record_file) if os.path.isfile(record_file) else dict(schemaVersion=1,components=[])
    stage=args.stage
    if stage in ['all','blockout']:
        gray=copy.deepcopy(plan);gray.pop('components',None);gray.pop('componentWorkflow',None)
        gray['materials']=[dict(id='blockout_gray',color=[.56,.56,.56],metallic=0,roughness=.75)]
        for obj in gray['objects']:
            obj['material']='blockout_gray'
            if obj['shape']=='custom':obj['shape']='box'
        factor=min(1,768./max(gray['render']['width'],gray['render']['height']))
        gray['render']['width']=max(16,int(gray['render']['width']*factor));gray['render']['height']=max(16,int(gray['render']['height']*factor));gray['render']['samples']=min(16,gray['render']['samples'])
        directory=os.path.join(root,'stages','blockout');record['blockout']=run_stage(args,directory,gray,os.path.join(directory,'blockout'))
        if not args.no_render:shutil.copyfile(record['blockout']['files']['render']['file'],os.path.join(root,'blockout.png'))
        record['assembly']=None;write_json(record_file,record)
        print('WORKFLOW_BLOCKOUT_SAVED',flush=True)
    if stage in ['all','components']:
        if not record.get('blockout'):raise ValueError('Save and inspect the gray scene before component modeling')
        record['components']=[];record['assembly']=None
        for part in parts:
            directory=os.path.join(root,'components',part['id']);item=run_stage(args,directory,component_plan(plan,part),os.path.join(directory,part['id']))
            item['id']=part['id'];item['name']=part['name'];record['components'].append(item);write_json(record_file,record)
            print('WORKFLOW_COMPONENT_SAVED '+part['id'],flush=True)
    if stage in ['all','assemble']:
        if not record.get('blockout'):raise ValueError('Missing gray scene')
        gray=load_plan(record['blockout']['files']['plan']['file'])
        if not same(gray['camera'],plan['camera']):raise ValueError('Camera changed; repeat the gray scene match before assembly')
        if len(record.get('components',[]))!=len(parts):raise ValueError('Build every independent component before assembly')
        inputs=[]
        for part in parts:
            item=next((x for x in record['components'] if x['id']==part['id']),None)
            if not item:raise ValueError('Missing component: '+part['id'])
            validate_part(item,plan,part,args.software)
            inputs.append(dict(id=part['id'],objectIds=part['objectIds'],native=item['files']['native']))
        index=os.path.join(root,'assembly-inputs.json');write_json(index,dict(schemaVersion=1,components=inputs))
        command=[sys.executable,os.path.join(root,'run.py'),'--software',args.software,'--executable',args.executable,'--plan',os.path.abspath(args.plan),'--stem',os.path.abspath(args.stem),'--stage','raw','--assembly-index',index]
        if args.no_render:command.append('--no-render')
        subprocess.check_call(command)
        final=read_json(os.path.join(root,'audit.json'))
        record.update(planSha256=digest(args.plan),software=args.software,frameworkVersion=VERSION)
        record['assembly']=dict(method='native-component-import',sources=[dict(id=x['id'],objectIds=x['objectIds'],nativeSha256=x['native']['sha256']) for x in inputs],files=final['files'])
        write_json(record_file,record)
        if not args.no_render and not os.path.isfile(os.path.join(root,'first-render.png')):shutil.copyfile(args.stem+'.png',os.path.join(root,'first-render.png'))
        print('WORKFLOW_NATIVE_ASSEMBLY_SAVED',flush=True)
