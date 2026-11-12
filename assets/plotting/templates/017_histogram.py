"""直方图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 17
TITLE = 'Shape of the population'
SUBTITLE = 'Common bins · density-normalized histogram'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':[rng.normal(2,.65,600),rng.normal(3.5,.8,600)]}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);bins=np.linspace(-.5,6.5,33)
    for i,v in enumerate(d['groups']):
        ax.hist(v,bins=bins,density=True,color=fade(C[i],.5),edgecolor='white',linewidth=.6,label=f'Population {chr(65+i)}')
    ax.set(xlabel='Value (a.u.)',ylabel='Probability density');legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
