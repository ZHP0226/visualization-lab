"""实测–预测一致性图 — independently authored example.
Synthetic out-of-sample-style predictions. R² is 1−SSE/SST, not squared Pearson correlation. These are demonstration values, not a trained research model.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 57
TITLE = 'Prediction meets observation'
SUBTITLE = 'One-to-one reference · equal axis scales'
METHOD = 'Synthetic out-of-sample-style predictions. R² is 1−SSE/SST, not squared Pearson correlation. These are demonstration values, not a trained research model.'

def make_data(rng):
    x=rng.uniform(0,10,120);return {'observed':x,'predicted':.3+.94*x+rng.normal(0,.65,len(x))}

@publication
def draw(d):
    fig,ax=canvas(TITLE,SUBTITLE);a=d['observed'];b=d['predicted'];rmse=np.sqrt(np.mean((b-a)**2));r2=1-np.sum((b-a)**2)/np.sum((a-a.mean())**2)
    m=ax.scatter(a,b,c=abs(b-a),cmap=SUN,s=42,edgecolor='white',lw=.5);ax.plot([-1,11],[-1,11],ls='--',color='#8492A8',lw=1.4,label='1:1 reference')
    ax.text(.04,.91,f'RMSE = {rmse:.3f}\nR² = {r2:.3f}',transform=ax.transAxes,fontsize=10,color=C[0],va='top')
    ax.set(xlabel='Observed (a.u.)',ylabel='Predicted (a.u.)',xlim=(-1,11),ylim=(-1,11),aspect='equal');colorbar(fig,m,ax,'Absolute error (a.u.)');legend(ax,loc='lower right');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
