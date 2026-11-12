"""Kaplan–Meier曲线＋风险表 — independently authored example.
Product-limit KM computed from observed durations/event flags; + marks right-censoring; risk table counts duration≥time (immediately before time). No confidence bands or treatment efficacy claims; n=90 synthetic subjects/cohort.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 80
TITLE = 'Time to an event'
SUBTITLE = 'Right-censored Kaplan–Meier · censor marks + risk table'
METHOD = 'Product-limit KM computed from observed durations/event flags; + marks right-censoring; risk table counts duration≥time (immediately before time). No confidence bands or treatment efficacy claims; n=90 synthetic subjects/cohort.'

def make_data(rng):
    dur=[];evt=[]
    for scale in [15,23]:
        event=rng.exponential(scale,90);censor=rng.uniform(10,30,90);dur.append(np.minimum(event,censor));evt.append((event<=censor).astype(int))
    return {'duration_months':dur,'event':evt,'risk_times':[0,6,12,18,24,30]}

@publication
def draw(d):
    fig,axs=canvas(TITLE,SUBTITLE,2,1,gridspec_kw={'height_ratios':[4,1]});ax,tab=axs[:,0];fig.subplots_adjust(hspace=.38);times=d['risk_times']
    for i,(t,event) in enumerate(zip(d['duration_months'],d['event'])):
        x,S,_,_=km_estimate(t,event);xx=np.r_[x,max(t)];ss=np.r_[S,S[-1]];ax.step(xx,ss,where='post',color=C[i],lw=2.6,label=f'Cohort {chr(65+i)} (n={len(t)})')
        cens=t[event==0];ix=np.searchsorted(x,cens,side='right')-1;ax.scatter(cens,S[ix],marker='+',s=38,color=C[i],lw=1)
        for j,v in enumerate(times):tab.text(v,1-i,str(np.count_nonzero(t>=v)),ha='center',va='center',color=C[i],fontsize=10)
    ax.set(xlim=(0,30),ylim=(0,1.04),ylabel='Event-free probability');legend(ax)
    tab.set(xlim=(0,30),ylim=(-.6,1.6),yticks=[1,0],yticklabels=['Cohort A','Cohort B'],xticks=times,xlabel='Time (months)',ylabel='Number at risk');tab._vl_table=True;tab.grid(False);tab.tick_params(axis='y',pad=12)
    for s in tab.spines.values():s.set_visible(False)
    tab.tick_params(length=0);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
