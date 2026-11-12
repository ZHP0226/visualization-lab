"""三维瀑布光谱图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 7
TITLE = 'A spectrum in depth'
SUBTITLE = 'Three-dimensional waterfall · translucent spectral curtains'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(400,800,220);p=np.arange(10)
    z=np.array([np.exp(-((x-490-i*15)/24)**2)+.45*np.exp(-((x-680+i*3)/32)**2) for i in p])
    return {'x':x,'parameter':p,'z':z}

@publication
def draw(d):
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    fig,ax=canvas(TITLE,SUBTITLE,projection='3d')
    for i,z in enumerate(d['z']):
        c=SPECTRAL(i/9);x=d['x'];y=np.full(len(x),i)
        ax.plot(x,y,z,color=c,lw=1.8)
        verts=list(zip(x,y,z))+[(x[-1],i,0),(x[0],i,0)]
        ax.add_collection3d(Poly3DCollection([verts],facecolor=fade(c,.2),edgecolor='none'))
    ax.set(xlabel='Wavelength (nm)',ylabel='Sample index',zlabel='Intensity (a.u.)',zlim=(0,1.5));ax.view_init(29,-64);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
