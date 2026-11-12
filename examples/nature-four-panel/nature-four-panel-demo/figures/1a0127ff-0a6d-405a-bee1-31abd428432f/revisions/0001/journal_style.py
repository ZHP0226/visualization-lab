"""Deterministic publication-style rendering shared by every template."""
from pathlib import Path
import json,math
import matplotlib
from matplotlib.text import Text
from matplotlib.lines import Line2D
from matplotlib.collections import LineCollection,PathCollection
from matplotlib.patches import Patch

CATALOG=json.loads((Path(__file__).parent/'journal-styles.json').read_text(encoding='utf-8'))

def configuration(style_id,columns='single'):
    if columns not in ('single','double'):raise ValueError('请选择单栏或双栏')
    style=next((s for s in CATALOG['styles'] if s['id']==style_id),None)
    if style is None:raise ValueError('未知期刊风格')
    return {**style,'columns':columns,'width':style['widthMm'][columns]}

def prepare(style_id,columns='single',count=1):
    import vlplot
    vlplot.JOURNAL_ACTIVE=True
    s=configuration(style_id,columns)
    matplotlib.rcParams.update({'font.family':s['font'],'font.size':s['fontPt'],'axes.labelsize':s['fontPt'],'xtick.labelsize':s['tickPt'],'ytick.labelsize':s['tickPt'],'legend.fontsize':s['legendPt'],'lines.linewidth':s['linePt'],'lines.markersize':s['markerPt'],'pdf.fonttype':42,'svg.fonttype':'none'})
    return s

def apply(fig,style_id,columns='single',composite=False):
    s=configuration(style_id,columns)
    if not composite:fig.set_size_inches(s['width']/25.4,s['width']*.82/25.4,forward=True)
    for text in fig.findobj(Text):
        text.set_fontfamily(s['font']);text.set_fontsize(s['panelPt'] if text.get_gid()=='vl-panel-label' else s['fontPt']);text.set_fontweight('bold' if text.get_gid()=='vl-panel-label' else 'normal')
    for ax in fig.axes:
        ax.set_title('');ax.set_title('',loc='left');ax.set_title('',loc='right')
        ax.grid(False,which='both')
        for spine in ax.spines.values():spine.set_linewidth(s['axesPt'])
        ax.tick_params(which='both',width=s['tickWidthPt'],length=s['tickLengthPt'],labelsize=s['tickPt'])
        for line in ax.lines:line.set_linewidth(s['linePt']);line.set_markersize(s['markerPt'])
        for collection in ax.collections:
            if isinstance(collection,LineCollection):collection.set_linewidth(s['linePt'])
            if isinstance(collection,PathCollection):collection.set_sizes([s['markerPt']**2]);collection.set_linewidth(s['axesPt'])
        for patch in ax.patches:patch.set_linewidth(s['axesPt'])
        if ax.name=='3d':ax.zaxis.set_tick_params(labelsize=s['tickPt'],width=s['tickWidthPt'],length=s['tickLengthPt'])
        legend=ax.get_legend()
        if legend:
            for text in legend.get_texts():text.set_fontsize(s['legendPt'])
            for handle in legend.legend_handles:
                if isinstance(handle,Line2D):handle.set_linewidth(s['linePt']);handle.set_markersize(s['markerPt'])
                elif isinstance(handle,PathCollection):handle.set_sizes([s['markerPt']**2]);handle.set_linewidth(s['axesPt'])
                elif hasattr(handle,'set_linewidth'):handle.set_linewidth(s['axesPt'])
    return s
