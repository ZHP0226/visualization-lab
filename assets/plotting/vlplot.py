"""Shared presentation/export utilities. All template-specific drawing lives in templates/."""
from pathlib import Path
import argparse, csv, json, importlib.util, sys, time, warnings
from functools import wraps
import textwrap
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import colors as mc
from matplotlib.collections import LineCollection
from matplotlib.patches import Polygon, Circle, Rectangle, Wedge, PathPatch
from matplotlib.path import Path as MPath
from scipy import stats, signal, optimize, cluster, spatial, integrate

ROOT = Path(__file__).resolve().parent
JOURNAL_ACTIVE=False
ACTIVE_FIGURE=None
FIGURE_MM=50.
FIGURE_INCH=FIGURE_MM/25.4
C = ['#0072B2','#009E73','#CC79A7','#E69F00','#56B4E9','#D55E00','#66518D','#7B786D']
INK = '#202020'
FLOW = mc.LinearSegmentedColormap.from_list('tidal_sequential', ['#F5F8FA','#C4DFE4','#79BAC5','#487D9F','#4A437A'])
SUN = mc.LinearSegmentedColormap.from_list('warm_sequential', ['#FFF4D6','#EDCD80','#D99A62','#A65D6C','#593D70'])
DIV = plt.colormaps['PuOr_r']
SPECTRAL = mc.LinearSegmentedColormap.from_list('aqua_indigo', ['#9BD8D0','#3592AA','#46629F','#573D78'])
LINESTYLES=['-','--','-.',':',(0,(5,1,1,1))]
plt.rcParams.update({'font.family':'sans-serif','font.sans-serif':['Arial','Helvetica','DejaVu Sans'],
    'font.size':5.5,'axes.titlesize':5.5,'axes.labelsize':5.5,'xtick.labelsize':5,'ytick.labelsize':5,
    'text.color':INK,'axes.labelcolor':INK,'xtick.color':INK,'ytick.color':INK,
    'axes.edgecolor':INK,'axes.linewidth':.65,'grid.color':'#E3E3E3','grid.linewidth':.4,
    'axes.axisbelow':True,'figure.facecolor':'white','axes.facecolor':'white',
    'legend.frameon':False,'legend.fontsize':5,'svg.fonttype':'none','pdf.fonttype':42,
    'savefig.facecolor':'white','mathtext.fontset':'dejavusans'})

def canvas(title=None, subtitle='', rows=1, cols=1, projection=None, figsize=None, **kwargs):
    """Square 50 mm canvas. Names/captions live in gallery metadata, not artwork."""
    fig = ACTIVE_FIGURE if ACTIVE_FIGURE is not None else plt.figure(figsize=(FIGURE_INCH,FIGURE_INCH))
    if projection:
        ax=fig.add_subplot(111,projection=projection)
        fig.subplots_adjust(left=.06,right=.94,bottom=.07,top=.96)
        return fig,ax
    axs=fig.subplots(rows,cols,squeeze=False,**kwargs)
    fig.subplots_adjust(left=.12,right=.95,bottom=.11,top=.95,hspace=.34,wspace=.28)
    for ax in axs.flat: style(ax)
    return fig, axs[0,0] if rows*cols==1 else axs

def style(ax,grid=False):
    if grid:ax.grid(True,alpha=.4)
    else:ax.grid(False,which='both')
    xt=ax.xaxis.get_major_ticks();yt=ax.yaxis.get_major_ticks()
    top=any(t.label2.get_visible() for t in xt);bottom=any(t.label1.get_visible() for t in xt)
    right=any(t.label2.get_visible() for t in yt);left=any(t.label1.get_visible() for t in yt)
    ax.tick_params(direction='in',length=1.8,width=.5,pad=2,top=top,bottom=bottom,right=right,left=left)
    for s in ax.spines.values(): s.set(visible=True,color=INK,linewidth=.5)
    return ax

def ink_on(color,alpha=1):
    rgb=np.asarray(mc.to_rgb(color))*alpha+(1-alpha)
    linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
    lum=np.dot(linear,[.2126,.7152,.0722])
    return '#FFFFFF' if 1.05/(lum+.05)>(lum+.05)/.05 else '#202020'

def publication(draw):
    """Apply publication presentation to all direct draws, previews and exports."""
    @wraps(draw)
    def wrapped(*args,**kwargs):
        return prepare_publication(draw(*args,**kwargs))
    return wrapped

def prepare_publication(fig):
    if JOURNAL_ACTIVE or ACTIVE_FIGURE is not None:return fig
    if getattr(fig,'_vl_prepared',False):return fig
    from matplotlib.text import Text
    from matplotlib.collections import PathCollection
    fig.set_size_inches(FIGURE_INCH,FIGURE_INCH,forward=True)
    for ax in fig.findobj(matplotlib.axes.Axes):
        ax.set_title('');ax.set_title('',loc='left');ax.set_title('',loc='right')
        if ax.name=='3d':
            for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:
                axis.pane.set_facecolor('white');axis.pane.set_edgecolor('#D4D4D4')
                axis._axinfo['grid'].update(color='#DDDDDD',linewidth=.35)
            ax.tick_params(pad=2)
        elif ax.axison and ax.name!='polar' and ax.get_label()!='<colorbar>' and not getattr(ax,'_vl_table',False):
            ax.grid(False,which='both')
            style(ax)
        for line in ax.lines:
            line.set_linewidth(np.clip(line.get_linewidth()*.4,.3,1.0))
            if line.get_markersize()>0:line.set_markersize(min(line.get_markersize()*.4,3))
        for coll in ax.collections:
            if isinstance(coll,PathCollection) and len(coll.get_sizes()):coll.set_sizes(coll.get_sizes()*.10)
            widths=coll.get_linewidths()
            if len(widths):coll.set_linewidths(np.clip(np.asarray(widths)*.65,.25,1.8))
        lg=ax.get_legend()
        if lg:
            for handle in lg.legend_handles:
                if isinstance(handle,PathCollection) and len(handle.get_sizes()):handle.set_sizes(handle.get_sizes()*.10)
                if hasattr(handle,'get_markersize') and hasattr(handle,'set_markersize'):handle.set_markersize(min(handle.get_markersize()*.4,3))
                if hasattr(handle,'get_linewidth') and hasattr(handle,'set_linewidth'):
                    handle.set_linewidth(min(handle.get_linewidth()*.55,1.5))
    for t in fig.findobj(Text):
        old=t.get_fontsize()
        t.set_fontsize(max(5,min(6,old*.62 if old>6 else old)))
        t.set_fontfamily('Arial');t.set_fontweight('normal')
        rgba=mc.to_rgba(t.get_color())
        if min(rgba[:3])<.96:t.set_color(INK)
    from matplotlib.ticker import MaxNLocator,AutoLocator,LogLocator
    for ax in fig.findobj(matplotlib.axes.Axes):
        for axis in [ax.xaxis,ax.yaxis]:
            if isinstance(axis.get_major_locator(),(AutoLocator,MaxNLocator)):
                axis.set_major_locator(MaxNLocator(nbins=2 if len(fig.axes)>=9 else 3,min_n_ticks=2))
            elif isinstance(axis.get_major_locator(),LogLocator):
                axis.set_major_locator(LogLocator(base=10,numticks=4))
        if ax.name=='3d':ax.zaxis.set_major_locator(MaxNLocator(nbins=3))
        ax.xaxis.labelpad=3;ax.yaxis.labelpad=3
        for text,width in [(ax.xaxis.label,ax.get_position().width*FIGURE_INCH*72),(ax.yaxis.label,ax.get_position().height*FIGURE_INCH*72)]:
            if '\n' not in text.get_text() and len(text.get_text())>max(12,width/(text.get_fontsize()*.48)):
                text.set_text(textwrap.fill(text.get_text(),width=max(12,int(width/(text.get_fontsize()*.48))),break_long_words=False,break_on_hyphens=False))
    if all(ax.get_subplotspec() is not None for ax in fig.axes):
        fig.tight_layout(pad=.5,h_pad=.6,w_pad=.4)
    else:
        # Keep hand-composed panels while fitting their labels inside 50 mm.
        for _ in range(5):
            fig.canvas.draw();renderer=fig.canvas.get_renderer();bbox=fig.get_tightbbox(renderer)
            x0,y0,x1,y1=np.array([bbox.x0,bbox.y0,bbox.x1,bbox.y1])/FIGURE_INCH
            if x0>=.025 and y0>=.025 and x1<=.975 and y1<=.975:break
            left=min(x0,.025);bottom=min(y0,.025);right=max(x1,.975);top=max(y1,.975)
            sx=.95/(right-left);sy=.95/(top-bottom)
            for ax in fig.axes:
                p=ax.get_position();ax.set_position([.025+(p.x0-left)*sx,.025+(p.y0-bottom)*sy,p.width*sx,p.height*sy])
    # Axes3D tight bounding boxes omit some axis labels; measure visible text too.
    for _ in range(10):
        fig.canvas.draw();renderer=fig.canvas.get_renderer();w,h=fig.canvas.get_width_height()
        excluded=set()
        for ax in fig.findobj(matplotlib.axes.Axes):
            pairs=[(ax.xaxis,ax.get_xlim()),(ax.yaxis,ax.get_ylim())]
            if ax.name=='3d':pairs.append((ax.zaxis,ax.get_zlim()))
            for axis,limits in pairs:
                lo,hi=sorted(limits)
                for tick in [*axis.get_major_ticks(),*axis.get_minor_ticks()]:
                    if (not ax.axison and ax.name!='3d') or not lo-1e-10<=tick.get_loc()<=hi+1e-10:excluded.update([id(tick.label1),id(tick.label2)])
        boxes=[ax.get_window_extent(renderer) for ax in fig.axes]
        boxes.extend(t.get_window_extent(renderer) for t in fig.findobj(Text) if id(t) not in excluded and t.get_visible() and t.get_text().strip())
        x0=min(b.x0 for b in boxes)/w;y0=min(b.y0 for b in boxes)/h;x1=max(b.x1 for b in boxes)/w;y1=max(b.y1 for b in boxes)/h
        if min(x0,y0)>=.02 and max(x1,y1)<=.98:break
        left=min(x0,.02);bottom=min(y0,.02);right=max(x1,.98);top=max(y1,.98)
        sx=.96/(right-left);sy=.96/(top-bottom)
        for ax in fig.axes:
            p=ax.get_position();ax.set_position([.02+(p.x0-left)*sx,.02+(p.y0-bottom)*sy,p.width*sx,p.height*sy])
    fig._vl_prepared=True
    return fig

def legend(ax,**kw):
    labels=ax.get_legend_handles_labels()[1]
    width=ax.get_position().width*FIGURE_INCH*72
    column_width=max((len(v) for v in labels),default=4)*2.6+10
    kw['ncol']=min(max(1,int(width/column_width)),kw.get('ncol',1));kw.setdefault('handlelength',1.3)
    kw.setdefault('columnspacing',.8);kw.setdefault('borderaxespad',.3)
    return ax.legend(**kw)

def fade(color,alpha=.15): return mc.to_rgba(color,alpha)

def gradient_fill(ax,x,y,color,base=0,alpha=.55):
    x,y=np.asarray(x),np.asarray(y)
    low=min(float(np.min(y)),float(base)); high=max(float(np.max(y)),float(base))
    if high<=low:return
    cmap=mc.LinearSegmentedColormap.from_list('fill',[fade(color,.02),fade(color,alpha)])
    im=ax.imshow(np.linspace(0,1,256)[:,None],extent=[x.min(),x.max(),low,high],
        aspect='auto',origin='lower',cmap=cmap,zorder=1)
    poly=Polygon(np.vstack([np.column_stack([x,y]),[x[-1],base],[x[0],base]]),
        closed=True,facecolor='none',edgecolor='none')
    ax.add_patch(poly); im.set_clip_path(poly)

def colorline(ax,x,y,cmap=SPECTRAL,lw=3,**kw):
    p=np.column_stack([x,y]); seg=np.stack([p[:-1],p[1:]],axis=1)
    coll=LineCollection(seg,cmap=cmap,linewidth=lw,**kw)
    coll.set_array(np.linspace(0,1,len(seg))); ax.add_collection(coll); ax.autoscale_view()
    return coll

def gbar(ax,x,height,width=.64,colors=None,bottom=None,horizontal=False):
    height=np.asarray(height); bottom=np.zeros_like(height) if bottom is None else np.asarray(bottom)
    colors=colors or [C[i%len(C)] for i in range(len(height))]
    if horizontal:
        bars=ax.barh(x,height,height=width,left=bottom,color=colors,edgecolor='white',linewidth=.8,zorder=3)
    else:
        bars=ax.bar(x,height,width=width,bottom=bottom,color=colors,edgecolor='white',linewidth=.8,zorder=3)
    for p,c in zip(bars,colors):
        if abs(p.get_height()*p.get_width())<1e-12:continue
        cmap=mc.LinearSegmentedColormap.from_list('bar',[mc.to_rgba(c,.55),mc.to_rgba(c,1)])
        ax.imshow(np.linspace(0,1,128)[:,None],extent=[p.get_x(),p.get_x()+p.get_width(),p.get_y(),p.get_y()+p.get_height()],
            aspect='auto',origin='lower',cmap=cmap,zorder=3,clip_path=p,clip_on=True)
        p.set_facecolor('none')
    ax.autoscale_view(); return bars

def colorbar(fig,m,ax,label):
    if ax.name=='3d':
        ax.set_position([.025,.35,.95,.62])
        cax=fig.add_axes([.25,.105,.50,.025],label='<colorbar>')
        cb=fig.colorbar(m,cax=cax,orientation='horizontal')
    else:
        cb=fig.colorbar(m,ax=ax,pad=.025,shrink=.85,aspect=25)
    cb.set_label(label,fontsize=7); cb.outline.set_visible(True);cb.outline.set_linewidth(.5)
    return cb

def label_panels(axs):
    """Individual gallery examples intentionally have no a/b/c panel labels."""
    return None

def density(values,grid=None):
    values=np.asarray(values); grid=np.linspace(values.min()-values.std(),values.max()+values.std(),240) if grid is None else grid
    return grid,stats.gaussian_kde(values)(grid)

def swarm(y,width=.27):
    """Deterministic greedy separation of nearby y values (not random jitter)."""
    y=np.asarray(y); out=np.zeros(len(y)); scale=max(np.ptp(y),1e-9)
    placed=[]
    for i in np.argsort(y):
        candidates=np.r_[0,np.column_stack([np.arange(1,26),-np.arange(1,26)]).ravel()*.025]
        for a in candidates:
            if all(abs(y[i]-y[j])/scale>.033 or abs(a-out[j])>.045 for j in placed):break
        out[i]=a; placed.append(i)
    extent=max(abs(out).max(),width)
    return out*width/extent

def fields(n=100):
    x=np.linspace(-3,3,n); y=np.linspace(-2.5,2.5,n); X,Y=np.meshgrid(x,y)
    Z=np.exp(-((X-1)**2+(Y-.6)**2)/.8)-.8*np.exp(-((X+1.1)**2+(Y+.4)**2)/1.2)+.15*np.cos(2*X)*np.sin(2*Y)
    return X,Y,Z

def demo_groups(rng,n=70):
    return [rng.normal(m,s,n) for m,s in zip([2.0,2.8,3.4,4.2],[.5,.65,.48,.7])]

def classify_data(rng,n=600):
    X=rng.normal(size=(n,4)); logits=X@np.array([1.5,-1.1,.7,.4])
    p=1/(1+np.exp(-logits)); labels=(rng.random(n)<p).astype(int)
    score=1/(1+np.exp(-(logits+rng.normal(0,.25,n))))
    return {'X':X,'labels':labels,'score':score}

def km_estimate(t,event):
    t=np.asarray(t); event=np.asarray(event,dtype=bool)
    times=np.unique(t[event]); survival=[1.]; risk=[]; deaths=[]; greenwood=[]; acc=0.
    for v in times:
        n=np.count_nonzero(t>=v); d=np.count_nonzero((t==v)&event)
        survival.append(survival[-1]*(1-d/n));risk.append(n);deaths.append(d)
        if n>d:acc+=d/(n*(n-d))
        greenwood.append(acc)
    return np.r_[0,times],np.array(survival),np.array(risk),np.array(deaths)

def jsonable(v):
    if isinstance(v,np.ndarray):return v.tolist()
    if isinstance(v,np.generic):return v.item()
    if isinstance(v,dict):return {str(k):jsonable(x) for k,x in v.items()}
    if isinstance(v,(tuple,list)):return [jsonable(x) for x in v]
    return v

def arrays(v):
    if isinstance(v,dict):return {k:arrays(x) for k,x in v.items()}
    if isinstance(v,list):
        try:return np.asarray(v) if np.asarray(v).dtype.kind in 'biufcUS' else [arrays(x) for x in v]
        except ValueError:return [arrays(x) for x in v]
    return v

def write_csvs(data,dest):
    """One CSV per numerical variable; JSON preserves the full input schema."""
    dest.mkdir(parents=True,exist_ok=True)
    for k,v in data.items():
        try:a=np.asarray(v)
        except ValueError:
            for i,part in enumerate(v):write_csvs({f'{k}_{i+1}':part},dest)
            continue
        if a.dtype.kind not in 'biufUS':continue
        if a.ndim>2:
            with (dest/f'{k}.csv').open('w',newline='',encoding='utf-8-sig') as f:
                w=csv.writer(f);w.writerow([f'index_{i}' for i in range(a.ndim)]+[k])
                for idx in np.ndindex(a.shape):w.writerow([*idx,a[idx].item()])
            continue
        if a.ndim==0:a=a.reshape(1,1)
        if a.ndim==1:a=a[:,None]
        with (dest/f'{k}.csv').open('w',newline='',encoding='utf-8-sig') as f:
            w=csv.writer(f);w.writerow([k] if a.shape[1]==1 else [f'{k}_{i+1}' for i in range(a.shape[1])]);w.writerows(a.tolist())

def run_template(number,make_data,draw,argv=None):
    parser=argparse.ArgumentParser(description=f'Independent plot template {number:03}')
    parser.add_argument('--data',type=Path,help='Optional JSON input with this template schema')
    parser.add_argument('--output',type=Path,default=ROOT/'plots'/f'{number:03}')
    args=parser.parse_args(argv)
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    seed=20261107+number
    data=arrays(json.loads(args.data.read_text(encoding='utf-8'))) if args.data else make_data(np.random.default_rng(seed))
    (out/'data.json').write_text(json.dumps(jsonable(data),ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    write_csvs(data,out/'csv')
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter('always')
        fig=draw(data)
        for ext in ['png','svg','pdf']:fig.savefig(out/f'figure.{ext}',dpi=600 if ext=='png' else 450)
        plt.close(fig)
    metadata={'number':number,'seed':seed,'synthetic':True,'formats':['png','svg','pdf'],
              'physical_size_mm':[FIGURE_MM,FIGURE_MM],'png_dpi':600,'embedded_raster_dpi':450,
              'titles':False,'panel_labels':False,'cartesian_frame':'four-sided',
              'warnings':sorted(set(str(w.message) for w in caught))}
    (out/'render.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    return metadata
