"""Application XLSX adapter: one visible worksheet per panel, hidden schema.
Uses standard OOXML/ZIP; no spreadsheet-engine or network dependency at runtime.
"""
from pathlib import Path
import csv,io,json,zipfile,xml.etree.ElementTree as ET,re
from xml.sax.saxutils import escape
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def colname(n):
    s=''
    while n:n,k=divmod(n-1,26);s=chr(65+k)+s
    return s

def write_book(path,panels,schema):
    sheets=[(p['name'],[ [c['label'] for c in p['columns']] ]+[[c['values'][r] if r<len(c['values']) else None for c in p['columns']] for r in range(max([len(c['values']) for c in p['columns']],default=0))],False) for p in panels]
    raw=json.dumps(schema,ensure_ascii=False,separators=(',',':'))
    sheets.append(('_VL_SCHEMA',[['VL_WORKBOOK_1']]+[[raw[i:i+30000]] for i in range(0,len(raw),30000)],True))
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
        types=['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>','<Default Extension="xml" ContentType="application/xml"/>','<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>','<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>']
        wb=[];rels=[]
        for ix,(name,rows,hidden) in enumerate(sheets,1):
            types.append(f'<Override PartName="/xl/worksheets/sheet{ix}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
            wb.append(f'<sheet name="{escape(name)}" sheetId="{ix}" r:id="rId{ix}"'+(' state="hidden"' if hidden else '')+'/>')
            rels.append(f'<Relationship Id="rId{ix}" Type="{REL}/worksheet" Target="worksheets/sheet{ix}.xml"/>')
            body=[]
            for ri,row in enumerate(rows,1):
                cells=[]
                for ci,value in enumerate(row,1):
                    if value is None:continue
                    ref=f'{colname(ci)}{ri}';sty=' s="1"' if ri==1 else ''
                    if isinstance(value,(float,int)) and not isinstance(value,bool):cells.append(f'<c r="{ref}"{sty}><v>{value}</v></c>')
                    elif isinstance(value,bool):cells.append(f'<c r="{ref}" t="b"{sty}><v>{int(value)}</v></c>')
                    else:cells.append(f'<c r="{ref}" t="inlineStr"{sty}><is><t xml:space="preserve">{escape(str(value))}</t></is></c>')
                body.append(f'<row r="{ri}">'+''.join(cells)+'</row>')
            z.writestr(f'xl/worksheets/sheet{ix}.xml',f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="{NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="{max(1,len(rows[0]))}" width="17" customWidth="1"/></cols><sheetData>'+''.join(body)+'</sheetData></worksheet>')
        rels.append(f'<Relationship Id="rIdStyles" Type="{REL}/styles" Target="styles.xml"/>')
        z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+''.join(types)+'</Types>')
        z.writestr('_rels/.rels',f'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml',f'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="{NS}" xmlns:r="{REL}"><sheets>'+''.join(wb)+'</sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(rels)+'</Relationships>')
        z.writestr('xl/styles.xml',f'<?xml version="1.0"?><styleSheet xmlns="{NS}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF202020"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')

def read_book(path):
    path=Path(path)
    if path.stat().st_size>40*1024*1024:raise ValueError('数据文件超过40MB，请先精简后上传')
    if path.suffix.lower() in ['.csv','.tsv']:
        data=path.read_bytes()
        try:text=data.decode('utf-8-sig')
        except UnicodeDecodeError:text=data.decode('gb18030')
        rows=list(csv.reader(io.StringIO(text),delimiter='\t' if path.suffix.lower()=='.tsv' else ','))
        def cell(v):
            try:return float(v) if v.strip() else None
            except ValueError:return v
        return [{'name':path.stem[:31],'headers':rows[0] if rows else [],'rows':[[cell(v) for v in row] for row in rows[1:]]}],None
    if path.suffix.lower()!='.xlsx':raise ValueError('请上传 .xlsx、.csv 或 .tsv；旧版 .xls 请先另存为 .xlsx')
    with zipfile.ZipFile(path) as z:
        if sum(v.file_size for v in z.infolist())>150*1024*1024:raise ValueError('解压后的表格过大')
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            shared=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(f'{{{NS}}}si')]
        relations={v.attrib['Id']:v.attrib['Target'] for v in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        books=[];schema=None
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall(f'{{{NS}}}sheets/{{{NS}}}sheet'):
            target=relations[sheet.attrib[f'{{{REL}}}id']];target=target.lstrip('/') if target.startswith('/') else 'xl/'+target
            rows=[]
            for row in ET.fromstring(z.read(target)).findall(f'{{{NS}}}sheetData/{{{NS}}}row'):
                ri=int(row.attrib.get('r',len(rows)+1))
                if ri<1 or ri>200001:raise ValueError('工作表行号超出20万行范围')
                while len(rows)<ri-1:rows.append([])
                vals=[]
                for c in row:
                    ref=c.attrib.get('r','A1');idx=0
                    if not re.fullmatch(r'[A-Za-z]{1,3}[1-9][0-9]*',ref):raise ValueError('无效的Excel单元格地址')
                    for a in ref:
                        if not a.isalpha():break
                        idx=idx*26+ord(a.upper())-64
                    if idx>16384:raise ValueError('Excel列数超出支持范围')
                    while len(vals)<idx:vals.append(None)
                    text=c.find(f'{{{NS}}}v');value=text.text if text is not None else None;kind=c.attrib.get('t')
                    if kind=='inlineStr':value=''.join(c.find(f'{{{NS}}}is').itertext()) if c.find(f'{{{NS}}}is') is not None else ''
                    elif kind=='s':value=shared[int(value)] if value is not None else ''
                    elif kind=='b':value=value=='1'
                    elif value is not None and kind not in ['str','e']:
                        try:value=float(value)
                        except ValueError:pass
                    if c.find(f'{{{NS}}}f') is not None and value is None:raise ValueError('表格中有未计算的公式，请在Excel中重新计算并保存')
                    vals[idx-1]=value
                rows.append(vals)
                if len(rows)>200001:raise ValueError('单张工作表超过20万行，请先筛选数据')
            name=sheet.attrib['name']
            if name=='_VL_SCHEMA':
                if rows and rows[0] and rows[0][0]=='VL_WORKBOOK_1':schema=json.loads(''.join(str(v[0]) for v in rows[1:] if v and v[0]))
                continue
            books.append({'name':name,'headers':[str(v or f'列{i+1}') for i,v in enumerate(rows[0])] if rows else [],'rows':rows[1:]})
        return books,schema
