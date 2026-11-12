from pathlib import Path
import ast,importlib.util,json,shutil,sys,traceback,re
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from vl_runtime import *

def load(file):
    spec=importlib.util.spec_from_file_location('vl_user_figure',file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def make_program(template,item):
    tree=ast.parse(template.read_text(encoding='utf-8'))
    nodes=[n for n in tree.body if isinstance(n,(ast.Assign,ast.FunctionDef))]
    make=next(n for n in nodes if isinstance(n,ast.FunctionDef) and n.name=='make_data')
    draw=next(n for n in nodes if isinstance(n,ast.FunctionDef) and n.name=='draw')
    constants='\n'.join(ast.unparse(n) for n in nodes if isinstance(n,ast.Assign))
    code=ast.unparse(draw)
    lines=[]
    for line in code.splitlines():
        if any(f'.{name}(' in line for name in ['plot','scatter','bar','hist','imshow','contour','pcolormesh']):
            lines.append(' '*(len(line)-len(line.lstrip()))+'# 绘图命令：选择表格列时，工作台定位并高亮这一行。')
        lines.append(line)
    return f'''# -*- coding: utf-8 -*-
# 本文件可编辑并独立运行；请与数据.xlsx、data.json和本目录辅助文件放在一起。
from vl_runtime import *

# ═════ 一、选择图样 ═════
# {item['name']}：{item['purpose']}。
# 模板引用可写入对话；多个模板可分别组成a、b等分图。
TEMPLATE_ID = {item['id']!r}
{constants}

# ═════ 二、选择配色 ═════
# nature：论文配色；violet：紫青色；warm：珊瑚暖色。
PALETTE = 'nature'
# 上传数据后自动适配坐标范围；可改为False并在绘图命令中固定范围。
FIT_DATA = False

# ═════ 三、数据上传 ═════
# 数据.xlsx中的每个可见工作表对应一个分图，共享列会一起更新。
# 可先下载该工作簿填数，也可在工作台上传Excel/CSV并指定列对应。
DATA_FILE = '数据.xlsx'

# ═════ 四、数据处理 ═════
# 表格列会恢复为数值数组；此处可加入排序、归一化或筛选。
# 统计拟合等图样自带处理保留在下方函数中，避免改变原图的统计含义。
PARAMETERS = {{}}
def process_data(data):
    return data

# 以下固定种子函数只用于复现示例；上传数据后不调用它。
{ast.unparse(make)}

# ═════ 五、绘图 ═════
# 正式文件默认输出图.pdf；SVG供工作台做数据—代码—图的联动预览。
# 字体、字号、线宽与图幅按所选期刊和单/双栏固定；不改变原始数据。
# 尽量利用图幅：对齐分图并减少边距、中间空隙；保留必要的刻度、标签和图例空间。
{chr(10).join(lines)}

if __name__ == '__main__':
    run_document(draw, process_data, PALETTE, PARAMETERS)
'''

def make_composite(items):
    parts=[]
    for index,item in enumerate(items):
        tag=chr(97+index)
        tree=ast.parse(make_program(ROOT/item['source'],item))
        names={n.name for n in tree.body if isinstance(n,ast.FunctionDef)}
        names|={t.id for n in tree.body if isinstance(n,ast.Assign) for t in n.targets if isinstance(t,ast.Name)}
        mapping={name:('draw_part_'+tag if name=='draw' else tag+'_'+name) for name in names}
        class Rename(ast.NodeTransformer):
            def visit_Name(self,node):node.id=mapping.get(node.id,node.id);return node
            def visit_FunctionDef(self,node):node.name=mapping.get(node.name,node.name);return self.generic_visit(node)
        nodes=[Rename().visit(n) for n in tree.body if isinstance(n,(ast.Assign,ast.FunctionDef))]
        parts.append('# 分图 '+tag+' · 模板'+str(item['number'])+' · '+item['name']+'\n'+ast.unparse(ast.fix_missing_locations(ast.Module(body=nodes,type_ignores=[]))))
    makers='\n'.join("    data.update({"+repr(chr(97+i)+'__')+"+k:v for k,v in "+chr(97+i)+"_make_data(rng).items()})" for i in range(len(items)))
    drawers=[]
    for i in range(len(items)):
        tag=chr(97+i)
        drawers.append(f"""        vlplot.ACTIVE_FIGURE=subfigures[{i}]
        draw_part_{tag}({{k.removeprefix('{tag}__'):v for k,v in data.items() if k.startswith('{tag}__')}})
        for axis in subfigures[{i}].axes:axis._vl_part='{tag}'
        subfigures[{i}].text(.015,.98,'{tag}',ha='left',va='top',gid='vl-panel-label')""")
    return """# -*- coding: utf-8 -*-
# 不同模板组成同一张图；数据表和绘图命令分别保留。
# 紧凑排版：对齐分图、压缩无效留白，固定字号线宽不缩小，文字与图例不重叠。
from vl_runtime import *
import vlplot
from journal_style import prepare
"""+'\n\n'.join(parts)+f"""
TEMPLATE_ID = 'COMPOSITE'
PALETTE = 'nature'
PARAMETERS = {{}}
FIT_DATA = False
JOURNAL_STYLE = 'nature'
COLUMN_LAYOUT = 'single'
COMPOSITE = True

def process_data(data):
    return data

def make_data(rng):
    data={{}}
{makers}
    return data

def draw(data):
    spec=prepare(JOURNAL_STYLE,COLUMN_LAYOUT)
    count={len(items)}
    cols=2 if count>=3 or COLUMN_LAYOUT=='double' and count>1 else 1
    rows=math.ceil(count/cols)
    fig=plt.figure(figsize=(spec['width']/25.4,(spec['width']/cols)*.82*rows/25.4))
    grid=fig.add_gridspec(rows,cols,left=.01,right=.99,bottom=.01,top=.99,wspace=.025,hspace=.025)
    subfigures=[fig.add_subfigure(grid[i//cols,:] if i==count-1 and count%cols else grid[i//cols,i%cols]) for i in range(count)]
    for sub in subfigures:sub.patch.set_alpha(0)
    try:
{chr(10).join(drawers)}
    finally:
        vlplot.ACTIVE_FIGURE=None
    return fig

if __name__=='__main__':
    run_document(draw,process_data,PALETTE,PARAMETERS)
"""

def set_presentation(directory,job):
    file=directory/'绘图.py';code=file.read_text(encoding='utf-8')
    for key,value in [('JOURNAL_STYLE',job.get('styleId')),('COLUMN_LAYOUT',job.get('columnLayout'))]:
        if value is None:continue
        if key=='JOURNAL_STYLE':
            from journal_style import configuration
            configuration(value,job.get('columnLayout','single'))
        elif value not in ('single','double'):raise ValueError('请选择单栏或双栏')
        line=f'{key} = {value!r}'
        code=re.sub(r'^'+key+r'\s*=.*$',lambda _:line,code,flags=re.MULTILINE) if re.search(r'^'+key+r'\s*=',code,re.MULTILINE) else code.replace('from vl_runtime import *','from vl_runtime import *\n'+line,1)
    file.write_text(code,encoding='utf-8')

def main(job):
    action=job['action']
    if action=='probe':return {'python':sys.executable,'numpy':np.__version__,'matplotlib':matplotlib.__version__}
    if action=='inspect':
        sheets,schema=read_book(job['file']);return {'sheets':[{'name':s['name'],'headers':s['headers'],'rowCount':len(s['rows']),'preview':s['rows'][:12]} for s in sheets],'native':schema is not None}
    directory=Path(job['directory']).resolve()
    if action=='create':
        items=job.get('templates') or [job['template']];item=items[0];template=ROOT/item['source'];directory.mkdir(parents=True,exist_ok=True)
        for name in ['vlplot.py','vl_runtime.py','workbook_io.py','journal_style.py','journal-styles.json']:shutil.copy2(ROOT/name,directory/name)
        code=make_composite(items) if len(items)>1 else make_program(template,item);(directory/'绘图.py').write_text(code,encoding='utf-8');set_presentation(directory,{'styleId':job.get('styleId','nature'),'columnLayout':job.get('columnLayout','single')})
        mod=load(directory/'绘图.py');data=mod.make_data(np.random.default_rng(20261107+item['number']))
        draw_document(directory,mod.draw,data,'nature',None,'COMPOSITE' if len(items)>1 else item['id']);return {'ok':True}
    if action=='render' and 'palette' in job:
        if job['palette'] not in PALETTES:raise ValueError('未知配色')
        file=directory/'绘图.py';code=file.read_text(encoding='utf-8');code=re.sub(r'^PALETTE\s*=.*$',f"PALETTE = {job['palette']!r}",code,flags=re.MULTILINE);file.write_text(code,encoding='utf-8')
    set_presentation(directory,job)
    mod=load(directory/'绘图.py')
    if action=='render':
        if 'palette' in job:mod.PALETTE=job['palette']
        run_document(mod.draw,mod.process_data,mod.PALETTE,mod.PARAMETERS);return {'ok':True}
    if action=='import':
        books,native=read_book(job['file']);data=json.loads((directory/'data.json').read_text(encoding='utf-8'));schema=json.loads((directory/'table-schema.json').read_text(encoding='utf-8'))
        if native and native.get('templateId')==schema['templateId']:
            shutil.copy2(job['file'],directory/'数据.xlsx');data,schema=read_document_data(directory)
        else:
            mappings=job.get('mappings',[]);changes={}
            for m in mappings:
                key=m['target']
                if key not in schema['columnSpecs']:raise ValueError('模板列不存在')
                table=books[int(m['sheet'])];ci=int(m['column'])
                if ci<0 or ci>=len(table['headers']):raise ValueError('上传列不存在')
                v=[row[ci] if ci<len(row) else None for row in table['rows']]
                while v and v[-1] is None:v.pop()
                changes[key]=v
            if not changes:raise ValueError('请至少选择一列上传数据')
            used=set(k for s in json.loads((directory/'linked-data.json').read_text(encoding='utf-8'))['series'] for k in s['columns'])
            for f in schema['fields']:
                selected=[k for k in f['columns'] if k in changes]
                if not selected:continue
                if len(selected)<len(f['columns']) and f['dtype'] in 'biuf':
                    if len(f['path'])==1 and f['path'][0].split('__')[-1]=='y' and len(f['shape'])==2 and f['axis']==1:
                        original=np.asarray(data[f['path'][0]]);indices=[schema['columnSpecs'][k]['index'][0] for k in selected];data[f['path'][0]]=original[indices].tolist();f['columns']=selected
                        for i,k in enumerate(selected):schema['columnSpecs'][k]['index']=[i]
                    elif any(k in used for k in f['columns'] if k not in changes):raise ValueError('请映射该数据组的所有绘图列：'+str(f['path'][0]))
            data=restore_columns(data,schema,changes);schema=None
        mod.FIT_DATA=True
        file=directory/'绘图.py';file.write_text(re.sub(r'^FIT_DATA\s*=.*$','FIT_DATA = True',file.read_text(encoding='utf-8'),flags=re.MULTILINE),encoding='utf-8')
        draw_document(directory,mod.draw,data,job.get('palette',mod.PALETTE),schema,job['templateId'],mod.process_data);return {'ok':True}
    raise ValueError('未知绘图操作')

if __name__=='__main__':
    job=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    try:
        result=main(job);Path(job['result']).write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    except Exception as e:
        Path(job['result']).write_text(json.dumps({'error':str(e),'trace':traceback.format_exc()},ensure_ascii=False),encoding='utf-8');sys.exit(1)
