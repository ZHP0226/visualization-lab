"""峰拟合与分峰图 — independently authored example.
Least-squares fit to synthetic three-Gaussian data; centers, widths, amplitudes and baseline are fitted, not manually traced.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 8
TITLE = 'Inside the resonance'
SUBTITLE = 'Three Gaussian components · least-squares decomposition'
METHOD = 'Least-squares fit to synthetic three-Gaussian data; centers, widths, amplitudes and baseline are fitted, not manually traced.'

def make_data(rng):
    x=np.linspace(400,760,350)
    components=np.array([1.1*np.exp(-.5*((x-490)/23)**2),.8*np.exp(-.5*((x-550)/31)**2),.65*np.exp(-.5*((x-638)/26)**2)])
    return {'x':x,'observed':components.sum(0)+.04+rng.normal(0,.025,len(x))}

@publication
def draw(d):
    def model(x,*p):return p[-1]+sum(p[j]*np.exp(-.5*((x-p[j+1])/p[j+2])**2) for j in [0,3,6])
    x=d['x'];y=d['observed'];p,_=optimize.curve_fit(model,x,y,p0=[1,490,23,.8,550,30,.6,638,26,.04],bounds=([0,450,5,0,510,5,0,600,5,-.1],[2,520,60,2,590,70,2,680,60,.2]))
    fig,ax=canvas(TITLE,SUBTITLE)
    ax.scatter(x[::3],y[::3],s=13,color='#A4ADBD',alpha=.75,label='Synthetic measurements')
    for i,j in enumerate([0,3,6]):
        v=p[j]*np.exp(-.5*((x-p[j+1])/p[j+2])**2);gradient_fill(ax,x,v,C[i],alpha=.58);ax.plot(x,v,color=C[i],lw=1.3,label=f'Peak {i+1}')
    ax.plot(x,model(x,*p),color=INK,lw=2,label='Total fit');ax.set(xlabel='Wavelength (nm)',ylabel='Intensity (a.u.)');legend(ax,ncol=2);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
