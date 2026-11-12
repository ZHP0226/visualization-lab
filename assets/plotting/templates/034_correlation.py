"""相关系数矩阵图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 34
TITLE = 'Patterns of correlation'
SUBTITLE = 'Pearson r · symmetric color scale fixed at ±1'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    z=rng.normal(size=(140,3));load=rng.normal(size=(3,9));X=z@load+rng.normal(0,.5,(140,9))
    return {'X':X}

@publication
def draw(d):
    a=np.corrcoef(d['X'],rowvar=False);fig,ax=canvas(TITLE,SUBTITLE)
    m=ax.imshow(a,cmap=DIV,vmin=-1,vmax=1)
    for i in range(9):
        for j in range(9):ax.text(j,i,f'{a[i,j]:.2f}',ha='center',va='center',fontsize=7.5,color=ink_on(DIV((a[i,j]+1)/2)))
    ax.set(xticks=range(9),yticks=range(9),xticklabels=[f'F{i+1}' for i in range(9)],yticklabels=[f'F{i+1}' for i in range(9)]);ax.grid(False)
    colorbar(fig,m,ax,'Pearson r');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
