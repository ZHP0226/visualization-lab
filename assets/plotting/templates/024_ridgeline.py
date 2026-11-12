"""山脊分布图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 24
TITLE = 'A landscape of distributions'
SUBTITLE = 'Stacked Gaussian KDE · equal density scaling'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':[rng.normal(1+i*.45,.5+.08*np.sin(i),170) for i in range(8)]}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);grid=np.linspace(-1,6,300)
    for i,v in enumerate(d['groups']):
        x,y=density(v,grid);base=i*.5;c=SPECTRAL(i/7)
        ax.fill_between(x,base,base+y,color=fade(c,.7),zorder=i+2)
        ax.plot(x,base+y,color=c,lw=1.8,zorder=i+3)
    ax.set(yticks=np.arange(8)*.5,yticklabels=[f'T{i+1}' for i in range(8)],xlabel='Value (a.u.)',ylabel='Condition + density offset',xlim=(-1,6));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
