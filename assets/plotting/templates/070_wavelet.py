"""小波时频图 — independently authored example.
Independent discrete complex-Morlet convolution, ω0=6 with zero-mean correction; L2 scale normalization 1/√scale. Pseudo-frequency=ω0 fs/(2π scale). Power is coefficient magnitude² (arbitrary units, not PSD); √2-scale edge cone is masked.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 70
TITLE = 'Local scale, local time'
SUBTITLE = 'Complex Morlet CWT · edge-affected coefficients masked'
METHOD = 'Independent discrete complex-Morlet convolution, ω0=6 with zero-mean correction; L2 scale normalization 1/√scale. Pseudo-frequency=ω0 fs/(2π scale). Power is coefficient magnitude² (arbitrary units, not PSD); √2-scale edge cone is masked.'

def make_data(rng):
    fs=256.;t=np.arange(1536)/fs;x=signal.chirp(t,f0=8,f1=80,t1=6)+.6*np.sin(2*np.pi*45*t)*np.exp(-((t-3)/.8)**2)
    return {'time_s':t,'signal_v':x,'sample_rate_hz':fs,'frequencies_hz':np.geomspace(4,100,100),'omega0':6.}

@publication
def draw(d):
    x=d['signal_v'];t=d['time_s'];fs=d['sample_rate_hz'];freq=d['frequencies_hz'];w=d['omega0'];power=[]
    for f in freq:
        scale=w*fs/(2*np.pi*f);u=np.arange(-int(np.ceil(5*scale)),int(np.ceil(5*scale))+1)/scale
        wave=np.pi**(-.25)*(np.exp(1j*w*u)-np.exp(-w*w/2))*np.exp(-u*u/2)/np.sqrt(scale)
        coeff=signal.fftconvolve(x,np.conj(wave[::-1]),mode='same');p=abs(coeff)**2;edge=np.sqrt(2)*scale/fs;p[(t<edge)|(t>t[-1]-edge)]=np.nan;power.append(p)
    P=np.array(power);fig,ax=canvas(TITLE,SUBTITLE);m=ax.pcolormesh(t,freq,10*np.log10(np.maximum(P,1e-9)),shading='auto',cmap=SUN,vmin=-22,vmax=15,rasterized=True)
    ax.set(xlabel='Time (s)',ylabel='Pseudo-frequency (Hz)',yscale='log',ylim=(4,100));ax.set_yticks([5,10,20,40,80],labels=['5','10','20','40','80']);ax.grid(False);colorbar(fig,m,ax,'Wavelet power (dB, a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
