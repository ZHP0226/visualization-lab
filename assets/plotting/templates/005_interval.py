"""区间带曲线 — independently authored example.
Pointwise t confidence interval of the mean, n=30; not a simultaneous band or prediction interval.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 5
TITLE = 'Uncertainty in motion'
SUBTITLE = 'Mean with pointwise 95% t intervals · 30 replicates'
METHOD = 'Pointwise t confidence interval of the mean, n=30; not a simultaneous band or prediction interval.'

def make_data(rng):
    x=np.linspace(0,10,150);samples=1.8*(1-np.exp(-x/3))+rng.normal(0,.3,(30,len(x)))
    return {'x':x,'samples':samples}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);x=d['x'];v=d['samples'];m=v.mean(0);se=stats.sem(v,axis=0);ci=stats.t.ppf(.975,len(v)-1)*se
    ax.fill_between(x,m-ci,m+ci,color=fade(C[0],.23),label='Pointwise 95% t interval')
    colorline(ax,x,m,lw=3.2)
    ax.set(xlabel='Time (s)',ylabel='Response (a.u.)');legend(ax,loc='lower right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
