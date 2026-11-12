"""Nyquist复阻抗图 — independently authored example.
Analytic impedance Z=Rs+R/(1+jωRC), Rs=8Ω, C=20µF. The plot uses −Im(Z) vertically; it is not the control-theory Nyquist stability contour.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 66
TITLE = 'Impedance in the complex plane'
SUBTITLE = 'Rs + (R || C) · equal geometric scales'
METHOD = 'Analytic impedance Z=Rs+R/(1+jωRC), Rs=8Ω, C=20µF. The plot uses −Im(Z) vertically; it is not the control-theory Nyquist stability contour.'

def make_data(rng):
    return {'frequency_hz':np.logspace(-1,5,600),'series_ohm':8.,'parallel_ohm':[65.,95.,135.],'capacitance_f':2e-5}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE)
    for i,R in enumerate(d['parallel_ohm']):
        Z=d['series_ohm']+R/(1+1j*2*np.pi*d['frequency_hz']*R*d['capacitance_f'])
        ax.plot(Z.real,-Z.imag,color=C[i],lw=2.7,label=f'R = {R:.0f} Ω');ax.scatter(Z.real[::45],-Z.imag[::45],s=22,color=C[i],edgecolor='white',lw=.4)
    ax.set(xlabel="Z′ (Ω)",ylabel='−Z″ (Ω)',aspect='equal',xlim=(0,150),ylim=(-3,84));legend(ax,ncol=3);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
