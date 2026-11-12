"""雷达图 — independently authored example.
All axes are synthetic dimensionless scores on the same 0–1 range; no cross-unit comparison or performance claim.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 50
TITLE = 'Multivariate signatures'
SUBTITLE = 'Shared 0–1 score scale · no implied physical units'
METHOD = 'All axes are synthetic dimensionless scores on the same 0–1 range; no cross-unit comparison or performance claim.'

def make_data(rng):
    return {'scores':np.array([[.88,.62,.83,.55,.76,.91],[.61,.9,.64,.84,.62,.7],[.76,.72,.58,.92,.89,.63]])}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE,projection='polar');theta=np.linspace(0,2*np.pi,6,endpoint=False)
    for i,v in enumerate(d['scores']):
        ax.plot(np.r_[theta,theta[0]],np.r_[v,v[0]],color=C[i],lw=2.5,label=f'Design {chr(65+i)}');ax.fill(np.r_[theta,theta[0]],np.r_[v,v[0]],color=fade(C[i],.12))
    ax.set_theta_offset(np.pi/2);ax.set_theta_direction(-1);ax.set_xticks(theta,labels=['Speed','Accuracy','Stability','Efficiency','Coverage','Robustness'])
    ax.set_ylim(0,1);ax.set_yticks([.25,.5,.75,1],labels=['.25','.50','.75','1.0']);ax.tick_params(pad=9,labelsize=9);legend(ax,loc='upper right',bbox_to_anchor=(1,1));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
