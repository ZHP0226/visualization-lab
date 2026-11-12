"""功率谱密度图 — independently authored example.
Welch one-sided PSD, 1024-point Hann segments, 50% overlap, 512 Hz sampling. Density units V²/Hz; integration approximates signal variance.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 68
TITLE = 'Frequencies in the noise'
SUBTITLE = 'Welch PSD · Hann window · density normalization'
METHOD = 'Welch one-sided PSD, 1024-point Hann segments, 50% overlap, 512 Hz sampling. Density units V²/Hz; integration approximates signal variance.'

def make_data(rng):
    fs=512.;t=np.arange(8192)/fs;x=1.4*np.sin(2*np.pi*20*t)+.7*np.sin(2*np.pi*68*t)+rng.normal(0,.45,len(t))
    return {'time_s':t,'signal_v':x,'sample_rate_hz':fs}

@publication
def draw(d):
    f,p=signal.welch(d['signal_v'],fs=d['sample_rate_hz'],window='hann',nperseg=1024,noverlap=512,detrend='constant',scaling='density')
    fig,ax=canvas(TITLE,SUBTITLE);ax.semilogy(f,p,color=C[0],lw=2)
    for hz in [20,68]:
        j=np.argmin(abs(f-hz));ax.annotate(f'{hz} Hz',xy=(f[j],p[j]),xytext=(hz+10,p[j]*1.5),arrowprops={'arrowstyle':'-','color':C[2]},color=C[2],fontsize=10)
    ax.set(xlabel='Frequency (Hz)',ylabel='PSD (V² / Hz)',xlim=(0,150),ylim=(1e-5,5));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
