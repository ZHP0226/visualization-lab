"""阶梯图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 3
TITLE = 'Discrete transitions'
SUBTITLE = 'Step response · sampled observations'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    t=np.arange(13);y=np.array([0,.15,.15,.5,.5,.9,.9,1.35,1.35,1.35,1.7,1.9,1.9])
    return {'time':t,'response':y}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);x=d['time'];y=d['response']
    ax.fill_between(x,y,step='post',color=fade(C[0],.13))
    ax.step(x,y,where='post',lw=3,color=C[0],label='Control state')
    ax.scatter(x,y,c=np.linspace(0,1,len(x)),cmap=SPECTRAL,s=65,edgecolors='white',zorder=5)
    ax.set(xlabel='Step index',ylabel='Response (a.u.)',xlim=(0,12),ylim=(-.05,2.2));legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
