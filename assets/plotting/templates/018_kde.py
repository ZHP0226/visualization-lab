"""核密度分布图 — independently authored example.
Gaussian KDE using scipy.stats.gaussian_kde with default Scott bandwidth, n=180 per group.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 18
TITLE = 'Smooth distribution'
SUBTITLE = 'Gaussian KDE · Scott bandwidth'
METHOD = 'Gaussian KDE using scipy.stats.gaussian_kde with default Scott bandwidth, n=180 per group.'

def make_data(rng):
    return {'groups':demo_groups(rng,180)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);grid=np.linspace(0,6.5,350);ymax=0
    for i,v in enumerate(d['groups']):
        x,y=density(v,grid);ymax=max(ymax,float(y.max()));gradient_fill(ax,x,y,C[i],alpha=.35);ax.plot(x,y,color=C[i],lw=2.5,ls=LINESTYLES[i],label=f'Group {i+1}')
    ax.set(xlabel='Value (a.u.)',ylabel='Probability density',xlim=(0,6.5),ylim=(0,ymax*1.08));legend(ax,ncol=2);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
