"""二维标量场伪彩色图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 41
TITLE = 'A field of possibilities'
SUBTITLE = 'Scalar pseudocolor · symmetric diverging normalization'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    X,Y,Z=fields(160);return {'X':X,'Y':Y,'Z':Z}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);m=ax.pcolormesh(d['X'],d['Y'],d['Z'],cmap=DIV,vmin=-1,vmax=1,shading='auto',rasterized=True)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',aspect='equal');ax.grid(False);colorbar(fig,m,ax,'Field amplitude (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
