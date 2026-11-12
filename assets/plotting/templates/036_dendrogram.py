"""聚类树状图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 36
TITLE = 'A hierarchy of resemblance'
SUBTITLE = 'Ward linkage · Euclidean distance'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'X':np.vstack([rng.normal(i,.35,(5,5)) for i in [0,1.3,3]])}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);Z=cluster.hierarchy.linkage(d['X'],method='ward',metric='euclidean')
    cluster.hierarchy.dendrogram(Z,ax=ax,labels=[f'S{i+1:02}' for i in range(15)],link_color_func=lambda k:C[k%5],above_threshold_color=C[0],leaf_rotation=90)
    ax.set(xlabel='Sample',ylabel='Ward linkage distance');ax.tick_params(axis='x',labelsize=8);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
