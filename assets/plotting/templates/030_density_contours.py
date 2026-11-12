"""二变量密度等高线图 — independently authored example.
Contours are numerical KDE density levels, not probability-content or significance regions.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 30
TITLE = 'Contours of association'
SUBTITLE = 'Bivariate Gaussian KDE · density-valued contours'
METHOD = 'Contours are numerical KDE density levels, not probability-content or significance regions.'

def make_data(rng):
    xy=np.concatenate([rng.multivariate_normal([-1,-.6],[[.55,.25],[.25,.5]],260),rng.multivariate_normal([1.2,1],[[.35,-.1],[-.1,.5]],200)])
    return {'xy':xy}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);v=d['xy'];x=np.linspace(-3.5,3.5,120);y=np.linspace(-3,3.5,120);X,Y=np.meshgrid(x,y)
    Z=stats.gaussian_kde(v.T)(np.vstack([X.ravel(),Y.ravel()])).reshape(X.shape)
    m=ax.contourf(X,Y,Z,levels=14,cmap=FLOW);ax.contour(X,Y,Z,levels=7,colors='white',linewidths=.65,alpha=.75)
    ax.scatter(v[::3,0],v[::3,1],s=7,color=fade(INK,.2));colorbar(fig,m,ax,'Density (1 / a.u.²)')
    ax.set(xlabel='Feature 1 (a.u.)',ylabel='Feature 2 (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
