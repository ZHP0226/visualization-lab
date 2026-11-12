"""短时傅里叶时频谱 — independently authored example.
SciPy STFT with spectrum scaling; amplitude is |Z|, displayed as 20 log10(|Z|/1V), not a calibrated PSD. 192-sample Hann window, hop 24, FFT length 512.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 69
TITLE = 'A signal changing frequency'
SUBTITLE = 'Hann-window STFT · amplitude in dB relative to 1 V'
METHOD = 'SciPy STFT with spectrum scaling; amplitude is |Z|, displayed as 20 log10(|Z|/1V), not a calibrated PSD. 192-sample Hann window, hop 24, FFT length 512.'

def make_data(rng):
    fs=256.;t=np.arange(1536)/fs;x=signal.chirp(t,f0=8,f1=80,t1=6)+.6*np.sin(2*np.pi*45*t)*np.exp(-((t-3)/.8)**2)+rng.normal(0,.06,len(t))
    return {'time_s':t,'signal_v':x,'sample_rate_hz':fs}

@publication
def draw(d):
    f,t,Z=signal.stft(d['signal_v'],fs=d['sample_rate_hz'],window='hann',nperseg=192,noverlap=168,nfft=512,boundary=None,padded=False)
    db=20*np.log10(np.maximum(abs(Z),1e-8));fig,ax=canvas(TITLE,SUBTITLE)
    m=ax.pcolormesh(t,f,db,cmap=SUN,vmin=-55,vmax=-5,shading='auto',rasterized=True)
    ax.set(xlabel='Time (s)',ylabel='Frequency (Hz)',ylim=(0,100));ax.grid(False);colorbar(fig,m,ax,'STFT amplitude (dB re 1 V)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
