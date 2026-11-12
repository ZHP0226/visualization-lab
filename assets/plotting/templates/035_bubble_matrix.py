"""相关性气泡矩阵 — independently authored example.
Pearson correlation computed from 160 synthetic rows; bubble area proportional to absolute r and hue encodes its sign.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vlplot import *

NUMBER = 35
TITLE = 'Correlation in area and hue'
SUBTITLE = 'Area ∝ |r| · signed diverging color'
METHOD = 'Pearson correlation computed from 160 synthetic rows; bubble area proportional to absolute r and hue encodes its sign.'

def make_data(rng):
    z=rng.normal(size=(160,3));return {'X':z@rng.normal(size=(3,9))+rng.normal(0,.6,(160,9))}

@publication
def draw(d):
    a=np.corrcoef(d['X'],rowvar=False);X,Y=np.meshgrid(np.arange(9),np.arange(9));fig,ax=canvas(TITLE,SUBTITLE)
    m=ax.scatter(X.ravel(),Y.ravel(),s=np.abs(a).ravel()*580,c=a.ravel(),cmap=DIV,vmin=-1,vmax=1,edgecolor='white',lw=.6)
    ax.set(xticks=range(9),yticks=range(9),xticklabels=[f'F{i+1}' for i in range(9)],yticklabels=[f'F{i+1}' for i in range(9)],xlim=(-.6,8.6),ylim=(8.6,-.6),aspect='equal')
    colorbar(fig,m,ax,'Pearson r');return fig

if __name__ == "__main__":
    run_template(NUMBER,make_data,draw)
