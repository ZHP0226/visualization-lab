"""桑基图 — independently authored example.
Flow-band widths are proportional to saved matrices. Total flow=100; every intermediate node satisfies inflow=outflow.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 52
TITLE = 'Where the flow goes'
SUBTITLE = 'Conserved flow bands · width is proportional to amount'
METHOD = 'Flow-band widths are proportional to saved matrices. Total flow=100; every intermediate node satisfies inflow=outflow.'

def make_data(rng):
    return {'first':np.array([[22,12,6],[10,18,7],[8,5,12]]),'second':np.array([[28,12],[22,13],[10,15]])}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');A=d['first'];B=d['second'];totals=[A.sum(1),A.sum(0),B.sum(0)];assert np.allclose(A.sum(0),B.sum(1))
    xs=[.05,.48,.91];width=.025;scale=.0065;positions=[]
    for stage,vals in enumerate(totals):
        pos=[];y=.8
        for i,v in enumerate(vals):
            h=v*scale;pos.append([y-h,y]);ax.add_patch(Rectangle((xs[stage],y-h),width,h,facecolor=C[i],edgecolor='white',lw=.8))
            ax.text(xs[stage]+(-.015 if stage==0 else width+.015),y-h/2,f'{["Input","Process","Output"][stage]} {i+1}\n{v:.0f}',ha='right' if stage==0 else 'left',va='center',fontsize=8.5,color=C[i]);y-=h+.055
        positions.append(pos)
    for s,M in enumerate([A,B]):
        left=[p[0] for p in positions[s]];right=[p[0] for p in positions[s+1]]
        for i in range(M.shape[0]):
            for j in range(M.shape[1]):
                h=M[i,j]*scale;y0=left[i];y1=right[j];x0=xs[s]+width;x1=xs[s+1];mid=(x0+x1)/2
                verts=[(x0,y0),(mid,y0),(mid,y1),(x1,y1),(x1,y1+h),(mid,y1+h),(mid,y0+h),(x0,y0+h),(x0,y0)]
                codes=[MPath.MOVETO]+[MPath.CURVE4]*3+[MPath.LINETO]+[MPath.CURVE4]*3+[MPath.CLOSEPOLY]
                ax.add_patch(PathPatch(MPath(verts,codes),facecolor=fade(C[i],.34),edgecolor='none'));left[i]+=h;right[j]+=h
    ax.set(xlim=(-.10,1.15),ylim=(0,.9));return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
