"""累计增减瀑布图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 16
TITLE = 'From baseline to outcome'
SUBTITLE = 'Signed contributions · running total'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'changes':[5,1.8,-.9,2.2,-1.4,1.1],'labels':['Baseline','A','B','C','D','E','Final']}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);v=np.asarray(d['changes']);total=np.cumsum(v)
    for i,delta in enumerate(v):
        base=0 if i==0 else total[i-1];c=C[0] if i==0 else C[1] if delta>0 else C[2]
        ax.bar(i,delta,bottom=base,width=.62,color=c,edgecolor='white')
        ax.text(i,max(base,base+delta)+.18,f'{delta:+.1f}' if i else f'{delta:.1f}',ha='center',fontsize=9)
        ax.plot([i+.31,i+.69],[total[i],total[i]],color='#A4ADBD',lw=1,ls=':')
    ax.bar(6,total[-1],width=.62,color=C[4]);ax.text(6,total[-1]+.18,f'{total[-1]:.1f}',ha='center')
    ax.set(xticks=np.arange(7),xticklabels=d['labels'],ylabel='Cumulative response (a.u.)',ylim=(0,10));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
