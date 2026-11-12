"""二维错位光谱堆叠图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 6
TITLE = 'Spectral procession'
SUBTITLE = 'Offset traces · sample index increases upward'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(400,800,450);y=np.array([np.exp(-((x-490-i*17)/(22+i))**2)+.5*np.exp(-((x-660+i*4)/30)**2) for i in range(9)])
    return {'x':x,'spectra':y,'offset':.42}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,y in enumerate(d['spectra']):
        c=SPECTRAL(i/8);base=i*d['offset'];gradient_fill(ax,d['x'],y+base,c,base,alpha=.6)
        ax.plot(d['x'],y+base,color=c,lw=1.7)
        ax.text(795,base+.06,f'{i+1:02}',color=c,ha='right',fontsize=8)
    ax.set(xlabel='Wavelength (nm)',ylabel='Intensity + offset (a.u.)',xlim=(400,800),ylim=(0,max(float(np.max(v)+i*d['offset']) for i,v in enumerate(d['spectra']))*1.07));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
