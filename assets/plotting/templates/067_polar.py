"""极坐标角分布图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 67
TITLE = 'Angular signatures'
SUBTITLE = 'Normalized intensity · radial scale shared across curves'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    theta=np.linspace(0,2*np.pi,500);p=np.cos(theta)**2;q=(.75*np.cos(theta-.45)**2+.25*np.sin(3*theta)**2);q=q/q.max()
    return {'theta':theta,'first':p,'second':q}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE,projection='polar')
    for y,c,label in [(d['first'],C[0],'Mode A'),(d['second'],C[1],'Mode B')]:
        ax.fill(d['theta'],y,color=fade(c,.15));ax.plot(d['theta'],y,color=c,lw=2.5,label=label)
    ax.set_ylim(0,1.1);ax.set_yticks([.25,.5,.75,1]);ax.tick_params(pad=8,labelsize=9);legend(ax,loc='upper right',bbox_to_anchor=(1,1));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
