"""误差棒曲线 — independently authored example.
Error bars show sample SD (ddof=1), not SEM; n=12 independent simulated replicates per x.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 4
TITLE = 'Measured with variation'
SUBTITLE = 'Mean ± sample SD · 12 synthetic replicates per point'
METHOD = 'Error bars show sample SD (ddof=1), not SEM; n=12 independent simulated replicates per x.'

def make_data(rng):
    x=np.arange(1,9);samples=np.array([rng.normal(.3*x+1,.13,(12,8)),rng.normal(.38*x+1.3,.18,(12,8))])
    return {'x':x,'samples':samples}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,v in enumerate(d['samples']):
        ax.errorbar(d['x'],v.mean(axis=0),yerr=v.std(axis=0,ddof=1),color=C[i],lw=2.2,marker='o',ms=7,capsize=4,label=f'Protocol {chr(65+i)}')
    ax.set(xlabel='Concentration (a.u.)',ylabel='Response (a.u.)');legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
