"""Load a certificate use case independently from the application and storage."""
import hashlib
import json
import math
import os
import re
from dataclasses import dataclass
from pathlib import Path
from string import Formatter
from zoneinfo import ZoneInfo

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SETTINGS = json.loads((ROOT / "profiles" / "default.json").read_text(encoding="utf-8"))
DEFAULT_PROFILE = DEFAULT_SETTINGS["profile"]
FONT_DIR = ROOT / "assets" / "fonts"
INPUT_KEYS = ("nome_aluno", "cidade", "uf", "data", "modelo_id")


def env(name, default=None):
    """Neutral settings take precedence over legacy deployment variables."""
    value = os.environ.get(f"CERTIFICATES_{name}")
    legacy_prefix = DEFAULT_SETTINGS.get("legacy_env_prefix")
    if value is None and legacy_prefix:
        value = os.environ.get(f"{legacy_prefix}_{name}")
    return default if value is None else value


@dataclass(frozen=True)
class Profile:
    directory: Path
    config: dict
    meta: dict
    version: str

    @property
    def id(self):
        return self.config["id"]

    @property
    def assets(self):
        return self.directory / "assets"

    @property
    def models(self):
        return {model["id"]: model for model in self.meta["models"]}

    @property
    def database_name(self):
        # Reuse the existing database without renaming or copying student data.
        return self.config.get("database_name", "certificates.sqlite3")

    @property
    def font_path(self):
        return FONT_DIR / self.config["font_file"]

    @property
    def default_data_dir(self):
        return ROOT / "data" / self.config.get("data_subdirectory", self.id)

    def public(self):
        return {key: self.config[key] for key in
                ("id", "name", "short_name", "tagline", "accent_color", "labels", "default_model", "timezone")} | {
            "logo_url": f"/api/perfil/logo?v={self.version}" if self.config.get("logo") else None,
            "paper": {key: self.meta["page"][key] for key in ("width_mm", "height_mm", "orientation")},
        }


def load_profile(profile=None):
    selected = str(profile or os.environ.get("CERTIFICATES_PROFILE") or DEFAULT_PROFILE)
    directory = Path(selected)
    if not directory.is_absolute():
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", selected):
            raise ValueError("Perfil deve ser um identificador ou um diretório absoluto.")
        directory = ROOT / "profiles" / selected
    config = json.loads((directory / "profile.json").read_text(encoding="utf-8"))
    if config.get("schema_version") != 1:
        raise ValueError("Versão de perfil não suportada.")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", config["id"]):
        raise ValueError("Identificador de perfil inválido.")
    for key in ("name", "short_name", "tagline", "default_model"):
        if not isinstance(config[key], str) or not config[key].strip():
            raise ValueError(f"Configuração de perfil inválida: {key}.")
    data_subdirectory = config.get("data_subdirectory", config["id"])
    if not isinstance(data_subdirectory, str) or (data_subdirectory and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", data_subdirectory)):
        raise ValueError("Subdiretório de dados inválido no perfil.")
    database_name = config.get("database_name", "certificates.sqlite3")
    if not re.fullmatch(r"[a-zA-Z0-9_-]+\.sqlite3", database_name):
        raise ValueError("Nome de banco inválido no perfil.")
    ZoneInfo(config["timezone"])
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", config["accent_color"]):
        raise ValueError("Cor do perfil deve estar no formato #RRGGBB.")
    for key in ("recipient", "template", "date", "selection"):
        if not isinstance(config["labels"][key], str) or not config["labels"][key].strip():
            raise ValueError(f"Rótulo de perfil inválido: {key}.")
    for name in (config["font_file"], config.get("logo", "logo.jpg")):
        if Path(name).name != name:
            raise ValueError("Arquivos do perfil devem usar nomes simples.")
    meta_path = directory / "assets" / "modelos.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta.get("schema") != "certificates.shared-pdf-templates/1.0":
        raise ValueError("Schema de modelos não suportado. Consulte docs/profiles.md para modelos antigos.")
    if meta["base_pdf"] != "modelos.pdf":
        raise ValueError("O PDF base deve se chamar modelos.pdf.")
    models = meta["models"]
    ids = [m["id"] for m in models]
    if not models or len(ids) != len(set(ids)) or config["default_model"] not in ids:
        raise ValueError("Modelos repetidos, vazios ou modelo padrão inexistente.")
    if any(not re.fullmatch(r"[a-zA-Z0-9_-]+", mid) for mid in ids):
        raise ValueError("Identificador de modelo inválido.")
    pdf_path = directory / "assets" / "modelos.pdf"
    pages = PdfReader(pdf_path).pages
    if any(not isinstance(m["page"], int) or not 1 <= m["page"] <= len(pages) for m in models):
        raise ValueError("Página de modelo inexistente.")
    for key in ("width_pt", "height_pt", "width_mm", "height_mm"):
        value = meta["page"][key]
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError("Dimensões de página inválidas.")
    if meta["page"]["orientation"] not in ("landscape", "portrait"):
        raise ValueError("Orientação de página inválida.")
    if any(abs(float(page.mediabox.width) - meta["page"]["width_pt"]) > 1 or
           abs(float(page.mediabox.height) - meta["page"]["height_pt"]) > 1 for page in pages):
        raise ValueError("As dimensões do PDF não correspondem à configuração do perfil.")
    fields = meta["fields"]
    if not fields or len({f["name"] for f in fields}) != len(fields):
        raise ValueError("Campos variáveis vazios ou repetidos.")
    if not any(f["name"] == "nome_aluno" and f["input_keys"] == ["nome_aluno"] for f in fields):
        raise ValueError("Configure um campo nome_aluno para o destinatário.")
    if not any(f["name"] == "local_data" and set(f["input_keys"]) == {"cidade", "uf", "data"} for f in fields):
        raise ValueError("Configure um campo local_data com cidade, UF e data.")
    for field in meta["fields"]:
        if not 0 < field["min_font_size_pt"] <= field["font_size_pt"] or field["box_mm"]["width"] <= 0:
            raise ValueError("Área ou tamanho da fonte inválido.")
        for _, key, spec, conversion in Formatter().parse(field["format"]):
            if key is not None and (key not in (*INPUT_KEYS, "data_por_extenso") or spec or conversion):
                raise ValueError("Formato contém um campo não suportado.")
            required_key = "data" if key == "data_por_extenso" else key
            if required_key and required_key not in field["input_keys"]:
                raise ValueError("Declare em input_keys todos os dados usados pelo formato.")
        if not set(field["input_keys"]) <= set(INPUT_KEYS) or not field["placeholder"]:
            raise ValueError("Entradas ou placeholder do campo inválidos.")
    paths = [directory / "profile.json", meta_path, pdf_path, FONT_DIR / config["font_file"]]
    if config.get("logo"):
        paths.append(directory / "assets" / config["logo"])
    version = hashlib.sha256(b"".join(path.read_bytes() for path in paths)).hexdigest()
    return Profile(directory, config, meta, version)
