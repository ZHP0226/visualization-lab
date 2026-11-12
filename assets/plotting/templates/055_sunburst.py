"""旭日图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 55
TITLE = 'A hierarchy in rings'
SUBTITLE = 'Nested proportions · child arcs sum to parent arcs'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'children':[[18,12,10],[16,14],[12,10,8]],'parents':['Measure','Model','Publish'],'labels':[['Optics','Spectra','Images'],['Physics','Learning'],['Figures','Reports','Assets']]}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');ax.set(xlim=(-1.5,1.5),ylim=(-1.3,1.3),aspect='equal');total=sum(sum(v) for v in d['children']);start=90
    for i,children in enumerate(d['children']):
        span=sum(children)/total*360;ax.add_patch(Wedge((0,0),.68,start,start+span,width=.31,facecolor=C[i],edgecolor='white',lw=2))
        mid=np.radians(start+span/2);ax.text(.52*np.cos(mid),.52*np.sin(mid),d['parents'][i],ha='center',va='center',color=ink_on(C[i]),weight='bold',fontsize=9)
        cur=start
        for j,v in enumerate(children):
            delta=v/total*360;ax.add_patch(Wedge((0,0),1.02,cur,cur+delta,width=.32,facecolor=fade(C[i],.38+.18*j),edgecolor='white',lw=2))
            a=np.radians(cur+delta/2);ax.text(1.2*np.cos(a),1.2*np.sin(a),f'{d["labels"][i][j]}\n{v}%',ha='center',va='center',fontsize=8.5,color=C[i]);cur+=delta
        start+=span
    ax.text(0,0,'100%',ha='center',va='center',fontsize=20,weight='bold',color=INK);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
