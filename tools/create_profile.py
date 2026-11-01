"""Create an independent starter profile: python -m tools.create_profile ..."""
import argparse
import json
import re
from pathlib import Path

from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]


def create_profile(identifier, name, destination=None):
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", identifier):
        raise ValueError("Use um identificador como curso-fotografia.")
    if not name.strip():
        raise ValueError("Informe o nome da organização ou evento.")
    directory = Path(destination) if destination else ROOT / "profiles" / identifier
    directory.mkdir(parents=True, exist_ok=False)
    assets = directory / "assets"
    assets.mkdir()
    config = {
        "schema_version": 1, "id": identifier, "name": name,
        "short_name": name, "tagline": "Reconhecendo cada conquista.",
        "accent_color": "#245c8a", "timezone": "America/Sao_Paulo",
        "font_file": "LiberationSans-Bold.ttf", "default_model": "participacao",
        "labels": {"recipient": "Nome do participante", "template": "Certificado",
                   "date": "Data do evento", "selection": "Tipo de certificado"},
        "imports": {"aliases": {}, "label_prefixes": [], "model_aliases": {}},
    }
    width, height = landscape(A4)
    meta = {
        "schema": "certificates.shared-pdf-templates/1.0", "base_pdf": "modelos.pdf",
        "page": {"width_pt": width, "height_pt": height,
                 "width_mm": 297, "height_mm": 210, "orientation": "landscape"},
        "models": [{"id": "participacao", "label": "Participação", "page": 1}],
        "fields": [
            {"name": "nome_aluno", "input_keys": ["nome_aluno"], "format": "{nome_aluno}",
             "placeholder": "NOME DO PARTICIPANTE", "box_mm": {"width": 265},
             "font_size_pt": 30, "min_font_size_pt": 22, "reference_baseline_pdf_pt": 305},
            {"name": "local_data", "input_keys": ["cidade", "uf", "data"],
             "format": "{cidade}/{uf}, {data_por_extenso}.", "placeholder": "CIDADE/UF, DATA.",
             "box_mm": {"width": 265}, "font_size_pt": 18,
             "min_font_size_pt": 14, "reference_baseline_pdf_pt": 190},
        ],
    }
    for path, value in ((directory / "profile.json", config), (assets / "modelos.json", meta)):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # Neutral starter artwork; no Pagels logo, text or belt designs are copied.
    canvas = Canvas(str(assets / "modelos.pdf"), pagesize=(width, height))
    canvas.setStrokeColorRGB(.14, .36, .54)
    canvas.setLineWidth(2)
    canvas.rect(28, 28, width - 56, height - 56)
    canvas.setFont("Helvetica-Bold", 27)
    canvas.drawCentredString(width / 2, 450, "CERTIFICADO DE PARTICIPAÇÃO")
    canvas.setFont("Helvetica", 15)
    canvas.drawCentredString(width / 2, 370, "Certificamos a participação de")
    canvas.drawCentredString(width / 2, 250, "nas atividades deste evento.")
    canvas.save()
    return directory


def main():
    parser = argparse.ArgumentParser(description="Cria um perfil independente de certificados de participação.")
    parser.add_argument("id", help="Identificador, por exemplo curso-fotografia")
    parser.add_argument("--name", required=True, help="Nome da organização ou evento")
    args = parser.parse_args()
    try:
        directory = create_profile(args.id, args.name)
    except (ValueError, FileExistsError) as exc:
        parser.exit(1, f"Não foi possível criar o perfil: {exc}\n")
    print(f"Perfil criado em {directory}\nInicie com CERTIFICATES_PROFILE={args.id} bash iniciar.sh")


if __name__ == "__main__":
    main()
