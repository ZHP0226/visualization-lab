"""流线图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 48
TITLE = 'The flow between points'
SUBTITLE = 'Integrated streamlines · color and width encode speed'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(-3,3,150);y=np.linspace(-2,2,120);X,Y=np.meshgrid(x,y);U=np.cos(Y)+.3*X;V=np.sin(X)-.3*Y
    return {'x':x,'y':y,'U':U,'V':V}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);speed=np.hypot(d['U'],d['V'])
    s=ax.streamplot(d['x'],d['y'],d['U'],d['V'],color=speed,cmap=SPECTRAL,density=1.6,linewidth=.5+1.8*speed/speed.max(),arrowsize=1)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',aspect='equal');colorbar(fig,s.lines,ax,'Speed (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
