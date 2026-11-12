"""分组柱状图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 9
TITLE = 'Comparing the alternatives'
SUBTITLE = 'Gradient bars · matched categories'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':['A','B','C','D','E'],'values':rng.uniform(4,9,(3,5))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);x=np.arange(5)
    for i,v in enumerate(d['values']):
        gbar(ax,x+(i-1)*.24,v,width=.22,colors=[C[i]]*5)
        ax.plot([],[],lw=9,color=C[i],label=f'Method {i+1}')
    ax.set(xticks=x,xticklabels=d['groups'],xlabel='Condition',ylabel='Response (a.u.)',ylim=(0,11));legend(ax,ncol=3);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
