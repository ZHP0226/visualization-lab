"""韦恩图 — independently authored example.
Fixed-circle schematic with exact exclusive membership counts. Circle and overlap areas do not encode cardinality.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 39
TITLE = 'Overlap, counted exactly'
SUBTITLE = 'Three-set schematic · area is not proportional to count'
METHOD = 'Fixed-circle schematic with exact exclusive membership counts. Circle and overlap areas do not encode cardinality.'

def make_data(rng):
    return {'membership':(rng.random((300,3))<np.array([.6,.5,.45])).astype(int)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');ax.set(xlim=(-2.3,2.3),ylim=(-2,1.8),aspect='equal')
    for center,c in zip([(-.65,.35),(.65,.35),(0,-.55)],C):ax.add_patch(Circle(center,1.1,facecolor=fade(c,.23),edgecolor=c,lw=2))
    positions={(1,0,0):(-1,.65),(0,1,0):(1,.65),(0,0,1):(0,-1.15),(1,1,0):(0,.8),(1,0,1):(-.55,-.35),(0,1,1):(.55,-.35),(1,1,1):(0,.04)}
    for pattern,(x,y) in positions.items():
        n=np.all(d['membership']==pattern,axis=1).sum();ax.text(x,y,str(n),ha='center',va='center',fontsize=18,weight='bold',color=INK)
    for x,y,label,c in [(-1.45,1.43,'Set A',C[0]),(1.45,1.43,'Set B',C[1]),(0,-1.9,'Set C',C[2])]:ax.text(x,y,label,ha='center',color=c,fontsize=12,weight='bold')
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
