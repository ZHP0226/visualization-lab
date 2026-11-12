"""平行坐标图 — independently authored example.
Each feature is separately min–max normalized across the 42 samples. Axes are dimensionless; raw data are retained.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 49
TITLE = 'Profiles across dimensions'
SUBTITLE = 'Each axis min–max normalized · 42 synthetic profiles'
METHOD = 'Each feature is separately min–max normalized across the 42 samples. Axes are dimensionless; raw data are retained.'

def make_data(rng):
    g=np.repeat([0,1,2],14);X=rng.normal(0,.18,(42,6))+np.array([[.2,.7,.4,.8,.3,.6],[.7,.3,.8,.4,.7,.3],[.5,.5,.3,.3,.8,.8]])[g]
    return {'X':X,'group':g}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);X=d['X'];Z=(X-X.min(0))/(X.max(0)-X.min(0));x=np.arange(6)
    for i,v in enumerate(Z):ax.plot(x,v,color=fade(C[d['group'][i]],.24),lw=1.2)
    for g in range(3):ax.plot(x,np.mean(Z[d['group']==g],axis=0),color=C[g],lw=3,label=f'Group {g+1} mean')
    for j in x:ax.axvline(j,color='#D2DAE8',lw=1,zorder=0)
    ax.set(xticks=x,xticklabels=[f'Metric {i+1}' for i in x],ylabel='Within-feature normalized value',ylim=(-.05,1.12));legend(ax,ncol=3,fontsize=8);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
