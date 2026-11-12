# -*- coding: utf-8 -*-
# 不同模板组成同一张图；数据表和绘图命令分别保留。
from vl_runtime import *
import vlplot
from journal_style import prepare

# 四分图统一使用同一蓝—青色系。b、c、d采用同一归一化场及同一色标。
FIGURE_COLORS = ['#294E70', '#4B86A3', '#148C87']
SHARED_MAP = mc.LinearSegmentedColormap.from_list('blue_teal', ['#F2F6F8','#BED2DF','#679AB5','#258D95','#145D68'])
SHARED_NORM = mc.Normalize(0, 1)

def raw_field(x, y):
    return np.exp(-((x-.55)**2/.7+(y-.25)**2/.85)) + .52*np.exp(-((x+.9)**2/.65+(y+.65)**2/.55))

FIELD_SCALE = float(raw_field(*np.meshgrid(np.linspace(-2.4,2.4,401),np.linspace(-2.4,2.4,401))).max())

def field_value(x,y):
    return raw_field(x,y)/FIELD_SCALE

# 分图 a · 模板1 · 单曲线／多曲线图
a_TEMPLATE_ID = 'VL-PLOT-001'
a_NUMBER = 1
a_TITLE = 'Resonance atlas'
a_SUBTITLE = 'Five traces · continuous color · gradient envelopes'
a_METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'
a_PALETTE = 'nature'
a_FIT_DATA = False
a_DATA_FILE = '数据.xlsx'
a_PARAMETERS = {}

def a_process_data(data):
    return data

def a_make_data(rng):
    x = np.linspace(400, 800, 600)
    y = np.array([(0.9 + 0.1 * i) * np.exp(-0.5 * ((x - 490 - i * 28) / (19 + i * 2)) ** 2) + 0.38 * np.exp(-0.5 * ((x - 670 - i * 5) / 31) ** 2) + 0.035 for i in range(5)])
    return {'x': x, 'y': y}

@publication
def draw_part_a(d):
    # 模板1：多条二维曲线，颜色、虚实线和图例共同区分截线。
    fig,ax=canvas()
    for i,y in enumerate(d['a__y']):
        ax.plot(d['a__x'],y,color=FIGURE_COLORS[i],ls=['-','--',':'][i],label=['-0.7','0','0.7'][i])
    ax.set(xlabel='x (a.u.)',ylabel='Amplitude (a.u.)',xlim=(-2.4,2.4),ylim=(0,1.06),xticks=[-2,0,2],yticks=[0,.5,1])
    ax.legend(title='y (a.u.)',loc='upper left',frameon=False,handlelength=1.2,borderaxespad=.15,labelspacing=.1,handletextpad=.4)
    ax.set_box_aspect(1);ax.set_position([.26,.19,.67,.76]);return fig


# 分图 b · 模板41 · 二维标量场伪彩色图
b_TEMPLATE_ID = 'VL-PLOT-041'
b_NUMBER = 41
b_TITLE = 'A field of possibilities'
b_SUBTITLE = 'Scalar pseudocolor · symmetric diverging normalization'
b_METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'
b_PALETTE = 'nature'
b_FIT_DATA = False
b_DATA_FILE = '数据.xlsx'
b_PARAMETERS = {}

def b_process_data(data):
    return data

def b_make_data(rng):
    X, Y, Z = fields(160)
    return {'X': X, 'Y': Y, 'Z': Z}

@publication
def draw_part_b(d):
    # 模板41：二维标量场，和c/d共用0—1色标。
    fig,ax=canvas()
    X=d['b__X'];Y=d['b__Y'];Z=d['b__Z']
    ax.pcolormesh(X,Y,Z,cmap=SHARED_MAP,norm=SHARED_NORM,shading='auto',rasterized=True)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',xlim=(-2.4,2.4),ylim=(-2.4,2.4),xticks=[-2,0,2],yticks=[-2,0,2],aspect='equal')
    ax.set_position([.25,.19,.67,.76]);return fig


# 分图 c · 模板43 · 三维曲面图
c_TEMPLATE_ID = 'VL-PLOT-043'
c_NUMBER = 43
c_TITLE = 'Color over curvature'
c_SUBTITLE = 'A quantitative surface · perspective projection'
c_METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'
c_PALETTE = 'nature'
c_FIT_DATA = False
c_DATA_FILE = '数据.xlsx'
c_PARAMETERS = {}

def c_process_data(data):
    return data

def c_make_data(rng):
    X, Y, Z = fields(85)
    return {'X': X, 'Y': Y, 'Z': Z}

@publication
def draw_part_c(d):
    # 模板43：三维曲面，避免另起一套彩虹色。
    fig,ax=canvas(projection='3d')
    X=d['c__X'];Y=d['c__Y'];Z=d['c__Z']
    ax.plot_surface(X,Y,Z,cmap=SHARED_MAP,norm=SHARED_NORM,linewidth=0,antialiased=True,rcount=45,ccount=45,rasterized=True)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='Amplitude',xlim=(-2.4,2.4),ylim=(-2.4,2.4),zlim=(0,1.05),xticks=[-2,0,2],yticks=[-2,0,2],zticks=[0,1])
    ax.patch.set_alpha(0);ax.view_init(29,-57);ax.set_proj_type('ortho');ax.set_box_aspect((1,1,.72),zoom=.82);ax.tick_params(pad=0);ax.xaxis.labelpad=-1;ax.yaxis.labelpad=-1;ax.zaxis.labelpad=-1
    for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:axis.pane.set_facecolor('white');axis.pane.set_edgecolor('#DDE3E7')
    ax.set_position([-.035,.28,.90,.83]);return fig


# 分图 d · 模板45 · 三维散点图
d_TEMPLATE_ID = 'VL-PLOT-045'
d_NUMBER = 45
d_TITLE = 'A trajectory in three dimensions'
d_SUBTITLE = '3D scatter · color encodes time'
d_METHOD = 'Deterministic synthetic example; arbitrary units unless stated.'
d_PALETTE = 'nature'
d_FIT_DATA = False
d_DATA_FILE = '数据.xlsx'
d_PARAMETERS = {}

def d_process_data(data):
    return data

def d_make_data(rng):
    t = np.linspace(0, 6 * np.pi, 750)
    r = 1 + 0.035 * t
    return {'time': t, 'x': r * np.cos(t) + rng.normal(0, 0.07, len(t)), 'y': r * np.sin(t) + rng.normal(0, 0.07, len(t)), 'z': t / 5 + rng.normal(0, 0.07, len(t))}

@publication
def draw_part_d(d):
    # 模板45：三维离散采样，颜色仍编码同一场幅值。
    fig,ax=canvas(projection='3d')
    x=d['d__x'];y=d['d__y'];z=d['d__z']
    ax.scatter(x,y,z,c=z,cmap=SHARED_MAP,norm=SHARED_NORM,depthshade=False,edgecolor='white',linewidth=.3,alpha=.95)
    ax.set(xlabel='x (a.u.)',ylabel='y (a.u.)',zlabel='Amplitude',xlim=(-2.4,2.4),ylim=(-2.4,2.4),zlim=(0,1.05),xticks=[-2,0,2],yticks=[-2,0,2],zticks=[0,1])
    ax.patch.set_alpha(0);ax.view_init(29,-57);ax.set_proj_type('ortho');ax.set_box_aspect((1,1,.72),zoom=.82);ax.tick_params(pad=0);ax.xaxis.labelpad=-1;ax.yaxis.labelpad=-1;ax.zaxis.labelpad=-1
    for axis in [ax.xaxis,ax.yaxis,ax.zaxis]:axis.pane.set_facecolor('white');axis.pane.set_edgecolor('#DDE3E7')
    ax.set_position([-.035,.28,.90,.83]);return fig

TEMPLATE_ID = 'COMPOSITE'
PALETTE = 'nature'
PARAMETERS = {}
FIT_DATA = False
JOURNAL_STYLE = 'nature'
COLUMN_LAYOUT = 'single'
COMPOSITE = True

def process_data(data):
    return data

def make_data(rng):
    # 确定性合成示例。a为不同y位置的截线，b/c为同一场，d为该场的离散采样。
    x=np.linspace(-2.4,2.4,241)
    cuts=np.array([field_value(x,y) for y in [-.7,0,.7]])
    X,Y=np.meshgrid(np.linspace(-2.4,2.4,65),np.linspace(-2.4,2.4,65))
    Z=field_value(X,Y)
    sx=rng.uniform(-2.2,2.2,64);sy=rng.uniform(-2.2,2.2,64);sz=field_value(sx,sy)
    parts={'a':{'x':x,'y':cuts},'b':{'X':X,'Y':Y,'Z':Z},'c':{'X':X,'Y':Y,'Z':Z},'d':{'x':sx,'y':sy,'z':sz}}
    return {tag+'__'+key:value for tag,part in parts.items() for key,value in part.items()}


def draw(data):
    # 单栏指整图89 mm宽，分图采用2×2布局。
    prepare(JOURNAL_STYLE,COLUMN_LAYOUT)
    fig=plt.figure(figsize=(89/25.4,88/25.4))
    grid=fig.add_gridspec(2,2,left=.015,right=.985,bottom=.13,top=.98,wspace=.035,hspace=.015)
    functions=[draw_part_a,draw_part_b,draw_part_c,draw_part_d]
    try:
        for i,(tag,draw_part) in enumerate(zip('abcd',functions)):
            sub=fig.add_subfigure(grid[i//2,i%2]);sub.patch.set_alpha(0);vlplot.ACTIVE_FIGURE=sub
            draw_part(data)
            for axis in sub.axes:axis._vl_part=tag
            sub.text(.025,.985,tag,ha='left',va='top',gid='vl-panel-label')
    finally:
        vlplot.ACTIVE_FIGURE=None
    color_axis=fig.add_axes([.28,.085,.53,.015],label='<colorbar>');cb=fig.colorbar(matplotlib.cm.ScalarMappable(norm=SHARED_NORM,cmap=SHARED_MAP),cax=color_axis,orientation='horizontal')
    cb.set_label('Field amplitude (a.u.)',labelpad=2);cb.set_ticks([0,.5,1]);cb.outline.set_linewidth(.5)
    return fig


if __name__=='__main__':
    run_document(draw,process_data,PALETTE,PARAMETERS)
