"""ROC曲线 — independently authored example.
Labels sampled from known logistic probabilities; noisy generating scores are evaluated on 600 synthetic examples. ROC/AUC computed with scikit-learn, no invented performance values.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 60
TITLE = 'Sensitivity versus specificity'
SUBTITLE = 'Binary synthetic holdout · threshold sweep'
METHOD = 'Labels sampled from known logistic probabilities; noisy generating scores are evaluated on 600 synthetic examples. ROC/AUC computed with scikit-learn, no invented performance values.'

def make_data(rng):
    return classify_data(rng)

@publication
def draw(d):
    from sklearn.metrics import roc_curve,roc_auc_score
    fig,ax=canvas(TITLE,SUBTITLE);y=d['labels'];s=d['score'];fpr,tpr,_=roc_curve(y,s);auc=roc_auc_score(y,s)
    gradient_fill(ax,fpr,tpr,C[0],alpha=.25);ax.plot(fpr,tpr,color=C[0],lw=3,label=f'ROC AUC = {auc:.3f}');ax.plot([0,1],[0,1],ls='--',color='#A1ACC0',lw=1.2,label='Chance')
    ax.set(xlabel='False positive rate',ylabel='True positive rate',xlim=(0,1),ylim=(0,1.04));legend(ax,loc='lower right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
