"""Bode幅频–相频图 — independently authored example.
Transfer function H(s)=ω0²/(s²+2ζω0s+ω0²), f0=30 Hz, ζ=0.35. scipy.signal.bode receives angular frequency 2πf.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 65
TITLE = 'Frequency response'
SUBTITLE = 'Second-order low-pass · magnitude and phase'
METHOD = 'Transfer function H(s)=ω0²/(s²+2ζω0s+ω0²), f0=30 Hz, ζ=0.35. scipy.signal.bode receives angular frequency 2πf.'

def make_data(rng):
    return {'frequency_hz':np.logspace(-1,3,500),'natural_hz':30.,'damping':.35}

@publication
def draw(d):
    f=d['frequency_hz'];w0=2*np.pi*d['natural_hz'];system=signal.TransferFunction([w0*w0],[1,2*d['damping']*w0,w0*w0]);_,mag,phase=signal.bode(system,w=2*np.pi*f)
    fig,axs=canvas(TITLE,SUBTITLE,2,1,sharex=True);a,b=axs[:,0]
    a.semilogx(f,mag,color=C[0],lw=2.7);a.axhline(-3,color=fade(C[2],.7),ls='--',lw=1);a.set(ylabel='Magnitude (dB)')
    b.semilogx(f,phase,color=C[1],lw=2.7);b.set(xlabel='Frequency (Hz)',ylabel='Phase (degrees)');a.grid(True,which='both',alpha=.5);b.grid(True,which='both',alpha=.5);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
