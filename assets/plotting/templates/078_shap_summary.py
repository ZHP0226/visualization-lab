"""SHAP蜂群＋重要性条形组合 — independently authored example.
For f(x)=intercept+β·x, interventional Shapley values with empirical marginal baseline are exactly φj=βj(xj−mean(Xj)). Saved coefficients define the actual demonstration model. Contributions sum exactly to f(x)−E[f(X)]; these are not arbitrary SHAP-like random dots.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 78
TITLE = 'Explaining a linear model'
SUBTITLE = 'Exact additive Shapley values · empirical marginal baseline'
METHOD = 'For f(x)=intercept+β·x, interventional Shapley values with empirical marginal baseline are exactly φj=βj(xj−mean(Xj)). Saved coefficients define the actual demonstration model. Contributions sum exactly to f(x)−E[f(X)]; these are not arbitrary SHAP-like random dots.'

def make_data(rng):
    X=rng.normal(size=(160,7));beta=np.array([1.6,-1.1,.8,-.55,.35,.2,-.1])
    return {'X':X,'coefficients':beta,'intercept':.4,'feature_names':['Absorption','Thickness','Mobility','Disorder','Density','Strain','Bias']}

@publication
def draw(d):
    X=d['X'];phi=(X-X.mean(0))*d['coefficients'];imp=np.mean(abs(phi),axis=0);order=np.argsort(imp);names=np.asarray(d['feature_names'])[order]
    fig,axs=canvas(TITLE,SUBTITLE,1,2,gridspec_kw={'width_ratios':[2.3,1]});a,b=axs[0];fig.subplots_adjust(left=.27,right=.92,bottom=.32,top=.94,wspace=.3)
    for rank,j in enumerate(order):
        v=phi[:,j];z=(X[:,j]-X[:,j].min())/np.ptp(X[:,j]);m=a.scatter(v,rank+swarm(v,.28),c=z,cmap=DIV,vmin=0,vmax=1,s=14,alpha=.75,edgecolor='none')
    a.axvline(0,color='#9CA9C0',lw=.8);a.set(yticks=range(7),yticklabels=names,xlabel='Shapley\ncontribution',ylim=(-.6,6.6))
    b.barh(range(7),imp[order],color=[SPECTRAL(i/6) for i in range(7)],height=.6);b.set(yticks=range(7),yticklabels=[],xlabel='Mean absolute\ncontribution',ylim=(-.6,6.6));b.tick_params(axis='y',length=0)
    cax=fig.add_axes([.30,.10,.50,.025]);cb=fig.colorbar(m,cax=cax,orientation='horizontal');cb.set_ticks([0,1],labels=['Low','High']);cb.set_label('Feature value',fontsize=5,labelpad=2);cb.outline.set_visible(False);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
