"""数值矩阵热图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 33
TITLE = 'A matrix in color'
SUBTITLE = 'Cell values · sequential gradient'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'matrix':rng.gamma(2,1,(8,10))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);a=d['matrix'];m=ax.imshow(a,cmap=FLOW,aspect='auto',vmin=0)
    for i in range(8):
        for j in range(10):ax.text(j,i,f'{a[i,j]:.1f}',ha='center',va='center',fontsize=8,color=ink_on(FLOW(a[i,j]/a.max())))
    ax.set(xticks=range(10),xticklabels=[f'S{i+1}' for i in range(10)],yticks=range(8),yticklabels=[f'F{i+1}' for i in range(8)],xlabel='Sample',ylabel='Feature');ax.grid(False)
    colorbar(fig,m,ax,'Value (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
