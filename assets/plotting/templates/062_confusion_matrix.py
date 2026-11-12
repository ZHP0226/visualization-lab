"""混淆矩阵图 — independently authored example.
Deterministic synthetic example; arbitrary units unless stated.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 62
TITLE = 'Where classification fails'
SUBTITLE = 'Three-class confusion · row-normalized color + raw counts'
METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'

def make_data(rng):
    truth=rng.integers(0,3,450);logits=rng.normal(0,.9,(450,3));logits[np.arange(450),truth]+=1.6
    return {'truth':truth,'predicted':logits.argmax(1)}

@publication
def draw(d):
    from sklearn.metrics import confusion_matrix
    fig,ax=canvas(TITLE,SUBTITLE);a=confusion_matrix(d['truth'],d['predicted'],labels=[0,1,2]);norm=a/a.sum(1,keepdims=True);m=ax.imshow(norm,vmin=0,vmax=1,cmap=FLOW)
    for i in range(3):
        for j in range(3):ax.text(j,i,f'{a[i,j]}\n{norm[i,j]:.1%}',ha='center',va='center',fontsize=7,color=ink_on(FLOW(norm[i,j])))
    ax.grid(False);ax.set(xticks=range(3),yticks=range(3),xticklabels=['A','B','C'],yticklabels=['A','B','C'],xlabel='Predicted class',ylabel='True class');colorbar(fig,m,ax,'Within-true-class fraction');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
