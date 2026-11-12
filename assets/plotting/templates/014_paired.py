"""配对样本连线图 — independently authored example.
24 synthetic paired samples; each line connects the same sample, no p-value is implied.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 14
TITLE = 'Every pair has a story'
SUBTITLE = 'Individual paired changes · no aggregation'
METHOD = '24 synthetic paired samples; each line connects the same sample, no p-value is implied.'

def make_data(rng):
    a=rng.normal(4,.7,24);b=a+rng.normal(.9,.5,24)
    return {'before':a,'after':b}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,(a,b) in enumerate(zip(d['before'],d['after'])):
        c=C[1] if b>a else C[2];ax.plot([0,1],[a,b],color=fade(c,.3),lw=1.5)
    ax.scatter(np.zeros(24),d['before'],c=C[0],s=55,edgecolor='white',zorder=4)
    ax.scatter(np.ones(24),d['after'],c=C[1],s=55,edgecolor='white',zorder=4)
    ax.set(xticks=[0,1],xticklabels=['Before','After'],ylabel='Response (a.u.)',xlim=(-.4,1.4));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
