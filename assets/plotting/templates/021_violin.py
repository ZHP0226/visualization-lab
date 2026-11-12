"""小提琴图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 21
TITLE = 'Distribution as silhouette'
SUBTITLE = 'KDE violins · median and interquartile range'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':demo_groups(rng,110)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,v in enumerate(d['groups']):
        grid,z=density(v);z=z/z.max()*.36
        ax.fill_betweenx(grid,i-z,i+z,color=fade(C[i],.55),edgecolor=C[i],lw=1.5)
        q=np.quantile(v,[.25,.5,.75]);ax.plot([i,i],[q[0],q[2]],color=INK,lw=4);ax.scatter(i,q[1],s=36,color='white',zorder=5)
    ax.set(xticks=np.arange(4),xticklabels=['A','B','C','D'],ylabel='Value (a.u.)',xlabel='Group');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
