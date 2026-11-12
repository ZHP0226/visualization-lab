"""三维曲面图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 43
TITLE = 'Color over curvature'
SUBTITLE = 'A quantitative surface · perspective projection'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    X,Y,Z=fields(85);return {'X':X,'Y':Y,'Z':Z}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE,projection='3d');m=ax.plot_surface(d['X'],d['Y'],d['Z'],cmap=DIV,vmin=-1,vmax=1,linewidth=0,antialiased=True,rstride=1,cstride=1)
    ax.contour(d['X'],d['Y'],d['Z'],zdir='z',offset=-1,cmap=DIV,vmin=-1,vmax=1,levels=np.linspace(-1,1,13),linewidths=.9)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='z (a.u.)',zlim=(-1,1));ax.view_init(30,-60);colorbar(fig,m,ax,'Amplitude (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
