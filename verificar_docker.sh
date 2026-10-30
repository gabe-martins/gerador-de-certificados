#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
docker compose config --quiet
docker compose ps certificados
runner=(docker compose exec -T certificados)
if [[ -n "${PAGELS_TEST_CONTAINER:-}" ]]; then
  runner=(docker exec -i "$PAGELS_TEST_CONTAINER")
fi
"${runner[@]}" python - <<'PY'
import io, json, hashlib, os, sqlite3, urllib.request
from pathlib import Path
from pypdf import PdfReader

base = 'http://127.0.0.1:8090'
def get(path):
    with urllib.request.urlopen(base + path, timeout=15) as response:
        assert response.status == 200
        return response.read()

health = json.loads(get('/api/health'))
assert health['status'] == 'ok' and health['models'] == 23
assert b'root' in get('/')
models = json.loads(get('/api/modelos'))['models']
assert len(models) == 23
payload = json.dumps({'nome_aluno':'Verificação João da Conceição','cidade':'São José','uf':'SC','data':'2026-12-01','modelo_id':'preta_7_grau'}).encode()
req = urllib.request.Request(base+'/api/preview', data=payload, headers={'Content-Type':'application/json'})
before = json.loads(get('/api/emissoes'))['total']
with urllib.request.urlopen(req, timeout=15) as response:
    assert response.headers['Content-Type'].startswith('application/pdf')
    preview = PdfReader(io.BytesIO(response.read()))
    assert len(preview.pages) == 1
    assert 'João da Conceição' in preview.pages[0].extract_text()
    assert '01 de dezembro de 2026' in preview.pages[0].extract_text()
# Exercise repeated templates without saving verification students in the history.
from server.pdf_engine import generate, local_text
rows = [
    {'nome_aluno':f'Verificação de Lote {i:03d}', 'cidade':'São José', 'uf':'SC',
     'data':f'2026-12-{i:02d}', 'modelo_id':'cinza_e_branca'}
    for i in range(1, 4)
]
batch = PdfReader(io.BytesIO(generate(rows)))
assert len(batch.pages) == 3
for row, page in zip(rows, batch.pages):
    text = page.extract_text()
    assert [r['nome_aluno'] for r in rows if r['nome_aluno'] in text] == [row['nome_aluno']]
    assert [local_text(r) for r in rows if local_text(r) in text] == [local_text(row)]

assert json.loads(get('/api/emissoes'))['total'] == before
data = Path(os.environ['PAGELS_DATA_DIR'])
with sqlite3.connect(data/'pagels.sqlite3') as conn:
    assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    jobs = conn.execute('SELECT id FROM jobs').fetchall()
    for (job_id,) in jobs:
        assert (data/'pdfs'/f'{job_id}.pdf').is_file()
print(json.dumps({'health':'ok','modelos':23,'preview_pdf':'ok','repeated_template_batch':'ok','database':'ok','certificados':before,'persisted_pdfs':len(jobs),'uid':os.getuid()},ensure_ascii=False))
PY
