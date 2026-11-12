"""面积图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 2
TITLE = 'Layers of a signal'
SUBTITLE = 'Layered area · additive components'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(0,24,200)
    y=np.array([1.1+.7*np.sin(x/4)**2,.8+.6*np.exp(-((x-12)/4)**2),.4+.035*x])
    return {'x':x,'y':y}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE); x=d['x']; y=d['y']; bottom=np.zeros_like(x)
    for i,v in enumerate(y):
        ax.fill_between(x,bottom,bottom+v,color=fade(C[i],.65),lw=0,label=['Baseline','Transient','Growth'][i])
        ax.plot(x,bottom+v,color=C[i],lw=2);bottom+=v
    ax.set(xlim=(0,24),ylim=(0,5),xlabel='Time (h)',ylabel='Total response (a.u.)');legend(ax,ncol=3);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
