# coding: utf-8
from __future__ import print_function
import argparse, os, subprocess, sys, tempfile, shutil, json, io
sys.dont_write_bytecode=True
from common import load_plan

p=argparse.ArgumentParser(description='Run the local, versioned modeling recipe without desktop automation.')
p.add_argument('--software',choices=['blender','c4d'],required=True)
p.add_argument('--executable',required=True)
p.add_argument('--plan',required=True)
p.add_argument('--stem',required=True)
p.add_argument('--no-render',action='store_true')
p.add_argument('--replay-output',help='Reopen the saved native project and render only to this new PNG; do not rewrite model/native/audit.')
a=p.parse_args()
load_plan(a.plan)
driver=os.path.join(os.path.dirname(os.path.abspath(__file__)),a.software+'_adapter.py')
args=['--plan',os.path.abspath(a.plan),'--stem',os.path.abspath(a.stem)]
if a.no_render:args+=['--no-render']
if a.replay_output:args+=['--replay-output',os.path.abspath(a.replay_output)]
command=[a.executable,'--background','--factory-startup','--python-exit-code','1','--python',driver,'--']+args if a.software=='blender' else [a.executable,driver]+args
options={}
if sys.platform=='win32':
    startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;options['startupinfo']=startup
stage=None
try:
    if a.software=='c4d':
        # R21 c4dpy cannot reliably parse non-ASCII script paths/argv. Keep the
        # launcher in an ASCII temporary directory; JSON preserves Unicode paths.
        stage=tempfile.mkdtemp(prefix='vlab-c4d-')
        for name in ['common.py','run.py','blender_adapter.py','c4d_adapter.py']:
            shutil.copyfile(os.path.join(os.path.dirname(driver),name),os.path.join(stage,name))
        job=os.path.join(stage,'job.json');stage_stem=os.path.join(stage,'scene')
        if a.replay_output:shutil.copyfile(a.stem+'.c4d',stage_stem+'.c4d')
        with open(job,'w') as f: json.dump(dict(plan=os.path.abspath(a.plan),stem=stage_stem,no_render=a.no_render,replay_output=os.path.join(stage,'replay.png') if a.replay_output else None),f)
        command=[a.executable,os.path.join(stage,'c4d_adapter.py'),'--job',job]
        env=os.environ.copy();home=os.path.dirname(os.path.abspath(a.executable))
        env['PATH']=os.path.join(home,'resource','libs','win64')+os.pathsep+os.path.join(home,'corelibs')+os.pathsep+env.get('PATH','')
        options['env']=env
    result=subprocess.call(command,**options)
    if a.software=='c4d' and result==0:
        if a.replay_output:shutil.copyfile(os.path.join(stage,'replay.png'),a.replay_output)
        else:
            audit_file=os.path.join(os.path.dirname(os.path.abspath(a.plan)),'audit.json')
            audit=json.load(io.open(audit_file,encoding='utf-8'))
            for key,ext in [('model','.glb'),('native','.c4d'),('render','.png')]:
                if key=='render' and a.no_render:continue
                shutil.copyfile(stage_stem+ext,a.stem+ext)
                audit['files'][key]['name']=os.path.basename(a.stem+ext)
            audit['pathCompatibility']='R21 ASCII staging; delivered native reopened before export; bytes copied unchanged'
            from common import write_json
            write_json(audit_file,audit)
finally:
    if stage and os.path.dirname(os.path.realpath(stage))==os.path.realpath(tempfile.gettempdir()) and os.path.basename(stage).startswith('vlab-c4d-'):shutil.rmtree(stage)
sys.exit(result)
