"""精确率–召回率曲线 PR — independently authored example.
AP is scikit-learn average precision (step-weighted), not trapezoidal PR AUC. Baseline equals class prevalence.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 61
TITLE = 'Precision under recall'
SUBTITLE = 'Binary synthetic holdout · prevalence baseline'
METHOD = 'AP is scikit-learn average precision (step-weighted), not trapezoidal PR AUC. Baseline equals class prevalence.'

def make_data(rng):
    return classify_data(rng)

@publication
def draw(d):
    from sklearn.metrics import precision_recall_curve,average_precision_score
    fig,ax=canvas(TITLE,SUBTITLE);y=d['labels'];p,r,_=precision_recall_curve(y,d['score']);ap=average_precision_score(y,d['score'])
    gradient_fill(ax,r[::-1],p[::-1],C[1],alpha=.3);ax.plot(r,p,color=C[1],lw=2.8,label=f'Average precision = {ap:.3f}')
    ax.axhline(y.mean(),color=C[2],ls='--',lw=1.3,label=f'Prevalence = {y.mean():.3f}')
    ax.set(xlabel='Recall',ylabel='Precision',xlim=(0,1),ylim=(0,1.05));legend(ax,loc='lower left');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
