import csv
import io
import json
import re
from datetime import date, datetime
from zipfile import ZipFile, BadZipFile
from xml.etree.ElementTree import ParseError

from openpyxl import load_workbook, Workbook
from openpyxl.utils.exceptions import InvalidFileException
from .pdf_engine import normalized, clean, MODELS

MAX_ROWS = 500
HEADERS = ["nome_aluno", "cidade", "uf", "data", "modelo_id"]
ALIASES = {"nome": "nome_aluno", "aluno": "nome_aluno", "nome do aluno": "nome_aluno", "nome aluno": "nome_aluno", "faixa": "modelo_id", "modelo": "modelo_id", "estado": "uf", "graduacao": "modelo_id", "grau": "grau"}


def model_id(value, degree=None):
    # Remove ordinal symbols before NFKD, which otherwise converts º into the letter o.
    value = normalized(clean(value).replace("º", "").replace("°", "")).replace("faixa ", "").replace("amarelo", "amarela")
    value = re.sub(r"[\s/-]+", "_", value)
    if value == "preta" and degree not in (None, "", 0, "0"):
        value = f"preta_{clean(degree).replace('º', '').replace('°', '')}_grau"
    return value


def import_date(value):
    if isinstance(value, (datetime, date)):
        return value.strftime("%Y-%m-%d")
    value = clean(value)
    if re.fullmatch(r"\d{2}/\d{2}/\d{4}", value):
        try:
            return datetime.strptime(value, "%d/%m/%Y").date().isoformat()
        except ValueError:
            pass
    return value


def parse_import(content, name, defaults):
    if name.lower().endswith(".xlsx"):
        try:
            with ZipFile(io.BytesIO(content)) as z:
                if sum(i.file_size for i in z.infolist()) > 25_000_000 or len(z.infolist()) > 500:
                    raise ValueError("A planilha descompactada é muito grande.")
            wb = load_workbook(io.BytesIO(content), read_only=True, data_only=False, keep_links=False)
            try:
                matrix = []
                if (wb.active.max_row or 0) > 10000:
                    raise ValueError("Remova as linhas vazias excedentes da planilha antes de importar.")
                for cells in wb.active.iter_rows(max_col=min(wb.active.max_column or 30, 30)):
                    if not any(clean(c.value) for c in cells):
                        continue
                    if len(matrix) > MAX_ROWS:
                        raise ValueError(f"Importe até {MAX_ROWS} alunos por lote.")
                    if any(c.data_type == "f" for c in cells):
                        raise ValueError("A planilha contém fórmulas. Cole somente os valores antes de importar.")
                    matrix.append([c.value for c in cells[:30]])
            finally:
                wb.close()
        except (BadZipFile, KeyError, OSError, ParseError, InvalidFileException) as exc:
            raise ValueError("Não foi possível abrir o XLSX. Salve uma nova cópia e tente novamente.") from exc
    elif name.lower().endswith(".csv"):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = content.decode("cp1252")
        try:
            dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        matrix = list(csv.reader(io.StringIO(text), dialect))
    else:
        raise ValueError("Selecione um arquivo CSV ou XLSX.")
    matrix = [r for r in matrix if any(clean(c) for c in r)]
    if not matrix:
        raise ValueError("O arquivo está vazio.")
    headers = []
    for item in matrix[0]:
        key = normalized(clean(item)).replace("_", " ")
        headers.append(ALIASES.get(key, key.replace(" ", "_")))
    if "nome_aluno" not in headers:
        raise ValueError("A primeira linha deve conter a coluna nome_aluno (ou nome). Baixe a planilha modelo.")
    recognized = [h for h in headers if h in HEADERS or h == "grau"]
    if len(set(recognized)) != len(recognized):
        raise ValueError("Há colunas repetidas. Mantenha apenas uma coluna para cada campo.")
    if len(matrix) - 1 > MAX_ROWS:
        raise ValueError(f"Importe até {MAX_ROWS} alunos por lote.")
    rows = []
    for values in matrix[1:]:
        row = dict(defaults)
        imported = {k: v for k, v in zip(headers, values) if k in HEADERS + ["grau"] and clean(v)}
        row.update(imported)
        row["data"] = import_date(row.get("data"))
        row["modelo_id"] = model_id(row.get("modelo_id", ""), row.pop("grau", None))
        rows.append({k: clean(row.get(k)) for k in HEADERS})
    return rows


def template_xlsx():
    wb = Workbook()
    ws = wb.active
    ws.title = "Alunos"
    ws.append(HEADERS)
    for col in "ABCDE":
        ws.column_dimensions[col].width = 28 if col in "AB" else 20
    ws.freeze_panes = "A2"
    guide = wb.create_sheet("Instruções")
    for text in ["Preencha a aba Alunos; uma linha por aluno.", "Campos vazios herdam os dados do evento na aplicação.", "Data: DD/MM/AAAA ou AAAA-MM-DD. Sem fórmulas.", "Na coluna modelo_id, use um dos identificadores abaixo:"]:
        guide.append([text])
    for model in MODELS.values():
        guide.append([model["id"], model["label"]])
    guide.column_dimensions["A"].width = 80
    guide.column_dimensions["B"].width = 35
    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()
