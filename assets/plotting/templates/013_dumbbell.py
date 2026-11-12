"""哑铃对比图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 13
TITLE = 'Before / after'
SUBTITLE = 'Paired endpoints · effect direction'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    before=rng.uniform(3,5,7);after=before+rng.uniform(.5,3,7)
    return {'labels':[f'System {i+1}' for i in range(7)],'before':before,'after':after}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);y=np.arange(7)
    ax.hlines(y,d['before'],d['after'],color='#CFD8E8',lw=5)
    ax.scatter(d['before'],y,s=130,color=C[0],edgecolor='white',zorder=3,label='Before')
    ax.scatter(d['after'],y,s=130,color=C[1],edgecolor='white',zorder=3,label='After')
    ax.set(yticks=y,yticklabels=d['labels'],xlabel='Response (a.u.)',ylim=(-.6,7));legend(ax,ncol=2);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
