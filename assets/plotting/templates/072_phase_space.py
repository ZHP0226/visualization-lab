"""相空间轨迹图 — independently authored example.
Numerical Lorenz system, σ=10, ρ=28, β=8/3, initial (1,1,1); solve_ivp tolerances 1e−8/1e−10. First 5 time units omitted as transient; not a physical experimental dataset.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 72
TITLE = 'A dynamical signature'
SUBTITLE = 'Lorenz trajectory · numerical integration · time-colored path'
METHOD = 'Numerical Lorenz system, σ=10, ρ=28, β=8/3, initial (1,1,1); solve_ivp tolerances 1e−8/1e−10. First 5 time units omitted as transient; not a physical experimental dataset.'

def make_data(rng):
    t=np.linspace(0,35,7000)
    def rhs(t,v):
        x,y,z=v;return [10*(y-x),x*(28-z)-y,x*y-(8/3)*z]
    sol=integrate.solve_ivp(rhs,(0,35),[1,1,1],t_eval=t,rtol=1e-8,atol=1e-10)
    assert sol.success
    return {'time':t[t>=5],'trajectory':sol.y[:,t>=5].T,'parameters':[10,28,8/3]}

@publication
def draw(d):
    from mpl_toolkits.mplot3d.art3d import Line3DCollection
    v=d['trajectory'];seg=np.stack([v[:-1],v[1:]],axis=1);fig,ax=canvas(TITLE,SUBTITLE,projection='3d');lc=Line3DCollection(seg,cmap=SPECTRAL,lw=.7);lc.set_array(d['time'][:-1]);ax.add_collection3d(lc)
    ax.set(xlim=(v[:,0].min(),v[:,0].max()),ylim=(v[:,1].min(),v[:,1].max()),zlim=(v[:,2].min(),v[:,2].max()),xlabel='x',ylabel='y',zlabel='z');ax.view_init(25,-54);colorbar(fig,lc,ax,'Time (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
