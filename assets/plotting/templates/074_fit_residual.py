"""拟合＋残差双面板 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 74
TITLE = 'A fit, and what it misses'
SUBTITLE = 'Exponential relaxation · residuals share the x axis'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(0,10,90);return {'x':x,'y':2.6*np.exp(-x/2.3)+.35+rng.normal(0,.07,len(x))}

@publication
def draw(d):
    x=d['x'];y=d['y'];model=lambda x,a,tau,b:a*np.exp(-x/tau)+b;p,_=optimize.curve_fit(model,x,y,p0=[2.5,2,.3]);pred=model(x,*p)
    fig,axs=canvas(TITLE,SUBTITLE,2,1,sharex=True,gridspec_kw={'height_ratios':[3,1]});a,b=axs[:,0]
    a.scatter(x,y,s=26,color=fade(C[0],.6),edgecolor='white',lw=.3,label='Observations');a.plot(x,pred,color=C[1],lw=2.6,label=f'Fit: τ={p[1]:.3f}');a.set_ylabel('Response (a.u.)');legend(a)
    b.axhline(0,color='#8E9FB9',lw=1);b.scatter(x,y-pred,c=y-pred,cmap=DIV,vmin=-.18,vmax=.18,s=28);b.set(xlabel='Time (s)',ylabel='Residual (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
