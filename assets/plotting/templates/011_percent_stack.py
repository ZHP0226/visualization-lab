"""百分比堆叠柱状图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 11
TITLE = 'One hundred percent'
SUBTITLE = 'Normalized composition · each column sums to 100%'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':['A','B','C','D','E','F'],'values':rng.dirichlet([2,3,2,1],6).T}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);x=np.arange(6);bottom=np.zeros(6)
    for i,v in enumerate(d['values']*100):
        ax.bar(x,v,bottom=bottom,width=.65,color=C[i],edgecolor='white',linewidth=1,label=f'Part {i+1}')
        for j,w in enumerate(v):
            if w>12:ax.text(j,bottom[j]+w/2,f'{w:.0f}%',ha='center',va='center',color=ink_on(C[i]),fontsize=9,weight='bold')
        bottom+=v
    ax.set(xticks=x,xticklabels=d['groups'],ylabel='Fraction (%)',ylim=(0,118));legend(ax,ncol=4,loc='upper center');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
