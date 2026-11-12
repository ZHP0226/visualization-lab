"""残差诊断图 — independently authored example.
OLS residuals = observed−fitted. Standardization uses residual RMS with n−2 df; Q–Q line is fitted by scipy.stats.probplot. Synthetic heteroscedasticity is intentional.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 58
TITLE = 'What the residuals reveal'
SUBTITLE = 'OLS diagnostics · common residual definition'
METHOD = 'OLS residuals = observed−fitted. Standardization uses residual RMS with n−2 df; Q–Q line is fitted by scipy.stats.probplot. Synthetic heteroscedasticity is intentional.'

def make_data(rng):
    x=np.linspace(0,10,140);return {'x':x,'y':1+.8*x+rng.normal(0,.3+.08*x,len(x))}

@publication
def draw(d):
    x=d['x'];y=d['y'];p=np.polyfit(x,y,1);fit=np.polyval(p,x);r=y-fit;z=r/np.sqrt(np.sum(r*r)/(len(r)-2))
    fig,axs=canvas(TITLE,SUBTITLE,2,2,figsize=(10.5,8.2));a,b,c,e=axs.flat;label_panels(axs)
    a.scatter(fit,r,c=fit,cmap=SPECTRAL,s=24,alpha=.7);a.axhline(0,color=C[0],lw=1);a.set(xlabel='Fitted',ylabel='Residual')
    qq=stats.probplot(r,dist='norm');b.scatter(qq[0][0],qq[0][1],s=23,color=C[1]);xx=qq[0][0];b.plot(xx,qq[1][1]+qq[1][0]*xx,color=C[2],lw=1.5);b.set(xlabel='Theoretical normal quantile',ylabel='Ordered residual')
    c.hist(r,bins=20,color=fade(C[0],.65),edgecolor='white');c.set(xlabel='Residual',ylabel='Count')
    e.scatter(fit,np.sqrt(abs(z)),c=fit,cmap=SPECTRAL,s=24,alpha=.7);e.set(xlabel='Fitted',ylabel='√|standardized residual|');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
