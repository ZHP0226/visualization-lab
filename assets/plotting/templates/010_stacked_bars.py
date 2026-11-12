"""堆叠柱状图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 10
TITLE = 'Composition by condition'
SUBTITLE = 'Absolute stacked contributions · common baseline'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':['A','B','C','D','E','F'],'values':rng.uniform(1,4,(4,6))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);bottom=np.zeros(6);x=np.arange(6)
    for i,v in enumerate(d['values']):
        ax.bar(x,v,bottom=bottom,color=C[i],width=.65,edgecolor='white',linewidth=1,label=f'Component {i+1}');bottom+=v
    ax.set(xticks=x,xticklabels=d['groups'],ylabel='Amount (a.u.)',ylim=(0,max(bottom)*1.28));legend(ax,ncol=4,loc='upper center');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
