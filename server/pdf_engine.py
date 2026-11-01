"""Profile-bound PDF rendering; artwork and text formats live in each profile."""
import io
import re
import unicodedata
from datetime import date

from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split()
MONTHS = "janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro".split()
KEYS = ("nome_aluno", "cidade", "uf", "data", "modelo_id")


def normalized(value):
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).lower()) if not unicodedata.combining(c))


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def fit(text, field, font):
    glyphs = pdfmetrics.getFont(font).face.charToGlyph
    if any(ord(c) not in glyphs for c in text):
        raise ValueError("Há caracteres que a fonte do certificado não suporta. Revise o texto.")
    width = field["box_mm"]["width"] * 72 / 25.4
    size = float(field["font_size_pt"])
    while size >= field["min_font_size_pt"]:
        if pdfmetrics.stringWidth(text, font, size) <= width:
            return size
        size -= .25
    raise ValueError("O texto excede a área do certificado. Abrevie sem perder a identificação.")


def long_date(value):
    d = date.fromisoformat(value)
    return f'{d.day:02d} de {MONTHS[d.month-1]} de {d.year}'


class CertificateEngine:
    """Rendering and validation bound to one immutable use-case profile."""

    def __init__(self, profile):
        self.profile = profile
        self.meta = profile.meta
        self.models = profile.models
        self.font = "CertificateFont_" + profile.version
        if self.font not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(self.font, str(profile.font_path)))

    def fit(self, text, field):
        return fit(text, field, self.font)

    def field_text(self, row, field):
        if not all(row.get(key) for key in field["input_keys"]):
            return field["placeholder"]
        values = dict(row)
        if "{data_por_extenso}" in field["format"]:
            values["data_por_extenso"] = long_date(row["data"])
        return field["format"].format_map(values)

    def local_text(self, row):
        return self.field_text(row, next(f for f in self.meta["fields"] if f["name"] == "local_data"))

    def validate(self, row):
        row = {key: clean(row.get(key)) for key in KEYS}
        row["uf"] = row["uf"].upper()
        errors = {}
        labels = self.profile.config["labels"]
        for key, label in (("nome_aluno", labels["recipient"]), ("cidade", "Cidade"), ("uf", "UF"), ("data", labels["date"]), ("modelo_id", labels["template"])):
            if not row[key]:
                errors[key] = f"{label} é obrigatório."
        for key in ("nome_aluno", "cidade"):
            if len(row[key]) > 200:
                errors[key] = "Use no máximo 200 caracteres."
        if row["uf"] and row["uf"] not in UFS:
            errors["uf"] = "Selecione uma UF brasileira válida."
        if row["modelo_id"] and row["modelo_id"] not in self.models:
            errors["modelo_id"] = f"Escolha um dos {len(self.models)} modelos disponíveis."
        if row["data"]:
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["data"]):
                    raise ValueError()
                date.fromisoformat(row["data"])
            except ValueError:
                errors["data"] = "Informe uma data válida (dia, mês e ano)."
        sizes = {}
        for field in self.meta["fields"]:
            keys = field["input_keys"]
            if not any(key in errors for key in keys):
                try:
                    sizes[field["name"]] = self.fit(self.field_text(row, field), field)
                except ValueError as exc:
                    errors[keys[0]] = str(exc)
        return row, errors, sizes

    def generate(self, rows, preview=False):
        meta = self.meta
        base = PdfReader(self.profile.assets / "modelos.pdf")
        overlay = io.BytesIO()
        canvas = Canvas(overlay, pagesize=(meta["page"]["width_pt"], meta["page"]["height_pt"]))
        for row in rows:
            for field in meta["fields"]:
                text = self.field_text(row, field)
                size = self.fit(text, field)
                canvas.setFont(self.font, size)
                canvas.drawCentredString(meta["page"]["width_pt"] / 2,
                    field["reference_baseline_pdf_pt"] + (field["font_size_pt"] - size) * .35, text)
            canvas.showPage()
        canvas.save()
        overlay.seek(0)
        layers = PdfReader(overlay)
        writer = PdfWriter()
        writer.pdf_header = base.pdf_header
        for i, row in enumerate(rows):
            # Keep mutable page contents independent when a model repeats.
            page = writer.add_blank_page(width=meta["page"]["width_pt"], height=meta["page"]["height_pt"])
            model_id = row.get("modelo_id") or self.profile.config["default_model"]
            page.merge_page(base.pages[self.models[model_id]["page"] - 1])
            page.merge_page(layers.pages[i])
        name = self.profile.config["name"]
        writer.add_metadata({"/Title": f"Prévia {name}" if preview else f"Certificados {name}", "/Producer": "Gerador de Certificados"})
        result = io.BytesIO()
        writer.write(result)
        return result.getvalue()


def duplicate_key(row):
    return f'{normalized(clean(row["nome_aluno"]))}|{row["modelo_id"]}|{row["data"]}'


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
