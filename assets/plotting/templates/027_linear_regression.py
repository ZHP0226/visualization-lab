"""线性回归图 — independently authored example.
OLS mean-response t confidence band uses residual df=n-2. Band is not a prediction interval.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 27
TITLE = 'A trend with uncertainty'
SUBTITLE = 'OLS · pointwise 95% confidence band for the mean'
METHOD = 'OLS mean-response t confidence band uses residual df=n-2. Band is not a prediction interval.'

def make_data(rng):
    x=np.linspace(0,10,80);y=1.2+.72*x+rng.normal(0,.9,len(x))
    return {'x':x,'y':y}

@publication
def draw(d):
    x=d['x'];y=d['y'];fit=stats.linregress(x,y);pred=fit.intercept+fit.slope*x;n=len(x)
    sigma=np.sqrt(np.sum((y-pred)**2)/(n-2));ci=stats.t.ppf(.975,n-2)*sigma*np.sqrt(1/n+(x-x.mean())**2/np.sum((x-x.mean())**2))
    fig,ax=canvas(TITLE,SUBTITLE);ax.fill_between(x,pred-ci,pred+ci,color=fade(C[0],.2),label='95% CI of mean')
    ax.scatter(x,y,c=x,cmap=SPECTRAL,s=40,edgecolor='white',lw=.5,zorder=3);ax.plot(x,pred,color=C[0],lw=2.6,label=f'OLS   R² = {fit.rvalue**2:.3f}')
    ax.set(xlabel='Predictor (a.u.)',ylabel='Response (a.u.)');legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
