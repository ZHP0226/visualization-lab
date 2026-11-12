"""矩形树图 — independently authored example.
Independent recursive binary partition; rectangle areas equal values / total. Labels are percentages because input sums to 100.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 54
TITLE = 'Hierarchy in rectangles'
SUBTITLE = 'Recursive proportional partition · area encodes amount'
METHOD = 'Independent recursive binary partition; rectangle areas equal values / total. Labels are percentages because input sums to 100.'

def make_data(rng):
    return {'values':np.array([25,18,14,12,10,8,6,4,3]),'labels':['Optics','Materials','Imaging','Devices','Signals','Models','Tools','Data','Other']}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);ax.axis('off');vals=d['values'];labels=d['labels']
    def split(ids,x,y,w,h):
        if len(ids)==1:
            i=ids[0];ax.add_patch(Rectangle((x+.004,y+.004),w-.008,h-.008,facecolor=fade(C[i%8],.83),edgecolor='white',lw=2));ax.text(x+w/2,y+h/2,f'{labels[i]}\n{vals[i]}%',ha='center',va='center',color=ink_on(C[i%8],.83),fontsize=10 if min(w,h)>.15 else 8,weight='bold');return
        weights=vals[ids];cum=np.cumsum(weights);k=int(np.argmin(abs(cum[:-1]-cum[-1]/2)))+1;q=weights[:k].sum()/weights.sum()
        if w>=h:split(ids[:k],x,y,w*q,h);split(ids[k:],x+w*q,y,w*(1-q),h)
        else:split(ids[:k],x,y,w,h*q);split(ids[k:],x,y+h*q,w,h*(1-q))
    split(list(range(len(vals))),0,0,1.5,1);ax.set(xlim=(0,1.5),ylim=(0,1),aspect='equal');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
