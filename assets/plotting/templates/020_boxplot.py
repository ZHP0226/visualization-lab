"""箱线图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 20
TITLE = 'Quartiles with context'
SUBTITLE = 'Median · IQR · whiskers at 1.5 × IQR'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    return {'groups':demo_groups(rng,90)}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);bp=ax.boxplot([v for v in d['groups']],patch_artist=True,widths=.52,medianprops={'color':INK,'linewidth':2},flierprops={'marker':'.','markersize':4,'markeredgecolor':'#98A5B8'})
    for i,b in enumerate(bp['boxes']):b.set(facecolor=fade(C[i],.35),edgecolor=C[i],linewidth=1.8)
    ax.set(xticks=np.arange(1,5),xticklabels=['A','B','C','D'],xlabel='Group',ylabel='Value (a.u.)');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
