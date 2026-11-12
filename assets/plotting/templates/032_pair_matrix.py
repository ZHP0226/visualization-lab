"""散点矩阵 Pair Plot — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 32
TITLE = 'Relationships at a glance'
SUBTITLE = 'Four features · shared populations · diagonal histograms'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    z=rng.normal(size=(240,4));z[:,1]=.7*z[:,0]+.6*z[:,1];z[:,2]=-.5*z[:,0]+.8*z[:,2];g=np.repeat([0,1],120);z[g==1]+=[1.8,.8,-.5,1.2]
    return {'X':z,'group':g}

@publication
def draw(d):
    fig,axs=canvas(TITLE,SUBTITLE,4,4,figsize=(9.6,8.2));fig.subplots_adjust(hspace=.12,wspace=.12,bottom=.11)
    for i in range(4):
        for j in range(4):
            ax=axs[i,j]
            for g in [0,1]:
                v=d['X'][d['group']==g]
                if i==j:ax.hist(v[:,i],bins=16,density=True,color=fade(C[g],.5),edgecolor='white',lw=.4)
                else:ax.scatter(v[:,j],v[:,i],s=8,color=fade(C[g],.5),edgecolor='none')
            if i==3:ax.set_xlabel(f'F{j+1}',fontsize=9)
            else:ax.tick_params(labelbottom=False)
            if j==0:ax.set_ylabel(f'F{i+1}',fontsize=9)
            else:ax.tick_params(labelleft=False)
            ax.tick_params(labelsize=7)
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
