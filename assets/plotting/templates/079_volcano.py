"""火山图 — independently authored example.
900 synthetic genes, 8 independent log2-expression observations per group. Welch two-sided t-test per gene; BH-adjusted q-values. Thresholds q<0.05 and |difference in mean log2 expression|≥0.7; no real biological conclusions.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 79
TITLE = 'Magnitude meets evidence'
SUBTITLE = 'Welch t-tests · Benjamini–Hochberg FDR · synthetic genes'
METHOD = '900 synthetic genes, 8 independent log2-expression observations per group. Welch two-sided t-test per gene; BH-adjusted q-values. Thresholds q<0.05 and |difference in mean log2 expression|≥0.7; no real biological conclusions.'

def make_data(rng):
    n=900;effect=np.zeros(n);effect[:60]=rng.uniform(.7,1.7,60);effect[60:120]=-rng.uniform(.7,1.7,60)
    a=rng.normal(5,.4,(n,8));b=rng.normal(5+effect[:,None],.4,(n,8))
    return {'log2_group_a':a,'log2_group_b':b}

@publication
def draw(d):
    a=d['log2_group_a'];b=d['log2_group_b'];fc=b.mean(1)-a.mean(1);p=stats.ttest_ind(b,a,axis=1,equal_var=False).pvalue
    order=np.argsort(p);q=np.empty_like(p);q[order]=np.minimum.accumulate((p[order]*len(p)/np.arange(1,len(p)+1))[::-1])[::-1];q=np.minimum(q,1);Y=-np.log10(np.maximum(q,1e-300))
    fig,ax=canvas(TITLE,SUBTITLE);sig=(q<.05)&(abs(fc)>=.7)
    for mask,c,label in [(~sig,'#BEC7D8','Below thresholds'),(sig&(fc<0),C[1],'Lower in B'),(sig&(fc>0),C[2],'Higher in B')]:ax.scatter(fc[mask],Y[mask],s=20,color=fade(c,.7),edgecolor='none',label=f'{label} (n={mask.sum()})')
    ax.axhline(-np.log10(.05),color='#A1AEC3',ls='--',lw=1);ax.axvline(-.7,color='#A1AEC3',ls='--',lw=1);ax.axvline(.7,color='#A1AEC3',ls='--',lw=1)
    ax.set(xlabel='Difference of mean log$_2$ expression (B − A)',ylabel=r'$-\log_{10}$(BH-adjusted q)');legend(ax,fontsize=8);return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
