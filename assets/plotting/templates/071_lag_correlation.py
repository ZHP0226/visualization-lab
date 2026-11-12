"""自相关／互相关滞后图 — independently authored example.
Signals demeaned before correlation; normalization uses full-signal energy, not overlap-dependent unbiased normalization. Positive lag means y is delayed relative to x; injected delay=12 samples.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 71
TITLE = 'Timing the relationship'
SUBTITLE = 'Autocorrelation + cross-correlation · normalized global energy'
METHOD = 'Signals demeaned before correlation; normalization uses full-signal energy, not overlap-dependent unbiased normalization. Positive lag means y is delayed relative to x; injected delay=12 samples.'

def make_data(rng):
    fs=100.;t=np.arange(1200)/fs;x=signal.sosfilt(signal.butter(3,6,fs=fs,output='sos'),rng.normal(size=len(t)));y=np.r_[np.zeros(12),x[:-12]]+rng.normal(0,.06,len(t))
    return {'x':x,'y':y,'sample_rate_hz':fs,'delay_samples':12}

@publication
def draw(d):
    x=d['x']-np.mean(d['x']);y=d['y']-np.mean(d['y']);lags=signal.correlation_lags(len(y),len(x));cross=signal.correlate(y,x)/np.sqrt(np.sum(x*x)*np.sum(y*y));auto=signal.correlate(x,x)/np.sum(x*x)
    fig,axs=canvas(TITLE,SUBTITLE,2,1);a,b=axs[:,0];mask=(lags>=0)&(lags<=100);a.plot(lags[mask]/d['sample_rate_hz'],auto[mask],color=C[0],lw=2.4);a.set(xlabel='Lag (s)',ylabel='Autocorrelation')
    mask=abs(lags)<=80;b.plot(lags[mask]/d['sample_rate_hz'],cross[mask],color=C[1],lw=2.4);b.axvline(d['delay_samples']/d['sample_rate_hz'],color=C[2],ls='--',lw=1,label='Injected delay = 0.12 s');b.set(xlabel='Lag (s): positive means y lags x',ylabel='Cross-correlation');legend(b);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
