"""概率校准曲线 — independently authored example.
Quantile-bin reliability points computed from observed binary outcomes; histogram uses equal-width bins and is separately labeled. No confidence intervals are implied.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 63
TITLE = 'Can we trust the probability?'
SUBTITLE = 'Reliability curve · quantile bins · sample counts'
METHOD = 'Quantile-bin reliability points computed from observed binary outcomes; histogram uses equal-width bins and is separately labeled. No confidence intervals are implied.'

def make_data(rng):
    return classify_data(rng,1200)

@publication
def draw(d):
    from sklearn.calibration import calibration_curve
    fig,axs=canvas(TITLE,SUBTITLE,2,1,gridspec_kw={'height_ratios':[3,1]});a,b=axs[:,0];y=d['labels'];s=d['score'];frac,mean=calibration_curve(y,s,n_bins=10,strategy='quantile')
    a.plot([0,1],[0,1],ls='--',color='#95A3BA',lw=1.2,label='Perfect calibration');a.plot(mean,frac,'o-',color=C[0],ms=7,lw=2.4,label='Observed fractions')
    a.set(xlim=(0,1),ylim=(0,1),ylabel='Observed positive fraction');legend(a)
    b.hist(s,bins=np.linspace(0,1,16),color=fade(C[1],.7),edgecolor='white');b.set(xlabel='Predicted probability',ylabel='Count',xlim=(0,1));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
