"""泰勒图 — independently authored example.
Taylor radius uses sample SD, angle=arccos(Pearson r). Contours are centered RMS differences with sample normalization (n−1). Only nonnegative correlations are supported in this quarter-plane example.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 59
TITLE = 'Agreement in one plane'
SUBTITLE = 'Standard deviation · correlation · centered RMS difference'
METHOD = 'Taylor radius uses sample SD, angle=arccos(Pearson r). Contours are centered RMS differences with sample normalization (n−1). Only nonnegative correlations are supported in this quarter-plane example.'

def make_data(rng):
    reference=rng.normal(0,1,260);pred=np.array([reference*.9+rng.normal(0,.35,260),reference*1.25+rng.normal(0,.5,260),reference*.6+rng.normal(0,.8,260),reference+rng.normal(0,.15,260)])
    return {'reference':reference,'predictions':pred}

@publication
def draw(d):
    ref=d['reference'];sr=np.std(ref,ddof=1);fig,ax=canvas(TITLE,SUBTITLE,projection='polar');ax.set_position([.14,.10,.72,.76]);ax.set_thetamin(0);ax.set_thetamax(90)
    theta=np.linspace(0,np.pi/2,120);rad=np.linspace(0,1.8,160);T,R=np.meshgrid(theta,rad);E=np.sqrt(R*R+sr*sr-2*R*sr*np.cos(T))
    cc=ax.contour(T,R,E,levels=[.25,.5,.75,1,1.25],colors='#A4B1C6',linewidths=.8);ax.clabel(cc,fmt='%.2f',fontsize=7)
    ax.plot(theta,np.full_like(theta,sr),color=fade(C[0],.4),lw=1,ls='--');ax.scatter(0,sr,marker='*',s=150,color=INK,label='Reference',zorder=5,clip_on=False)
    ax.annotate('Ref.',(0,sr),xytext=(3,4),textcoords='offset points',fontsize=5)
    for i,p in enumerate(d['predictions']):
        r=np.corrcoef(ref,p)[0,1];sd=np.std(p,ddof=1);ax.scatter(np.arccos(r),sd,color=C[i],s=90,edgecolor='white',label=f'Model {i+1}',zorder=5);ax.annotate(f'M{i+1}',(np.arccos(r),sd),xytext=(3,3),textcoords='offset points',fontsize=5)
    ticks=np.array([0,.4,.6,.8,.95,1]);ax.set_xticks(np.arccos(ticks),labels=[f'{v:g}' for v in ticks]);ax.set_ylim(0,1.8);ax.set_yticks([0,.6,1.2,1.8]);ax.set_ylabel('Standard deviation (a.u.)',labelpad=18);ax.text(.88,1.03,'r',transform=ax.transAxes,ha='center',fontsize=5);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
