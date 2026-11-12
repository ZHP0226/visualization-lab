"""三元组成图 — independently authored example.
Compositions are fractions summing to one. This is a ternary composition plot, not a thermodynamic phase diagram. Vertices: A=(0,0), B=(1,0), C=(0.5,√3/2).
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 51
TITLE = 'Three parts, one composition'
SUBTITLE = 'Barycentric coordinates · fractions sum to one'
METHOD = 'Compositions are fractions summing to one. This is a ternary composition plot, not a thermodynamic phase diagram. Vertices: A=(0,0), B=(1,0), C=(0.5,√3/2).'

def make_data(rng):
    abc=rng.dirichlet([2,3,2],240);return {'composition':abc,'response':abc[:,0]*.7+abc[:,1]*1.5+abc[:,2]*.3}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');h=np.sqrt(3)/2;vertices=np.array([[0,0],[1,0],[.5,h]])
    for q in np.arange(.2,1,.2):
        for a,b in [(np.array([q,0,1-q]),np.array([q,1-q,0])),(np.array([0,q,1-q]),np.array([1-q,q,0])),(np.array([0,1-q,q]),np.array([1-q,0,q]))]:
            p=np.stack([a,b])@vertices;ax.plot(p[:,0],p[:,1],color='#DDE4F0',lw=.7)
        ax.text(q,-.035,f'{q:.1f}',ha='center',fontsize=8,color='#8090A5')
    ax.add_patch(Polygon(vertices,fill=False,edgecolor='#95A4BE',lw=1.3));xy=d['composition']@vertices
    m=ax.scatter(xy[:,0],xy[:,1],c=d['response'],cmap=SPECTRAL,s=34,edgecolor='white',lw=.4)
    for p,label in zip(vertices,['A','B','C']):ax.text(p[0],p[1]+(.04 if p[1] else -.09),label,ha='center',fontsize=14,weight='bold')
    ax.text(.5,-.14,'B fraction increases →',ha='center',fontsize=9,color='#708098')
    ax.set(xlim=(-.12,1.12),ylim=(-.18,1),aspect='equal');colorbar(fig,m,ax,'Response (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
