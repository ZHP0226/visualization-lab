import os, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
sys.argv = [os.path.join(here, 'build_scene.py'), '--output-dir=' + os.path.dirname(here)]
exec(compile(open(sys.argv[0], 'rb').read(), sys.argv[0], 'exec'))
