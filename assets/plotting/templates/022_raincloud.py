"""雨云图 — independently authored example.
Half KDE plus IQR/median and every raw synthetic observation, n=65/group; no significance claims.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 22
TITLE = 'Rain, cloud, and summary'
SUBTITLE = 'Half density · quartiles · all observations'
METHOD = 'Half KDE plus IQR/median and every raw synthetic observation, n=65/group; no significance claims.'

def make_data(rng):
    return {'groups':demo_groups(rng,65)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,v in enumerate(d['groups']):
        grid,z=density(v);z=z/z.max()*.34
        ax.fill_between(grid,i+.12,i+.12+z,color=fade(C[i],.52),edgecolor=C[i],lw=1.2)
        ax.scatter(v,i-.13+swarm(v,.09),s=16,color=fade(C[i],.7),edgecolor='none')
        q=np.quantile(v,[.25,.5,.75]);ax.plot(q[[0,2]],[i,i],lw=5,color=C[i]);ax.scatter(q[1],i,color='white',s=22,zorder=5)
    ax.set(yticks=np.arange(4),yticklabels=['A','B','C','D'],xlabel='Value (a.u.)',ylim=(-.5,3.7));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
