"""Bland–Altman一致性图 — independently authored example.
Bland–Altman limits of agreement = bias ±1.96 sample SD of paired differences; these lines are not confidence intervals.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 31
TITLE = 'Agreement, not correlation'
SUBTITLE = 'Bias ± 1.96 sample SD · paired measurements'
METHOD = 'Bland–Altman limits of agreement = bias ±1.96 sample SD of paired differences; these lines are not confidence intervals.'

def make_data(rng):
    truth=rng.uniform(1,9,100);return {'a':truth+rng.normal(0,.25,100),'b':truth+.18+rng.normal(0,.35,100)}

@publication
def draw(d):
    a=d['a'];b=d['b'];m=(a+b)/2;delta=b-a;bias=delta.mean();sd=delta.std(ddof=1)
    fig,ax=canvas(TITLE,SUBTITLE);ax.axhspan(bias-1.96*sd,bias+1.96*sd,color=fade(C[0],.07))
    ax.scatter(m,delta,c=m,cmap=SPECTRAL,s=40,edgecolor='white',lw=.5)
    for value,label,ls in [(bias,'Bias','-'),(bias+1.96*sd,'Upper LoA','--'),(bias-1.96*sd,'Lower LoA','--')]:
        ax.axhline(value,color=C[0],ls=ls,lw=1.5,label=f'{label}: {value:.3f}')
    ax.set(xlabel='Mean of methods (a.u.)',ylabel='Method B − method A (a.u.)');legend(ax,ncol=3,loc='upper center',fontsize=8);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
