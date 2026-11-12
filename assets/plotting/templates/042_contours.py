"""等高线／填色等高线图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 42
TITLE = 'Topography of a field'
SUBTITLE = 'Filled contours · labeled isolines'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    X,Y,Z=fields(130);return {'X':X,'Y':Y,'Z':Z}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);m=ax.contourf(d['X'],d['Y'],d['Z'],levels=np.linspace(-1,1,21),cmap=DIV,extend='both')
    c=ax.contour(d['X'],d['Y'],d['Z'],levels=np.arange(-.6,.9,.3),colors=INK,linewidths=.65,alpha=.7);ax.clabel(c,fmt='%.1f',fontsize=8)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',aspect='equal');ax.grid(False);colorbar(fig,m,ax,'Amplitude (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
