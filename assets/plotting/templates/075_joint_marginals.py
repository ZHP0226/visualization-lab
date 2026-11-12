"""散点＋边缘分布组合 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 75
TITLE = 'The cloud and its margins'
SUBTITLE = 'Scatter with aligned marginal distributions'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'xy':rng.multivariate_normal([0,0],[[1,.75],[.75,1.3]],900)}

@publication
def draw(d):
    fig,_=canvas(TITLE,SUBTITLE);fig.axes[0].remove();ax=fig.add_axes([.12,.12,.64,.64]);top=fig.add_axes([.12,.79,.64,.15],sharex=ax);right=fig.add_axes([.79,.12,.15,.64],sharey=ax)
    v=d['xy'];ax.scatter(v[:,0],v[:,1],c=v[:,0]+v[:,1],cmap=SPECTRAL,s=15,alpha=.5,edgecolor='none')
    top.hist(v[:,0],bins=35,color=fade(C[0],.6),edgecolor='white',lw=.5);right.hist(v[:,1],bins=35,orientation='horizontal',color=fade(C[1],.65),edgecolor='white',lw=.5)
    ax.set(xlabel='Feature 1 (a.u.)',ylabel='Feature 2 (a.u.)');top.tick_params(labelbottom=False);right.tick_params(labelleft=False);top.set_ylabel('Count',fontsize=8);right.set_xlabel('Count',fontsize=8)
    for a in [ax,top,right]:style(a)
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
