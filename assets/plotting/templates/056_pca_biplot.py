"""PCA得分–载荷双标图 — independently authored example.
Features standardized with sample SD; PCA via SVD. Scores are U*S, arrows are eigenvector loadings multiplied by a documented visual factor (0.75×maximum absolute score).
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 56
TITLE = 'Scores meet loadings'
SUBTITLE = 'Standardized PCA via SVD · score-unit-scaled loading arrows'
METHOD = 'Features standardized with sample SD; PCA via SVD. Scores are U*S, arrows are eigenvector loadings multiplied by a documented visual factor (0.75×maximum absolute score).'

def make_data(rng):
    g=np.repeat(np.arange(3),50);latent=rng.normal(0,.6,(150,2))+np.array([[-1,-.5],[1,-.5],[0,1.3]])[g]
    return {'X':latent@rng.normal(size=(2,6))+rng.normal(0,.3,(150,6)),'group':g}

@publication
def draw(d):
    X=d['X'];Z=(X-X.mean(0))/X.std(0,ddof=1);U,s,Vt=np.linalg.svd(Z,full_matrices=False);scores=U[:,:2]*s[:2];load=Vt[:2].T;var=s*s/np.sum(s*s);scale=np.max(abs(scores))*.75
    fig,ax=canvas(TITLE,SUBTITLE)
    for i in range(3):
        v=scores[d['group']==i];ax.scatter(v[:,0],v[:,1],c=C[i],s=35,alpha=.65,edgecolor='white',lw=.4,label=f'Group {i+1}')
    for i,p in enumerate(load*scale):
        ax.annotate('',xy=p,xytext=(0,0),arrowprops={'arrowstyle':'-|>','color':INK,'lw':1.3});ax.text(*(p*1.13),f'F{i+1}',fontsize=9,ha='center',color=INK)
    ax.axhline(0,color='#C5CFDE',lw=.8);ax.axvline(0,color='#C5CFDE',lw=.8);ax.set(xlabel=f'PC1 ({var[0]:.1%} variance)',ylabel=f'PC2 ({var[1]:.1%} variance)');legend(ax,ncol=3);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
