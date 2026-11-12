"""经验累积分布图 ECDF — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 19
TITLE = 'A cumulative view'
SUBTITLE = 'Empirical cumulative distribution · exact observations'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':demo_groups(rng,90)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,v in enumerate(d['groups']):
        x=np.sort(v);y=np.arange(1,len(x)+1)/len(x)
        ax.step(np.r_[x[0],x],np.r_[0,y],where='post',color=C[i],lw=2.4,ls=LINESTYLES[i],label=f'Group {i+1}')
    ax.set(xlabel='Value (a.u.)',ylabel='Cumulative probability',ylim=(0,1.04));legend(ax,loc='lower right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
