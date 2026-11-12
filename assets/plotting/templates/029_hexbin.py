"""六边形分箱图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 29
TITLE = 'Density without overplotting'
SUBTITLE = 'Hexagonal count bins · 18,000 observations'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    xy=rng.multivariate_normal([0,0],[[1,.72],[.72,1.2]],18000)
    return {'xy':xy}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);v=d['xy']
    m=ax.hexbin(v[:,0],v[:,1],gridsize=47,mincnt=1,cmap=FLOW,linewidths=.1)
    colorbar(fig,m,ax,'Count / hexagon');ax.set(xlabel='Feature 1 (a.u.)',ylabel='Feature 2 (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
