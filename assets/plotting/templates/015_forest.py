"""森林图 — independently authored example.
Synthetic estimates with supplied standard errors; intervals = estimate ±1.96 SE, no meta-analysis or pooled effect.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 15
TITLE = 'Effects and their precision'
SUBTITLE = 'Point estimates · normal-approximation 95% intervals'
METHOD = 'Synthetic estimates with supplied standard errors; intervals = estimate ±1.96 SE, no meta-analysis or pooled effect.'

def make_data(rng):
    effect=rng.normal(.3,.18,7);se=rng.uniform(.05,.15,7)
    return {'effect':effect,'se':se,'labels':[f'Experiment {i+1}' for i in range(7)]}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);y=np.arange(7)
    ax.axvspan(-.3,0,color=fade(C[2],.05));ax.axvspan(0,.9,color=fade(C[1],.05));ax.axvline(0,ls='--',lw=1,color='#8A96A9')
    for i,(e,se) in enumerate(zip(d['effect'],d['se'])):
        ax.errorbar(e,i,xerr=1.96*se,fmt='s',ms=8,color=C[i%5],capsize=4,lw=2)
    ax.set(yticks=y,yticklabels=d['labels'],xlabel='Effect estimate (a.u.)',xlim=(min(-.3,float(np.min(d['effect']-1.96*d['se']))-.05),max(.9,float(np.max(d['effect']+1.96*d['se']))+.05)),ylim=(-.8,6.8));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
