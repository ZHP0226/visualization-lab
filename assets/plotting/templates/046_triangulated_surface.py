"""不规则三角网曲面图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 46
TITLE = 'From irregular samples'
SUBTITLE = 'Delaunay triangular surface · sampled scalar field'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=rng.uniform(-2.5,2.5,700);y=rng.uniform(-2.5,2.5,700);z=np.exp(-.4*(x*x+y*y))*np.cos(1.7*x)*np.sin(1.7*y)
    return {'x':x,'y':y,'z':z}

@publication
def draw(d):
    limit=float(np.max(abs(d['z'])));fig,ax=canvas(TITLE,SUBTITLE,projection='3d');m=ax.plot_trisurf(d['x'],d['y'],d['z'],cmap=DIV,vmin=-limit,vmax=limit,edgecolor=fade('#6B5299',.25),lw=.25,antialiased=True)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='Amplitude (a.u.)');ax.view_init(30,-58);colorbar(fig,m,ax,'Amplitude (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
