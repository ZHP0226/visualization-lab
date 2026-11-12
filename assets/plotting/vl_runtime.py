"""Self-contained plotting document runtime: Excel, code and SVG provenance."""
from pathlib import Path
import ast,hashlib,inspect,importlib.util,json,sys,math,copy
from functools import wraps
from vlplot import *
from workbook_io import read_book,write_book
from matplotlib.axes import Axes
from matplotlib.lines import Line2D
from matplotlib.collections import Collection,PathCollection,LineCollection,PolyCollection,QuadMesh
from matplotlib.image import AxesImage
from matplotlib.patches import Patch
from matplotlib.text import Text

DRAW_METHODS=['plot','scatter','bar','barh','pie','errorbar','hist','imshow','pcolormesh','contour','contourf','fill_between','fill_betweenx','step','add_collection','add_patch','text']
PALETTES={'nature':['#0072B2','#009E73','#CC79A7','#E69F00','#56B4E9','#D55E00','#66518D','#7B786D'],
 'violet':['#7254E8','#11AAA4','#EF608C','#F5AB35','#3585EB','#AD5BCD','#36B7D4','#93B84A'],
 'warm':['#B65B77','#E68D5C','#E4B95B','#7D71B3','#4C9D9A','#A05278','#886B4C','#6191B4']}

def fingerprint(value):
    try:
        a=np.asarray(value)
        if a.dtype.kind in 'biuf':a=np.asarray(a,dtype=np.float64)
        if a.ndim==0:return None
        return hashlib.sha256(str(a.shape).encode()+a.tobytes() if a.dtype.kind in 'biuf' else json.dumps(a.tolist(),ensure_ascii=False).encode()).hexdigest()
    except Exception:return None

def field_at(d,path):
    for p in path:d=d[p]
    return d

def assign_at(d,path,value):
    at=d
    for p in path[:-1]:at=at[p]
    at[path[-1]]=value

def make_columns(data):
    columns=[];fields=[]
    def visit(value,path):
        if not isinstance(value,(list,np.ndarray)):return
        try:a=np.asarray(value)
        except ValueError:
            for i,v in enumerate(value):visit(v,path+[i])
            return
        if a.dtype.kind not in 'biufUS' or a.ndim==0:return
        axis=0 if a.ndim==1 else (0 if a.shape[0]>=a.shape[1] and a.shape[1]<=32 else a.ndim-1)
        flat=a.ndim==2 and min(a.shape)>32
        if flat:a=a.reshape(-1);axis=0
        field={'path':path,'shape':list(np.asarray(value).shape),'axis':axis,'flat':flat,'dtype':a.dtype.kind,'columns':[]}
        shape=list(a.shape);del shape[axis]
        for index in np.ndindex(tuple(shape)):
            sl=list(index);sl.insert(axis,slice(None));values=jsonable(a[tuple(sl)])
            key=f'c{len(columns)+1:04}';base=str(path[0])+''.join(f'[{v+1}]' for v in path[1:])
            label=base+(' · '+','.join(str(v+1) for v in index) if index else '')
            spec={'id':key,'label':label,'field':len(fields),'path':path,'index':list(index),'values':values,'numeric':a.dtype.kind in 'biuf'}
            columns.append(spec);field['columns'].append(key)
        fields.append(field)
    for k,v in data.items():visit(v,[k])
    return columns,fields

def values_from_data(data,schema):
    result={}
    for f in schema['fields']:
        a=np.asarray(field_at(data,f['path']))
        if f['flat']:a=a.reshape(-1)
        for key in f['columns']:
            c=schema['columnSpecs'][key];sl=list(c['index']);sl.insert(f['axis'],slice(None));result[key]=jsonable(a[tuple(sl)])
    return result

def restore_columns(data,schema,changes):
    result=copy.deepcopy(jsonable(data))
    for f in schema['fields']:
        if not any(k in changes for k in f['columns']):continue
        lengths={len(changes[k]) for k in f['columns'] if k in changes}
        if len(lengths)>1:raise ValueError('同一数据组的各列长度不一致，请核对上传列')
        original=np.asarray(field_at(result,f['path']));a=original.reshape(-1) if f['flat'] else original.copy()
        size=next(iter(lengths))
        if size!=a.shape[f['axis']]:
            if f['flat'] or not all(k in changes for k in f['columns']):raise ValueError('更改行数时，请映射该数据组的全部列')
            shape=list(a.shape);shape[f['axis']]=size;a=np.empty(shape,dtype=a.dtype)
        for k in f['columns']:
            if k not in changes:continue
            values=changes[k]
            if any(v is None or isinstance(v,float) and not math.isfinite(v) for v in values):raise ValueError(f"{schema['columnSpecs'][k]['label']} 有空值或无效数字，请先整理")
            if a.dtype.kind in 'iu' and any(not isinstance(v,(int,float,np.number)) or not float(v).is_integer() for v in values):raise ValueError(f"{schema['columnSpecs'][k]['label']} 是整数列，不能将小数静默截断")
            if a.dtype.kind=='b' and any(v not in [0,1,False,True] for v in values):raise ValueError('布尔列只接受0或1')
            sl=list(schema['columnSpecs'][k]['index']);sl.insert(f['axis'],slice(None));a[tuple(sl)]=values
        if f['flat']:a=a.reshape(original.shape)
        assign_at(result,f['path'],a.tolist())
    return arrays(result)

def panels_from_schema(data,schema):
    values=values_from_data(data,schema)
    return [{'id':p['id'],'name':p['name'],'columns':[{**schema['columnSpecs'][k],'values':values[k]} for k in p['columns']]} for p in schema['panels']]

def read_document_data(directory,filename="数据.xlsx"):
    data=json.loads((directory/'data.json').read_text(encoding='utf-8'));schema=json.loads((directory/'table-schema.json').read_text(encoding='utf-8'))
    books,embedded=read_book(directory/filename)
    if not embedded or embedded.get('templateId')!=schema['templateId']:raise ValueError('工作簿的模板标识与当前图不一致，请通过“上传数据”重新映射')
    baseline=values_from_data(data,schema);candidates={}
    for p in schema['panels']:
        table=next((b for b in books if b['name']==p['name']),None)
        if table is None:raise ValueError('缺少工作表：'+p['name'])
        for ci,key in enumerate(p['columns']):
            expected=schema['columnSpecs'][key]['label']
            if ci>=len(table['headers']) or table['headers'][ci]!=expected:raise ValueError('列标题已更改，请使用“上传数据”进行对应：'+expected)
            v=[row[ci] if ci<len(row) else None for row in table['rows']]
            while v and v[-1] is None:v.pop()
            if v!=baseline[key]:candidates.setdefault(key,[]).append(v)
    changes={}
    for key,lists in candidates.items():
        if any(v!=lists[0] for v in lists[1:]):raise ValueError('不同分图中的共享列修改不一致：'+schema['columnSpecs'][key]['label'])
        changes[key]=lists[0]
    return restore_columns(data,schema,changes),schema

def apply_palette(draw,name):
    if name not in PALETTES:raise ValueError('未知配色')
    target=inspect.unwrap(draw).__globals__;C[:]=PALETTES[name]
    if 'C' in target:target['C'][:]=PALETTES[name]
    if name!='nature':
        import vlplot
        stops=['#F8F8FA']+PALETTES[name][:4]
        for key in ['FLOW','SUN','SPECTRAL']:
            cmap=mc.LinearSegmentedColormap.from_list('vl_'+name+'_'+key,stops if key!='SPECTRAL' else PALETTES[name][:4]);target[key]=cmap;setattr(vlplot,key,cmap)
        target['DIV']=mc.LinearSegmentedColormap.from_list('vl_div_'+name,[PALETTES[name][0],'#F9F9FA',PALETTES[name][2]])

class Trace:
    def __init__(self,source,columns,fields):
        self.source=Path(source).resolve();self.columns=columns;self.fields=fields;self.records={};self.counter=0;self.originals=[]
        self.hashes={};self.fields_by_name={}
        for c in columns:self.hashes.setdefault(fingerprint(c['values']),set()).add(c['id']);self.fields_by_name.setdefault(str(c['path'][0]),set()).add(c['id'])
        self.tree=ast.parse(self.source.read_text(encoding='utf-8'));self.assignments={}
        for node in ast.walk(self.tree):
            if isinstance(node,ast.For):
                for name in ast.walk(node.target):
                    if isinstance(name,ast.Name):self.assignments.setdefault(name.id,[]).append((node.lineno,node.iter))
            if isinstance(node,(ast.Assign,ast.AnnAssign)):
                for target in node.targets if isinstance(node,ast.Assign) else [node.target]:
                    for name in ast.walk(target):
                        if isinstance(name,ast.Name):self.assignments.setdefault(name.id,[]).append((node.lineno,node.value))
    def deps(self,node,frame,seen=None):
        seen=set(seen or [])
        if isinstance(node,ast.Name):
            exact=self.hashes.get(fingerprint(frame.f_locals.get(node.id)),set())
            if exact:return exact
            candidates=sorted((v for v in self.assignments.get(node.id,[]) if v[0]<node.lineno),key=lambda v:v[0],reverse=True)
            if candidates:
                line,value=candidates[0];key=(node.id,line)
                if key not in seen:return self.deps(value,frame,seen|{key})
        if isinstance(node,ast.Subscript) and isinstance(node.value,ast.Name) and node.value.id=='d' and isinstance(node.slice,ast.Constant):
            key=str(node.slice.value);scope=frame.f_code.co_name
            scoped=scope.removeprefix('draw_part_')+'__'+key if scope.startswith('draw_part_') else key
            return self.fields_by_name.get(scoped,self.fields_by_name.get(key,set()))
        result=set()
        for child in ast.iter_child_nodes(node):result|=self.deps(child,frame,seen)
        return result
    def context(self,method):
        frame=inspect.currentframe().f_back
        while frame and Path(frame.f_code.co_filename).resolve()!=self.source:frame=frame.f_back
        if frame is None:return None
        line=frame.f_lineno;nodes=[n for n in ast.walk(self.tree) if isinstance(n,ast.Call) and n.lineno<=line<=getattr(n,'end_lineno',n.lineno)]
        call=next((n for n in nodes if isinstance(n.func,ast.Attribute) and n.func.attr==method),nodes[0] if nodes else None)
        cols=set()
        if call:
            name=call.func.attr if isinstance(call.func,ast.Attribute) else call.func.id if isinstance(call.func,ast.Name) else ''
            args=call.args[1:3] if name in ['gradient_fill','gradient_line'] else call.args[:3] if name=='gbar' else call.args
            for arg in args:cols|=self.deps(arg,frame)
            for keyword in call.keywords:
                if keyword.arg in ['x','y','z','c','s','yerr','xerr','bottom','left','height','weights','data']:cols|=self.deps(keyword.value,frame)
        caller=frame.f_back
        while not cols and caller:
            if Path(caller.f_code.co_filename).resolve()==self.source:
                calls=[n for n in ast.walk(self.tree) if isinstance(n,ast.Call) and n.lineno<=caller.f_lineno<=getattr(n,'end_lineno',n.lineno)]
                if calls:cols|=self.deps(calls[0],caller)
            caller=caller.f_back
        scope=frame.f_code.co_name
        if scope.startswith('draw_part_'):
            prefix=scope.removeprefix('draw_part_')+'__'
            cols={k for k in cols if next(c for c in self.columns if c['id']==k)['path'][0].startswith(prefix)}
        loop_index=frame.f_locals.get('i')
        if isinstance(loop_index,(int,np.integer)):
            for field in self.fields:
                keys=set(field['columns'])
                if field['axis']==1 and len(field['shape'])==2 and 0<=loop_index<len(field['columns']) and keys<=cols:
                    cols-=keys;cols.add(field['columns'][int(loop_index)])
        scalar_rows={}
        if method in ['plot','scatter','errorbar'] and call:
            names={n.id for n in ast.walk(call) if isinstance(n,ast.Name)}
            scalars=[frame.f_locals[n] for n in names if isinstance(frame.f_locals.get(n),(float,np.floating))]
            for c in self.columns:
                if c['id'] not in cols or not c['numeric']:continue
                matches=[r for r,v in enumerate(c['values']) if v in scalars]
                if len(matches)==1:scalar_rows[c['id']]=matches[0]
        return {'line':call.lineno if call else line,'columns':sorted(cols),'method':method,'scalarRows':scalar_rows,'loop':{k:int(frame.f_locals[k]) for k in ['i','j'] if isinstance(frame.f_locals.get(k),(int,np.integer))}}
    def register(self,artist,context):
        if context is None:return
        if hasattr(artist,'patches'):
            for i,a in enumerate(artist.patches):self.register(a,{**context,'element':i})
        elif isinstance(artist,(tuple,list)):
            if context['method']=='pie' and artist and all(isinstance(a,Patch) for a in artist):
                for i,a in enumerate(artist):self.register(a,{**context,'element':i})
            else:
                for a in artist:self.register(a,context)
        elif hasattr(artist,'set_gid') and isinstance(artist,(Line2D,Collection,AxesImage,Patch,Text)):
            self.counter+=1;gid=f'vl-series-{self.counter:05}';artist.set_gid(gid);self.records[id(artist)]=(artist,{**context,'id':gid})
    def __enter__(self):
        for method in DRAW_METHODS:
            original=getattr(Axes,method)
            def wrapped(ax,*args,_method=method,_original=original,**kwargs):
                context=self.context(_method);result=_original(ax,*args,**kwargs);self.register(result,context);return result
            self.originals.append((method,original));setattr(Axes,method,wrapped)
        return self
    def __exit__(self,*args):
        for method,original in self.originals:setattr(Axes,method,original)
    def describe(self,fig):
        fig.canvas.draw();axes=[a for a in fig.findobj(matplotlib.axes.Axes) if a.get_label()!='<colorbar>'];axis_ids={id(a):f'panel-{i+1}' for i,a in enumerate(axes)}
        result=[]
        for artist,ctx in self.records.values():
            ax=getattr(artist,'axes',None)
            if ax is None or id(ax) not in axis_ids:continue
            try:
                x=y=None;raw_y=None;matrix=None
                if isinstance(artist,Line2D):
                    if hasattr(artist,'get_data_3d'):
                        from mpl_toolkits.mplot3d import proj3d
                        xx,yy,zz=artist.get_data_3d();x,y,_=proj3d.proj_transform(xx,yy,zz,ax.get_proj());raw_y=np.asarray(yy)
                    else:x,y=artist.get_data();raw_y=np.asarray(y)
                    coords=artist.get_transform().transform(np.c_[np.asarray(x,dtype=float),np.asarray(y,dtype=float)])
                elif isinstance(artist,PathCollection):
                    offsets=np.asarray(artist.get_offsets(),dtype=float);x=offsets[:,0];y=offsets[:,1];raw_y=y
                    if hasattr(artist,'_offsets3d'):
                        from mpl_toolkits.mplot3d import proj3d
                        xx,yy,zz=artist._offsets3d;x,y,_=proj3d.proj_transform(xx,yy,zz,ax.get_proj());coords=ax.transData.transform(np.c_[x,y])
                    else:coords=artist.get_offset_transform().transform(offsets)
                elif isinstance(artist,AxesImage):
                    matrix=np.asarray(artist.get_array());nr,nc=matrix.shape[:2];left,right,bottom,top=artist.get_extent();X,Y=np.meshgrid(np.linspace(left+(right-left)/nc/2,right-(right-left)/nc/2,nc),np.linspace(bottom+(top-bottom)/nr/2,top-(top-bottom)/nr/2,nr));coords=ax.transData.transform(np.c_[X.ravel(),Y.ravel()])
                elif isinstance(artist,QuadMesh):
                    c=artist.get_coordinates();centers=(c[:-1,:-1]+c[1:,:-1]+c[:-1,1:]+c[1:,1:])/4;matrix=np.asarray(artist.get_array());coords=ax.transData.transform(centers.reshape(-1,2))
                elif isinstance(artist,LineCollection):
                    seg=artist.get_segments()
                    if not len(seg):continue
                    points=np.vstack([seg[0][0],*[s[-1] for s in seg]]);coords=artist.get_transform().transform(points)
                elif isinstance(artist,Text):
                    coords=artist.get_transform().transform(np.asarray(artist.get_position()))[None,:]
                elif isinstance(artist,Patch):
                    verts=artist.get_transform().transform(artist.get_path().vertices);coords=np.mean(verts,axis=0)[None,:]
                else:
                    offsets=np.asarray(artist.get_offsets())
                    if offsets.ndim!=2 or not len(offsets):continue
                    if len(offsets)==1 and np.all(offsets==0) and hasattr(artist,'get_paths'):
                        points=[np.mean(p.vertices,axis=0) for p in artist.get_paths() if len(p.vertices)]
                        if not points:continue
                        coords=artist.get_transform().transform(np.asarray(points))
                    else:coords=artist.get_offset_transform().transform(offsets)
                if not len(coords):continue
                cols=set(ctx['columns']);exact_y=self.hashes.get(fingerprint(raw_y),set()) if raw_y is not None else set();exact_x=self.hashes.get(fingerprint(x),set()) if x is not None else set()
                cols|=exact_x|exact_y
                if not cols:continue
                points=[];count=len(coords)
                subset_rows={}
                if x is not None and y is not None:
                    for field in self.fields:
                        if len(field['shape'])==2 and field['shape'][1]==2 and field['axis']==0 and not field['flat']:
                            a=np.asarray([next(c['values'] for c in self.columns if c['id']==key) for key in field['columns']]).T
                            lookup={tuple(v):i for i,v in enumerate(a)}
                            for i,pair in enumerate(zip(x,y)):
                                if tuple(pair) in lookup:
                                    for key in field['columns']:subset_rows[key,i]=lookup[tuple(pair)]
                for index,p in enumerate(coords):
                    if not np.all(np.isfinite(p)):continue
                    if artist.get_clip_on() and not (ax.bbox.x0-1<=p[0]<=ax.bbox.x1+1 and ax.bbox.y0-1<=p[1]<=ax.bbox.y1+1):continue
                    bindings=[]
                    for key in sorted(cols):
                        col=next(c for c in self.columns if c['id']==key);values=col['values']
                        if (key,index) in subset_rows:bindings.append([key,subset_rows[key,index]])
                        elif len(values)==count:bindings.append([key,index])
                        elif matrix is not None or len(self.fields[col['field']]['shape'])==2 and np.prod(self.fields[col['field']]['shape'])==count:
                            field=self.fields[col['field']]
                            shape=list(matrix.shape) if matrix is not None else field['shape']
                            if field['shape']==shape and not field['flat'] and len(shape)==2:
                                row,column=divmod(index,shape[1]);component=column if field['axis']==0 else row
                                if col['index']==[component]:bindings.append([key,row if field['axis']==0 else column])
                        elif count==1 and ctx.get('element',-1) in range(len(values)):bindings.append([key,ctx['element']])
                        elif key in ctx.get('scalarRows',{}):
                            row=ctx['scalarRows'][key];value=values[row]
                            if count==1 or (x is not None and y is not None and index<len(x) and value in [x[index],y[index]]):bindings.append([key,row])
                    points.append({'x':round(float(p[0])*72/fig.dpi,4),'y':round(float(fig.bbox.height-p[1])*72/fig.dpi,4),'index':index,'bindings':bindings})
                result.append({**ctx,'panelId':axis_ids[id(ax)],'columns':sorted(cols),'exactY':sorted(exact_y),'exactX':sorted(exact_x),'points':points,'label':artist.get_label() if hasattr(artist,'get_label') else ''})
            except (ValueError,TypeError,AttributeError,IndexError):continue
        return axes,result

def draw_document(directory,draw,data,palette='nature',schema=None,template_id='',processor=lambda d:d):
    directory=Path(directory);apply_palette(draw,palette);source=Path(inspect.unwrap(draw).__code__.co_filename)
    columns,fields=make_columns(data)
    if inspect.unwrap(draw).__globals__.get('JOURNAL_STYLE'):
        from journal_style import prepare
        prepare(inspect.unwrap(draw).__globals__['JOURNAL_STYLE'],inspect.unwrap(draw).__globals__.get('COLUMN_LAYOUT','single'))
    with Trace(source,columns,fields) as trace:fig=draw(processor(arrays(copy.deepcopy(jsonable(data)))))
    if inspect.unwrap(draw).__globals__.get('FIT_DATA',False):
        for ax in fig.findobj(matplotlib.axes.Axes):
            if ax.name=='rectilinear' and ax.axison and ax.get_label()!='<colorbar>':ax.autoscale(enable=True,axis='both')
    style_id=inspect.unwrap(draw).__globals__.get('JOURNAL_STYLE')
    layout=inspect.unwrap(draw).__globals__.get('COLUMN_LAYOUT','single')
    if style_id:
        from journal_style import apply
        apply(fig,style_id,layout,inspect.unwrap(draw).__globals__.get('COMPOSITE',False))
    axes,series=trace.describe(fig)
    if schema is None:
        schema={'version':1,'templateId':template_id,'fields':fields,'columnSpecs':{c['id']:{k:v for k,v in c.items() if k!='values'} for c in columns},'panels':[]}
        assigned=set()
        for i,ax in enumerate(axes):
            pid=f'panel-{i+1}';keys=sorted(set(k for s in series if s['panelId']==pid for k in s['columns']));assigned.update(keys)
            letter=getattr(ax,'_vl_part',None)
            name=(letter+' 图'+(' · '+str(sum(getattr(a,'_vl_part',None)==letter for a in axes[:i+1])) if sum(getattr(a,'_vl_part',None)==letter for a in axes)>1 else '')) if letter else f'分图 {i+1}'
            schema['panels'].append({'id':pid,'name':name,'columns':keys})
        if not schema['panels']:schema['panels']=[{'id':'panel-1','name':'分图 1','columns':[]}]
        schema['panels'][0]['columns']+= [c['id'] for c in columns if c['id'] not in assigned]
    panels=panels_from_schema(data,schema)
    (directory/'data.json').write_text(json.dumps(jsonable(data),ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    (directory/'table-schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf-8')
    write_book(directory/'数据.xlsx',panels,schema)
    fig.savefig(directory/'图.pdf',dpi=450);fig.savefig(directory/'图.svg',dpi=450);fig.savefig(directory/'预览.png',dpi=160)
    result={'templateId':template_id,'palette':palette,'panels':panels,'series':series,'styleId':style_id,'columnLayout':layout,'sizeMm':[float(v*25.4) for v in fig.get_size_inches()],'svgSize':[float(v*72) for v in fig.get_size_inches()]}
    (directory/'linked-data.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8');plt.close(fig)
    return result

def run_document(draw,process_data,palette,parameters):
    directory=Path(inspect.unwrap(draw).__code__.co_filename).parent
    data,schema=read_document_data(directory,inspect.unwrap(draw).__globals__.get('DATA_FILE','数据.xlsx'))
    data.update(parameters)
    return draw_document(directory,draw,data,palette,schema,schema['templateId'],process_data)
