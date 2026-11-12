"""相关性网络图 — independently authored example.
Undirected correlation network from synthetic observations; edges are associations, not causal or directed effects. Solid=positive, dashed=negative.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 40
TITLE = 'A network of association'
SUBTITLE = 'Edges at |Pearson r| ≥ 0.55 · width encodes strength'
METHOD = 'Undirected correlation network from synthetic observations; edges are associations, not causal or directed effects. Solid=positive, dashed=negative.'

def make_data(rng):
    z=rng.normal(size=(220,3));load=np.zeros((3,12))
    for i in range(12):load[i//4,i]=1;load[(i//4+1)%3,i]=.2
    return {'X':z@load+rng.normal(0,.45,(220,12))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');ax.set(xlim=(-1.6,1.6),ylim=(-1.4,1.4),aspect='equal')
    r=np.corrcoef(d['X'],rowvar=False);theta=np.linspace(0,2*np.pi,12,endpoint=False);xy=np.c_[np.cos(theta),np.sin(theta)]
    for i in range(12):
        for j in range(i):
            if abs(r[i,j])>=.55:
                p=MPath([xy[i],xy[i]*.3,xy[j]*.3,xy[j]],[MPath.MOVETO,MPath.CURVE4,MPath.CURVE4,MPath.CURVE4]);ax.add_patch(PathPatch(p,fill=False,edgecolor=fade(C[i//4],.36),lw=1+3*abs(r[i,j]),ls='-' if r[i,j]>0 else '--'))
    for i,p in enumerate(xy):
        ax.scatter(*p,s=490,color=C[i//4],edgecolor='white',lw=2,zorder=4);ax.text(*p,str(i+1),ha='center',va='center',color=ink_on(C[i//4]),weight='bold',fontsize=10)
        ax.text(*(p*1.23),f'F{i+1}',ha='center',va='center',fontsize=9,color=C[i//4])
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
