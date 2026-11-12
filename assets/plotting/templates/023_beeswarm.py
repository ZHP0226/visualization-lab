"""蜂群图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 23
TITLE = 'Every point remains visible'
SUBTITLE = 'Greedy collision-aware swarm · original y values'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':demo_groups(rng,70)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,v in enumerate(d['groups']):
        ax.scatter(i+swarm(v),v,c=v,cmap=mc.LinearSegmentedColormap.from_list('group',['#E4EAF7',C[i]]),s=38,edgecolor='white',lw=.4,zorder=3)
        ax.hlines(np.median(v),i-.3,i+.3,color=INK,lw=2)
    ax.set(xticks=np.arange(4),xticklabels=['A','B','C','D'],xlabel='Group',ylabel='Value (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
