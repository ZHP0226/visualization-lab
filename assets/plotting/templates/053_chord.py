"""和弦图 — independently authored example.
Symmetric matrix with zero diagonal. Each group arc is proportional to total incident weight; each ribbon endpoint is allocated proportionally within its arc.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 53
TITLE = 'Connections around a circle'
SUBTITLE = 'Undirected weighted links · ribbon width encodes weight'
METHOD = 'Symmetric matrix with zero diagonal. Each group arc is proportional to total incident weight; each ribbon endpoint is allocated proportionally within its arc.'

def make_data(rng):
    A=rng.integers(3,22,(6,6));A=np.triu(A,1);A=A+A.T
    return {'weights':A}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');ax.set(xlim=(-1.4,1.4),ylim=(-1.35,1.35),aspect='equal');A=d['weights'];sums=A.sum(1);total=sums.sum();cursor=0;angles=[]
    for i,s in enumerate(sums):
        span=2*np.pi*.94*s/total;angles.append((cursor,cursor+span));ax.add_patch(Wedge((0,0),1,np.degrees(cursor),np.degrees(cursor+span),width=.07,facecolor=C[i],edgecolor='white'))
        mid=cursor+span/2;ax.text(1.16*np.cos(mid),1.16*np.sin(mid),f'Group {i+1}',ha='center',va='center',color=C[i],fontsize=9,weight='bold');cursor+=span+2*np.pi*.06/6
    sub={}
    for i,(start,end) in enumerate(angles):
        cur=start
        for j in range(6):
            if A[i,j]:
                w=(end-start)*A[i,j]/sums[i];sub[i,j]=(cur,cur+w);cur+=w
    for i in range(6):
        for j in range(i):
            a,b=sub[i,j];c,e=sub[j,i];p=lambda t:.92*np.array([np.cos(t),np.sin(t)])
            arc1=[p(t) for t in np.linspace(a,b,12)];arc2=[p(t) for t in np.linspace(c,e,12)]
            verts=arc1+[p(b)*.13,p(c)*.13,p(c)]+arc2[1:]+[p(e)*.13,p(a)*.13,p(a),arc1[0]]
            codes=[MPath.MOVETO]+[MPath.LINETO]*11+[MPath.CURVE4]*3+[MPath.LINETO]*11+[MPath.CURVE4]*3+[MPath.CLOSEPOLY]
            ax.add_patch(PathPatch(MPath(verts,codes),facecolor=fade(C[i],.4),edgecolor=fade(C[i],.5),lw=.3))
    return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
