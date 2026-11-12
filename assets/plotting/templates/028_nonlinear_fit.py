"""非线性拟合图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 28
TITLE = 'A saturating response'
SUBTITLE = 'Michaelis–Menten form · nonlinear least squares'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(.05,10,65);return {'x':x,'y':3.5*x/(2.2+x)+rng.normal(0,.13,len(x))}

@publication
def draw(d):
    x=d['x'];y=d['y'];model=lambda x,v,k:v*x/(k+x);p,cov=optimize.curve_fit(model,x,y,p0=[3,2],bounds=(0,np.inf))
    xx=np.linspace(0,10,400);fig,ax=canvas(TITLE,SUBTITLE)
    gradient_fill(ax,xx,model(xx,*p),C[1],alpha=.3)
    ax.scatter(x,y,s=38,c=x,cmap=SPECTRAL,edgecolor='white',lw=.5,zorder=3)
    ax.plot(xx,model(xx,*p),color=C[1],lw=3,label=f'Fit: Vmax={p[0]:.2f}, K={p[1]:.2f}')
    ax.set(xlabel='Input (a.u.)',ylabel='Response (a.u.)',xlim=(0,10),ylim=(0,3.7));legend(ax,loc='lower right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
