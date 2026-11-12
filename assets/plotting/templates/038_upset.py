"""UpSet集合交集图 — independently authored example.
Counts are disjoint exact membership patterns; all-zero membership is excluded and remains present in source data.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 38
TITLE = 'The intersections that matter'
SUBTITLE = 'Exclusive set combinations · exact membership counts'
METHOD = 'Counts are disjoint exact membership patterns; all-zero membership is excluded and remains present in source data.'

def make_data(rng):
    membership=rng.random((350,4))<np.array([.55,.48,.43,.3]);return {'membership':membership.astype(int)}

@publication
def draw(d):
    v=d['membership'];comb,count=np.unique(v,axis=0,return_counts=True);mask=comb.any(1);comb,count=comb[mask],count[mask];order=np.argsort(count)[::-1];comb,count=comb[order],count[order]
    fig,axs=canvas(TITLE,SUBTITLE,2,1,gridspec_kw={'height_ratios':[3,1.4]});top,bot=axs[:,0];x=np.arange(len(count))
    gbar(top,x,count,colors=[SPECTRAL(i/max(1,len(count)-1)) for i in x]);top.set(ylabel='Exclusive intersection count',xticks=[],xlim=(-.7,len(x)-.3))
    for i,pattern in enumerate(comb):
        bot.scatter(np.repeat(i,4),np.arange(4),s=35,color='#E2E8F1')
        idx=np.flatnonzero(pattern);bot.plot(np.repeat(i,len(idx)),idx,color=C[0],lw=1.4);bot.scatter(np.repeat(i,len(idx)),idx,s=46,color=C[0],zorder=4)
    bot.set(yticks=range(4),yticklabels=['Set A','Set B','Set C','Set D'],xticks=x,xticklabels=[str(i+1) for i in x],xlabel='Intersection rank',xlim=(-.7,len(x)-.3),ylim=(3.6,-.6));bot.grid(False);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
