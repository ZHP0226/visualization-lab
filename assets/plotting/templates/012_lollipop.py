"""棒棒糖排序图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 12
TITLE = 'Order from the data'
SUBTITLE = 'Ranked lollipop · direct value labels'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'labels':[f'Material {c}' for c in 'ABCDEFGH'],'values':rng.uniform(2,10,8)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);idx=np.argsort(d['values']);v=d['values'][idx];y=np.arange(len(v))
    for i,w in enumerate(v):
        c=SPECTRAL(i/7);ax.plot([0,w],[i,i],lw=3,color=fade(c,.4));ax.scatter(w,i,s=190,color=c,edgecolor='white',lw=1.3,zorder=4);ax.text(w+.25,i,f'{w:.2f}',va='center',fontsize=9,color=c)
    ax.set(yticks=y,yticklabels=np.asarray(d['labels'])[idx],xlabel='Performance (a.u.)',xlim=(0,max(v)*1.2));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
