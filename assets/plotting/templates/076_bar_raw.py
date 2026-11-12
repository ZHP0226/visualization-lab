"""柱状／汇总值＋原始散点 — independently authored example.
Bar height=mean; whiskers=sample SD (ddof=1), not SEM. Every raw observation is shown; no p-values or significance stars.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 76
TITLE = 'Summary with the evidence'
SUBTITLE = 'Means ± sample SD · all 25 observations per group'
METHOD = 'Bar height=mean; whiskers=sample SD (ddof=1), not SEM. Every raw observation is shown; no p-values or significance stars.'

def make_data(rng):
    return {'groups':demo_groups(rng,25)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);means=[np.mean(v) for v in d['groups']];sd=[np.std(v,ddof=1) for v in d['groups']];gbar(ax,np.arange(4),means,colors=C[:4],width=.6)
    ax.errorbar(range(4),means,yerr=sd,fmt='none',ecolor=INK,capsize=5,lw=1.3,zorder=5)
    for i,v in enumerate(d['groups']):ax.scatter(i+swarm(v,.18),v,s=30,color=C[i],edgecolor='white',lw=.6,zorder=6)
    ax.set(xticks=range(4),xticklabels=['A','B','C','D'],xlabel='Group',ylabel='Value (a.u.)',ylim=(0,6));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
