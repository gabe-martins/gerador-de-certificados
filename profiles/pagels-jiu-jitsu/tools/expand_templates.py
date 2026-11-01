"""Append orange/green templates without repainting the original certificate artwork."""
import argparse
import io
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, FloatObject, TextStringObject
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--assets', type=Path, required=True)
parser.add_argument('--dark-stripe', choices=['preta', 'cinza'], default='preta')
args = parser.parse_args()
source = PdfReader(args.source / 'modelos.pdf')
meta = json.loads((args.source / 'modelos.json').read_text())
assert len(source.pages) == len(meta['models']) == 17
pdfmetrics.registerFont(TTFont('PagelsModelBold', str(Path(__file__).resolve().parents[3] / 'assets' / 'fonts' / 'LiberationSans-Bold.ttf')))
writer = PdfWriter()
for page in source.pages:
    writer.add_page(page)
new_models = []
original_contents = [p.get_contents().get_data() for p in source.pages]
color_definitions = [('laranja', 'Laranja', (1, 128/255, 0)), ('verde', 'Verde', (0, 128/255, 0))]
layers = io.BytesIO()
overlay = Canvas(layers, pagesize=(meta['page']['width_pt'], meta['page']['height_pt']))
new_pages = []

def edit_line_and_bands(page, label, rgb, gray_stripe):
    positions = {}
    def visit(text, cm, tm, font, size):
        if abs(tm[5] - 254.608) < .01 and text.strip():
            positions['label' if font and 'Bold' in font.get('/BaseFont', '') else 'prefix'] = (tm[4], tm[5], size)
    page.extract_text(visitor_text=visit)
    assert set(positions) == {'label', 'prefix'}, positions
    prefix_advance = positions['label'][0] - positions['prefix'][0]
    size = positions['label'][2]
    label_text = label + '.'
    label_width = pdfmetrics.stringWidth(label_text, 'PagelsModelBold', size)
    left = (meta['page']['width_pt'] - prefix_advance - label_width) / 2
    contents = page.get_contents()
    operations = contents.operations
    shifted = removed = recolored = gray_count = 0
    start = None
    for index, (operands, operator) in enumerate(operations):
        if operator == b'BT':
            start = index
        elif operator == b'ET' and start is not None:
            block = operations[start:index+1]
            td = next(((a, o) for a, o in block if o == b'Td'), None)
            tf = next((a for a, o in block if o == b'Tf'), None)
            if td and abs(float(td[0][1]) - 254.608) < .01:
                font = page['/Resources']['/Font'][tf[0]].get_object()['/BaseFont']
                if 'Bold' in font:
                    for j in range(start, index):
                        if operations[j][1] in (b'Tj', b'TJ'):
                            operations[j] = ([TextStringObject('')], b'Tj')
                            removed += 1
                else:
                    td[0][0] = FloatObject(left)
                    shifted += 1
            start = None
        elif operator == b'rg':
            current = list(map(float, operands))
            if all(abs(a-b) < .0001 for a,b in zip(current, (1, 212/255, 0))):
                operations[index] = ([FloatObject(c) for c in rgb], operator)
                recolored += 1
            elif gray_stripe and current == [1,1,1]:
                # Only the two thin white belt stripes; page background stays white.
                path = operations[index+1:index+10]
                ys = [float(a[1]) for a,o in path if o in (b'm',b'l')]
                if ys and abs(max(ys)-min(ys)-9.439) < .02:
                    operations[index] = ([FloatObject(166/255)]*3, operator)
                    gray_count += 1
    assert shifted == 1 and removed >= 1 and recolored in (1,2)
    assert not gray_stripe or gray_count == 2
    contents.operations = operations
    # A cloned page can share its old stream with the original template.
    page[NameObject('/Contents')] = writer._add_object(contents)
    # Resource dictionaries must be independent before adding the label font.
    resources = DictionaryObject(page['/Resources'])
    for key in ('/Font', '/XObject', '/ExtGState', '/ColorSpace'):
        if key in resources:
            resources[NameObject(key)] = DictionaryObject(resources[key].get_object())
    page[NameObject('/Resources')] = resources
    overlay.setFont('PagelsModelBold', size)
    overlay.drawString(left + prefix_advance, positions['label'][1], label_text)
    overlay.showPage()

for color_id, color_label, rgb in color_definitions:
    for stripe in ('branca', None, args.dark_stripe):
        model_id = color_id + (f'_e_{stripe}' if stripe else '')
        label = f'Faixa {color_label}' + (f' e {stripe.title()}' if stripe else '')
        template_index = 4 if stripe is None else (5 if stripe == 'preta' else 3)
        page = writer.add_page(source.pages[template_index])
        edit_line_and_bands(page, label, rgb, stripe == 'cinza')
        new_pages.append(page)
        new_models.append({'id':model_id,'label':label,'page':len(writer.pages),'degree':None})

overlay.save()
layers.seek(0)
for page, layer in zip(new_pages, PdfReader(layers).pages):
    page.merge_page(layer)
for i, expected in enumerate(original_contents):
    assert writer.pages[i].get_contents().get_data() == expected, f'Original page changed: {i+1}'
writer.add_metadata({'/Title':'Modelos Pagels - 23 faixas','/Producer':'Pagels Certificados 1.1.0'})
with (args.assets / 'modelos.pdf').open('wb') as target:
    writer.write(target)
# Gallery order follows the graduation sequence; existing page numbers stay fixed.
# Preserve the profile metadata (formats and visual grouping) when expanding it.
meta['models'][6:6] = new_models
meta['schema'] = 'certificates.shared-pdf-templates/1.0'
for model in meta['models']:
    mid = model['id']
    model['visual'] = {'kind':'belt', 'color':mid.split('_')[0], 'stripe':mid.split('_e_')[1] if '_e_' in mid else '', 'degree':model.get('degree') or 0}
    if mid.startswith('preta'):
        model['group'] = 'preta'
meta['fields'][0].setdefault('format', '{nome_aluno}')
(args.assets / 'modelos.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
result = PdfReader(args.assets / 'modelos.pdf')
assert len(result.pages) == 23
for model in new_models:
    text = result.pages[model['page']-1].extract_text()
    assert model['label']+'.' in text
    assert 'Faixa Amarela' not in text
print(json.dumps({'pages':len(result.pages),'new_models':new_models,'old_pages_unchanged':17},ensure_ascii=False))
