import hashlib
import io
import json
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from pypdf import PdfReader

from server.main import create_app
from server.pdf_engine import MODELS, META, fit, generate, validate
from server.imports import model_id


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path)) as c:
        yield c


def row(**patch):
    return {"nome_aluno": "João Antônio Gonçalves", "cidade": "São José", "uf": "SC", "data": "2026-10-29", "modelo_id": "azul"} | patch


def emit(client, rows=None, **kw):
    return client.post("/api/emissoes", json={"request_id": str(uuid4()), "rows": rows or [row()]} | kw)


def test_all_models_and_diacritics():
    for model in MODELS.values():
        assert model_id(model["label"]) == model["id"]
    rows = [row(modelo_id=model) for model in MODELS]
    pdf = PdfReader(io.BytesIO(generate(rows)))
    assert len(pdf.pages) == 23
    for model, page in zip(MODELS.values(), pdf.pages):
        text = page.extract_text()
        assert "João Antônio Gonçalves" in text
        assert model["label"] + "." in text
        assert "Brasil – São José/SC, 29 de outubro de 2026." in text
        assert float(page.mediabox.width) == pytest.approx(META["page"]["width_pt"])
    # Repeated calls cannot leave names merged into the shared base PDF.
    other = PdfReader(io.BytesIO(generate([row(nome_aluno="Maria da Conceição")])))
    assert "João Antônio" not in other.pages[0].extract_text()


def test_date_format_in_preview_and_batch_exports(client):
    cases = [
        ("2026-12-01", "01 de dezembro de 2026"),
        ("2026-03-09", "09 de março de 2026"),
        ("2026-12-10", "10 de dezembro de 2026"),
    ]
    rows = [row(data=value) for value, _ in cases]
    for item, (_, expected) in zip(rows, cases):
        response = client.post("/api/preview", json=item)
        assert response.status_code == 200
        text = PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
        assert f"Brasil – São José/SC, {expected}." in text
    assert client.get("/api/emissoes").json()["total"] == 0

    response = emit(client, rows)
    assert response.status_code == 200, response.text
    issued = response.json()
    pdf = PdfReader(io.BytesIO(client.get(issued["pdf_url"]).content))
    archive = ZipFile(io.BytesIO(client.get(issued["zip_url"]).content))
    for index, (_, expected) in enumerate(cases):
        assert expected in pdf.pages[index].extract_text()
        individual = client.get(f'/api/emissoes/{issued["id"]}/certificados/{index}/pdf')
        assert individual.status_code == 200
        assert expected in PdfReader(io.BytesIO(individual.content)).pages[0].extract_text()
        zipped = archive.read(archive.namelist()[index])
        assert expected in PdfReader(io.BytesIO(zipped)).pages[0].extract_text()
    # The display format must not change stored dates or date-based searches.
    history = client.get("/api/emissoes?data_inicio=2026-12-01&data_fim=2026-12-01").json()
    assert history["total"] == 1
    assert history["items"][0]["data"] == "2026-12-01"


def test_fitting_and_rejecting_overflow(client):
    field = META["fields"][0]
    long_name = "Maria Aparecida de Albuquerque e Vasconcelos da Silva"
    assert 24 <= fit(long_name, field) < 32
    assert validate(row(nome_aluno="W"*100))[1]["nome_aluno"]
    assert validate(row(nome_aluno="Aluno 🥋"))[1]["nome_aluno"]
    assert emit(client, [row(nome_aluno="W"*100)]).status_code == 422
    assert client.get("/api/emissoes").json()["total"] == 0


def test_preview_no_history_and_invalid_fields(client):
    response = client.post("/api/preview", json={"modelo_id": "preta_7_grau"})
    assert response.status_code == 200
    assert "NOME DO ALUNO" in PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
    assert client.get("/api/emissoes").json()["total"] == 0
    assert emit(client, [row(uf="XX")]).status_code == 422
    assert emit(client, [row(data="2026-02-30")]).status_code == 422
    assert emit(client, [row(modelo_id="branca")]).status_code == 422


def test_issue_retry_duplicate_and_original_pdf(client, tmp_path):
    key = str(uuid4())
    issued = emit(client, request_id=key)
    assert issued.status_code == 200, issued.text
    issued = issued.json()
    assert emit(client, request_id=key).json()["id"] == issued["id"]
    assert emit(client, [row(nome_aluno="Outro aluno")], request_id=key).status_code == 409
    assert emit(client).json()["detail"]["code"] == "duplicates"
    assert emit(client, allow_duplicates=True).status_code == 200
    assert len(list((tmp_path / "pdfs").glob("*.pdf"))) == 2
    pdf = client.get(issued["pdf_url"]).content
    assert client.get(issued["pdf_url"] + '?inline=true').headers['content-disposition'].startswith('inline')
    restarted = TestClient(create_app(tmp_path))
    assert restarted.get(issued["pdf_url"]).content == pdf
    assert restarted.get("/api/emissoes").json()["total"] == 2
    assert client.get(f'/api/emissoes/{issued["id"]}/certificados/99/pdf').status_code == 404


def test_concurrent_retry(client):
    key = str(uuid4())
    with ThreadPoolExecutor(max_workers=4) as pool:
        values = list(pool.map(lambda _: emit(client, request_id=key), range(4)))
    assert {v.status_code for v in values} == {200}
    assert len({v.json()["id"] for v in values}) == 1
    assert client.get("/api/emissoes").json()["total"] == 1


def test_batch_100_and_zip(client):
    rows = [row(nome_aluno=f"Aluno de Teste {i+1:03d}", modelo_id=list(MODELS)[i % len(MODELS)]) for i in range(100)]
    start = time.perf_counter()
    response = emit(client, rows)
    assert response.status_code == 200, response.text
    value = response.json()
    pdf = PdfReader(io.BytesIO(client.get(value["pdf_url"]).content))
    assert len(pdf.pages) == 100
    for i, page in enumerate(pdf.pages):
        assert rows[i]["nome_aluno"] in page.extract_text()
    archive = ZipFile(io.BytesIO(client.get(value["zip_url"]).content))
    assert len(archive.namelist()) == len(set(archive.namelist())) == 100
    assert "Aluno de Teste 100" in PdfReader(io.BytesIO(archive.read(archive.namelist()[-1]))).pages[0].extract_text()
    assert client.get("/api/emissoes").json()["total"] == 100
    assert len(client.get("/api/emissoes?page=2").json()["items"]) == 50
    print(f"Lote100 + download PDF + ZIP: {time.perf_counter()-start:.2f}s")


def test_import_csv_inheritance_and_per_row_errors(client):
    data = "nome;cidade;uf;data;faixa\r\nAna da Conceição;;;;Roxa\r\nJosé;Curitiba;XX;30/02/2026;Azul\r\n"
    res = client.post("/api/lotes/importar", files={"file": ("alunos.csv", data.encode('utf-8-sig'))}, data={"defaults": json.dumps(row())})
    assert res.status_code == 200, res.text
    value = res.json()
    assert value["valid"] == 1
    assert value["items"][0]["row"]["cidade"] == "São José"
    assert value["items"][0]["row"]["modelo_id"] == "roxa"
    assert set(value["items"][1]["errors"]) == {"uf", "data"}
    assert client.get("/api/emissoes").json()["total"] == 0


def test_xlsx_date_degree_and_formula(client):
    from datetime import date
    wb = Workbook()
    ws = wb.active
    ws.append(["nome", "cidade", "uf", "data", "faixa", "grau"])
    ws.append(["Luís André", "Florianópolis", "SC", date(2026, 10, 29), "preta", 7])
    def upload():
        buf = io.BytesIO(); wb.save(buf)
        return client.post("/api/lotes/importar", files={"file": ("alunos.xlsx", buf.getvalue())})
    res = upload()
    assert res.status_code == 200, res.text
    assert res.json()["items"][0]["row"]["modelo_id"] == "preta_7_grau"
    assert res.json()["items"][0]["row"]["data"] == "2026-10-29"
    ws['A2'] = '=CONCAT("Ana","Silva")'
    assert upload().status_code == 422
    assert client.post("/api/lotes/importar", files={"file": ("a.csv", b"bad headers\na")}).status_code == 422
    assert client.post("/api/lotes/importar", files={"file": ("a.csv", b"a"*5_000_001)}).status_code == 413
    assert client.post("/api/lotes/validar", json={"rows": [row()]*501}).status_code == 422
    assert client.get("/api/lotes/modelo.xlsx").status_code == 200


def test_settings_backup_and_origin(client, tmp_path):
    saved = client.put("/api/configuracoes", json={"cidade": "São José", "uf": "sc"})
    assert saved.json() == {"cidade": "São José", "uf": "SC"}
    assert TestClient(create_app(tmp_path)).get("/api/configuracoes").json() == saved.json()
    result = emit(client).json()
    archive = ZipFile(io.BytesIO(client.get('/api/backup').content))
    manifest = json.loads(archive.read("manifesto.json"))
    for name, sha in manifest["sha256"].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == sha
    assert archive.read(f'data/pdfs/{result["id"]}.pdf') == client.get(result["pdf_url"]).content
    path = tmp_path / 'restore.sqlite3'; path.write_bytes(archive.read('data/pagels.sqlite3'))
    with sqlite3.connect(path) as conn:
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert conn.execute('SELECT count(*) FROM certificates').fetchone()[0] == 1
    assert client.post('/api/emissoes', headers={"Origin": "https://other.example"}, json={"rows": [row()], "request_id": str(uuid4())}).status_code == 403


def test_import_exactly_500_rows_and_search_accents(client):
    wb = Workbook(); ws = wb.active; ws.append(["nome"])
    for i in range(500):
        ws.append([f"Aluno {i}"])
    buf = io.BytesIO(); wb.save(buf)
    response = client.post('/api/lotes/importar', files={"file": ("500.xlsx", buf.getvalue())}, data={"defaults": json.dumps(row())})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == response.json()["valid"] == 500
    assert emit(client).status_code == 200
    assert client.get('/api/emissoes?q=JOAO%20ANTONIO').json()["total"] == 1


def test_new_belts_import_and_individual_exports(client):
    ids = ['laranja_e_branca', 'laranja', 'laranja_e_preta', 'verde_e_branca', 'verde', 'verde_e_preta']
    defaults = row()
    csv_data = 'nome;faixa\n' + '\n'.join(f'Aluno Novo {i};{MODELS[mid]["label"]}' for i, mid in enumerate(ids))
    result = client.post('/api/lotes/importar', files={'file':('novas.csv',csv_data.encode('utf-8-sig'))}, data={'defaults':json.dumps(defaults)})
    assert result.status_code == 200, result.text
    assert result.json()['valid'] == 6
    assert [item['row']['modelo_id'] for item in result.json()['items']] == ids
    wb = Workbook(); ws = wb.active; ws.append(['nome_aluno','modelo_id'])
    for i,mid in enumerate(ids): ws.append([f'Aluno XLSX {i}',mid])
    buffer = io.BytesIO(); wb.save(buffer)
    imported = client.post('/api/lotes/importar', files={'file':('novas.xlsx',buffer.getvalue())}, data={'defaults':json.dumps(defaults)})
    assert imported.json()['valid'] == 6
    rows = [item['row'] for item in imported.json()['items']]
    value = emit(client, rows).json()
    for i,mid in enumerate(ids):
        response = client.get(f'/api/emissoes/{value["id"]}/certificados/{i}/pdf')
        assert response.status_code == 200
        text = PdfReader(io.BytesIO(response.content)).pages[0].extract_text()
        assert MODELS[mid]['label'] + '.' in text
        assert 'Faixa Amarela' not in text
    assert client.get('/api/modelos').json()['models'] == list(MODELS.values())
    assert client.get('/api/health').json()['models'] == 23


def test_new_template_updates_do_not_recreate_historical_pdfs(client, tmp_path):
    old_content = generate([row(nome_aluno='Documento preservado',modelo_id='azul')])
    # History downloads must use the stored bytes, independently of the current renderer.
    issued = emit(client).json()
    path = tmp_path/'pdfs'/f'{issued["id"]}.pdf'
    path.write_bytes(old_content)
    assert client.get(issued['pdf_url']).content == old_content
