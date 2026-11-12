"""主图＋局部放大图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 73
TITLE = 'The detail within the whole'
SUBTITLE = 'A local feature · linked zoomed inset'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(0,10,700);y=np.exp(-((x-3)/.7)**2)+.08*np.exp(-((x-7)/.23)**2)+.015*np.sin(15*x)
    return {'x':x,'y':y}

@publication
def draw(d):
    from mpl_toolkits.axes_grid1.inset_locator import mark_inset
    fig,ax=canvas(TITLE,SUBTITLE);colorline(ax,d['x'],d['y']);gradient_fill(ax,d['x'],d['y'],C[0],alpha=.25)
    ins=ax.inset_axes([.52,.34,.40,.51]);style(ins);ins.plot(d['x'],d['y'],color=C[2],lw=1.7);ins.set(xlim=(6.4,7.6),ylim=(-.025,.11));ins.tick_params(labelsize=7);ins.set_title('Local resonance',fontsize=9)
    mark_inset(ax,ins,loc1=2,loc2=4,fc='none',ec='#B8C4D8',lw=.8)
    ax.set(xlabel='Position (a.u.)',ylabel='Response (a.u.)',xlim=(0,10),ylim=(-.06,1.12));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
