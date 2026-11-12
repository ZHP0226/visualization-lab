"""三维线框图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 44
TITLE = 'The geometry of a field'
SUBTITLE = 'Color-coded mesh lines · no hidden interpolation'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    X,Y,Z=fields(44);return {'X':X,'Y':Y,'Z':Z}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE,projection='3d');X=d['X'];Y=d['Y'];Z=d['Z']
    for i in range(0,len(X),2):ax.plot(X[i],Y[i],Z[i],color=SPECTRAL(i/(len(X)-1)),lw=1.1)
    for j in range(0,X.shape[1],2):ax.plot(X[:,j],Y[:,j],Z[:,j],color=fade(C[0],.3),lw=.6)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='z (a.u.)');ax.view_init(30,-60);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
