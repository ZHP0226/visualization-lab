"""矢量箭头场图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 47
TITLE = 'Direction and magnitude'
SUBTITLE = 'Vector arrows · color encodes speed'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(-2,2,22);X,Y=np.meshgrid(x,x);U=-Y+.3*X;V=X+.3*Y
    return {'X':X,'Y':Y,'U':U,'V':V}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);speed=np.hypot(d['U'],d['V'])
    m=ax.quiver(d['X'],d['Y'],d['U'],d['V'],speed,cmap=SPECTRAL,scale=55,width=.0045,headwidth=3.5)
    ax.quiverkey(m,.83,1.06,2,'2 a.u.',labelpos='E',coordinates='axes')
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',aspect='equal',xlim=(-2.3,2.3),ylim=(-2.3,2.3));colorbar(fig,m,ax,'Speed (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
