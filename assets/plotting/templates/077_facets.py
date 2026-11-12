"""分面小图矩阵 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 77
TITLE = 'One pattern, many conditions'
SUBTITLE = 'Three materials × three settings · shared axis scales'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    x=np.linspace(0,5,35);Y=np.array([[.4+i*.5+(.4+j*.25)*x+rng.normal(0,.25,len(x)) for j in range(3)] for i in range(3)])
    return {'x':x,'Y':Y}

@publication
def draw(d):
    fig,axs=canvas(TITLE,SUBTITLE,3,3,figsize=(10.8,8.6),sharex=True,sharey=True);fig.subplots_adjust(hspace=.4,wspace=.15)
    for i in range(3):
        for j in range(3):
            ax=axs[i,j];x=d['x'];y=d['Y'][i,j];p=np.polyfit(x,y,1);ax.scatter(x,y,color=fade(C[j],.55),s=16,edgecolor='none');ax.plot(x,np.polyval(p,x),color=C[j],lw=1.8)
            if i==2:ax.set_xlabel(f'Setting {j+1}\nInput (a.u.)',fontsize=7)
            if j==0:ax.set_ylabel(f'Material {chr(65+i)}\nResponse (a.u.)',fontsize=7)
            ax.tick_params(labelsize=7)
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
