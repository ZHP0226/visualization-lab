"""分组散点图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 25
TITLE = 'Structure in the cloud'
SUBTITLE = 'Three synthetic populations · distinct markers'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    xy=np.concatenate([rng.multivariate_normal(m,[[.7,.4],[.4,.7]],100) for m in [[0,0],[2.3,1],[.4,3]]])
    return {'xy':xy,'group':np.repeat(np.arange(3),100)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i in range(3):
        v=d['xy'][d['group']==i];ax.scatter(v[:,0],v[:,1],s=40,c=C[i],alpha=.65,marker=['o','s','^'][i],edgecolor='white',lw=.4,label=f'Cluster {i+1}')
    ax.set(xlabel='Feature 1 (a.u.)',ylabel='Feature 2 (a.u.)');legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
