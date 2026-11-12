"""聚类热图 — independently authored example.
Both rows and columns reordered from Ward clustering. Heatmap uses original values, not row z-scores.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 37
TITLE = 'Patterns, reordered'
SUBTITLE = 'Row and column dendrograms · Ward / Euclidean'
METHOD = 'Both rows and columns reordered from Ward clustering. Heatmap uses original values, not row z-scores.'

def make_data(rng):
    X=rng.normal(0,.4,(18,12));X[:6,:4]+=2;X[6:12,4:8]+=2;X[12:,8:]+=2
    return {'matrix':X}

@publication
def draw(d):
    fig,_=canvas(TITLE,SUBTITLE);fig.axes[0].remove();a=d['matrix'];zr=cluster.hierarchy.linkage(a,method='ward');zc=cluster.hierarchy.linkage(a.T,method='ward')
    gs=fig.add_gridspec(2,2,left=.06,right=.82,bottom=.10,top=.95,width_ratios=[1,5],height_ratios=[1,4],wspace=.02,hspace=.02)
    ar=fig.add_subplot(gs[1,0]);ac=fig.add_subplot(gs[0,1]);ax=fig.add_subplot(gs[1,1])
    r=cluster.hierarchy.dendrogram(zr,orientation='left',ax=ar,no_labels=True,link_color_func=lambda k:C[k%3]);c=cluster.hierarchy.dendrogram(zc,ax=ac,no_labels=True,link_color_func=lambda k:C[k%3])
    ar.invert_yaxis();ar.axis('off');ac.axis('off')
    m=ax.imshow(a[np.ix_(r['leaves'],c['leaves'])],aspect='auto',cmap=DIV,vmin=-3,vmax=3)
    ax.set(xticks=range(12),xticklabels=[f'F{i+1}' for i in c['leaves']],yticks=range(18),yticklabels=[f'S{i+1}' for i in r['leaves']]);ax.tick_params(labelsize=7,length=0)
    ax.yaxis.tick_right();ax.tick_params(axis='y',pad=2);ax.tick_params(axis='x',labelrotation=90)
    cax=fig.add_axes([.92,.20,.014,.60]);fig.colorbar(m,cax=cax,label='Value (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
