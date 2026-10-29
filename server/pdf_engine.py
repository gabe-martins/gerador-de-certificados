"""One shared template PDF; only the two variable lines are drawn again."""
import hashlib
import io
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ASSETS = Path(__file__).resolve().parents[1] / "assets"
META = json.loads((ASSETS / "modelos.json").read_text())
MODELS = {m["id"]: m for m in META["models"]}
VERSION = hashlib.sha256(b"".join((ASSETS / f).read_bytes() for f in
    ("modelos.pdf", "modelos.json", "LiberationSans-Bold.ttf"))).hexdigest()
FONT = "PagelsBold"
pdfmetrics.registerFont(TTFont(FONT, str(ASSETS / "LiberationSans-Bold.ttf")))
UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()
MONTHS = "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split()
KEYS = ("nome_aluno", "cidade", "uf", "data", "modelo_id")


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).lower()) if not unicodedata.combining(c))


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def fit(text, field):
    glyphs = pdfmetrics.getFont(FONT).face.charToGlyph
    if any(ord(c) not in glyphs for c in text):
        raise ValueError("Há caracteres que a fonte do certificado não suporta. Revise o texto.")
    width = field["box_mm"]["width"] * 72 / 25.4
    size = float(field["font_size_pt"])
    while size >= field["min_font_size_pt"]:
        if pdfmetrics.stringWidth(text, FONT, size) <= width:
            return size
        size -= .25
    raise ValueError("O texto excede a área do certificado. Abrevie sem perder a identificação.")


def local_text(row):
    d = date.fromisoformat(row["data"])
    return f'Brasil – {row["cidade"]}/{row["uf"]}, {d.day:02d} de {MONTHS[d.month-1]} de {d.year}.'


def validate(row):
    row = {key: clean(row.get(key)) for key in KEYS}
    row["uf"] = row["uf"].upper()
    errors = {}
    for key, label in (("nome_aluno", "Nome"), ("cidade", "Cidade"), ("uf", "UF"), ("data", "Data"), ("modelo_id", "Faixa")):
        if not row[key]:
            errors[key] = f"{label} é obrigatório."
    for key in ("nome_aluno", "cidade"):
        if len(row[key]) > 200:
            errors[key] = "Use no máximo 200 caracteres."
    if row["uf"] and row["uf"] not in UFS:
        errors["uf"] = "Selecione uma UF brasileira válida."
    if row["modelo_id"] and row["modelo_id"] not in MODELS:
        errors["modelo_id"] = f"Escolha um dos {len(MODELS)} modelos disponíveis."
    if row["data"]:
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["data"]):
                raise ValueError()
            date.fromisoformat(row["data"])
        except ValueError:
            errors["data"] = "Informe uma data válida (dia, mês e ano)."
    sizes = {}
    if row["nome_aluno"] and "nome_aluno" not in errors:
        try:
            sizes["nome_aluno"] = fit(row["nome_aluno"], META["fields"][0])
        except ValueError as exc:
            errors["nome_aluno"] = str(exc)
    if not any(k in errors for k in ("cidade", "uf", "data")):
        try:
            sizes["local_data"] = fit(local_text(row), META["fields"][1])
        except ValueError as exc:
            errors["cidade"] = str(exc)
    return row, errors, sizes


def duplicate_key(row):
    return f'{normalized(clean(row["nome_aluno"]))}|{row["modelo_id"]}|{row["data"]}'


def generate(rows, preview=False):
    base = PdfReader(ASSETS / "modelos.pdf")
    overlay = io.BytesIO()
    canvas = Canvas(overlay, pagesize=(META["page"]["width_pt"], META["page"]["height_pt"]))
    for row in rows:
        texts = [row.get("nome_aluno") or "NOME DO ALUNO", local_text(row) if all(row.get(k) for k in ("cidade", "uf", "data")) else "Brasil – CIDADE/UF, DATA."]
        for text, field in zip(texts, META["fields"]):
            size = fit(text, field)
            canvas.setFont(FONT, size)
            canvas.drawCentredString(META["page"]["width_pt"] / 2,
                field["reference_baseline_pdf_pt"] + (field["font_size_pt"] - size) * .35, text)
        canvas.showPage()
    canvas.save()
    overlay.seek(0)
    layers = PdfReader(overlay)
    writer = PdfWriter()
    for i, row in enumerate(rows):
        page = writer.add_page(base.pages[MODELS[row.get("modelo_id") or "azul"]["page"] - 1])
        page.merge_page(layers.pages[i])
    writer.add_metadata({"/Title": "Prévia Pagels" if preview else "Certificados Pagels", "/Producer": "Pagels Certificados 1.1.1"})
    result = io.BytesIO()
    writer.write(result)
    return result.getvalue()


def single_page(content, index):
    writer = PdfWriter()
    reader = content if isinstance(content, PdfReader) else PdfReader(io.BytesIO(content))
    writer.add_page(reader.pages[index])
    result = io.BytesIO()
    writer.write(result)
    return result.getvalue()


def filename(row, index=0):
    name = re.sub(r"[^a-zA-Z0-9_-]+", "_", normalized(row["nome_aluno"])).strip("_")[:80] or "aluno"
    return f'{index+1:03d}_{name}_{row["modelo_id"]}.pdf'
