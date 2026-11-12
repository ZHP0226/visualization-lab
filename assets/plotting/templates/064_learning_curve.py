"""学习曲线 — independently authored example.
A logistic regression is actually refitted for each size/fold using scikit-learn learning_curve. Band = sample SD across five folds, not a confidence interval; synthetic data only.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 64
TITLE = 'Learning with more data'
SUBTITLE = 'Logistic regression · five stratified folds · mean ± SD'
METHOD = 'A logistic regression is actually refitted for each size/fold using scikit-learn learning_curve. Band = sample SD across five folds, not a confidence interval; synthetic data only.'

def make_data(rng):
    return classify_data(rng,900)

@publication
def draw(d):
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import learning_curve,StratifiedKFold
    sizes,tr,va=learning_curve(LogisticRegression(max_iter=800),d['X'],d['labels'],train_sizes=np.linspace(.1,1,8),cv=StratifiedKFold(5,shuffle=True,random_state=42),scoring='accuracy',n_jobs=1,shuffle=True,random_state=42)
    fig,ax=canvas(TITLE,SUBTITLE)
    for mat,c,label in [(tr,C[0],'Training'),(va,C[1],'Validation')]:
        m=mat.mean(1);sd=mat.std(1,ddof=1);ax.fill_between(sizes,m-sd,m+sd,color=fade(c,.15));ax.plot(sizes,m,'o-',color=c,lw=2.3,ms=6,label=label)
    ax.set(xlabel='Training examples per fold',ylabel='Accuracy',ylim=(.5,1));legend(ax);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
