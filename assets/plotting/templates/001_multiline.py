"""单曲线／多曲线图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 1
TITLE = 'Resonance atlas'
SUBTITLE = 'Five traces · continuous color · gradient envelopes'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(400,800,600)
    y=np.array([(.9+.1*i)*np.exp(-.5*((x-490-i*28)/(19+i*2))**2)+.38*np.exp(-.5*((x-670-i*5)/31)**2)+.035 for i in range(5)])
    return {'x':x,'y':y}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,y in enumerate(d['y']):
        c=C[i];gradient_fill(ax,d['x'],y,c,alpha=.22)
        ax.plot(d['x'],y,color=c,lw=2.5,ls=LINESTYLES[i],label=f'Sample {i+1}')
    ax.set(xlabel='Wavelength (nm)',ylabel='Intensity (a.u.)',xlim=(400,800),ylim=(0,1.6))
    legend(ax,ncol=3,loc='upper right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
