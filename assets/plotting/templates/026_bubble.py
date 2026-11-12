"""气泡散点图 — independently authored example.
Point area is proportional to the size variable, not radius; color is a separate numerical variable.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 26
TITLE = 'A third dimension in area'
SUBTITLE = 'Marker area encodes size · continuous color encodes response'
METHOD = 'Point area is proportional to the size variable, not radius; color is a separate numerical variable.'

def make_data(rng):
    x=rng.uniform(0,10,70);y=1.5+.55*x+rng.normal(0,1,70);size=rng.uniform(10,100,70)
    return {'x':x,'y':y,'size':size,'color':np.sin(x/3)+y/7}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    m=ax.scatter(d['x'],d['y'],s=d['size']*5,c=d['color'],cmap=SPECTRAL,alpha=.72,edgecolor='white',lw=1)
    colorbar(fig,m,ax,'Response (a.u.)')
    handles=[ax.scatter([],[],s=v*5,color='#9AAAC2',alpha=.6,label=str(v)) for v in [20,50,100]]
    ax.legend(handles=handles,title='Area variable',loc='upper left',labelspacing=1.2)
    ax.set(xlabel='Feature 1 (a.u.)',ylabel='Feature 2 (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
