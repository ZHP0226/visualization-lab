"""三维散点图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 45
TITLE = 'A trajectory in three dimensions'
SUBTITLE = '3D scatter · color encodes time'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    t=np.linspace(0,6*np.pi,750);r=1+.035*t
    return {'time':t,'x':r*np.cos(t)+rng.normal(0,.07,len(t)),'y':r*np.sin(t)+rng.normal(0,.07,len(t)),'z':t/5+rng.normal(0,.07,len(t))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE,projection='3d');m=ax.scatter(d['x'],d['y'],d['z'],c=d['time'],cmap=SPECTRAL,s=14,alpha=.8,depthshade=True,edgecolor='none')
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='z (a.u.)');ax.view_init(26,-55);colorbar(fig,m,ax,'Time (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
