# coding: utf-8
from __future__ import print_function
import os,sys
root=os.path.dirname(os.path.abspath(__file__))
folder=os.path.join(root,'MetalChip_v002_reproduction')
sys.path.insert(0,folder)
sys.argv=[os.path.join(folder,'match_scene.py'),'--source='+os.path.join(root,'MetalChip_v001.c4d'),'--settings='+os.path.join(folder,'look-settings.json'),'--output-dir='+root]+sys.argv[1:]
exec(compile(open(sys.argv[0],'rb').read(),sys.argv[0],'exec'))
