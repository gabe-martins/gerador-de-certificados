import hashlib
import io
import json
import sqlite3
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from server.main import create_app
from server.profiles import DEFAULT_PROFILE, ROOT, env, load_profile
from tools.create_profile import create_profile


def payload(model="participacao"):
    return {"nome_aluno": "Ana da Conceição", "cidade": "Curitiba", "uf": "PR",
            "data": "2026-12-01", "modelo_id": model}


@pytest.fixture
def participation(tmp_path):
    return create_profile("curso-fotografia", "Curso de Fotografia", tmp_path / "profile")


def test_second_use_case_is_independent_and_restorable(tmp_path, participation):
    data = tmp_path / "course-data"
    with TestClient(create_app(data, profile=participation)) as course, TestClient(create_app(tmp_path / "default")) as default:
        profile = course.get("/api/perfil").json()
        assert profile["name"] == "Curso de Fotografia"
        assert profile["logo_url"] is None
        assert profile["labels"]["template"] == "Certificado"
        assert course.get("/api/perfil/logo").status_code == 404
        assert default.get("/api/perfil").json()["id"] == DEFAULT_PROFILE
        assert default.get("/api/perfil/logo").status_code == 404
        assert [m["id"] for m in course.get("/api/modelos").json()["models"]] == ["participacao"]
        assert len(default.get("/api/modelos").json()["models"]) == 1
        # Empty preview uses the profile's own default and placeholder.
        preview = course.post("/api/preview", json={})
        text = PdfReader(io.BytesIO(preview.content)).pages[0].extract_text()
        assert "NOME DO PARTICIPANTE" in text
        assert "CERTIFICADO DE PARTICIPAÇÃO" in text
        imported = course.post("/api/lotes/importar", files={"file": ("p.csv", b"nome;modelo\nAna;Participa\xe7\xe3o\n")}, data={"defaults": json.dumps(payload())})
        assert imported.json()["valid"] == 1
        assert imported.json()["items"][0]["row"]["modelo_id"] == "participacao"
        issued = course.post("/api/emissoes", json={"request_id": str(uuid4()), "rows": [payload()]}).json()
        original = course.get(issued["pdf_url"]).content
        text = PdfReader(io.BytesIO(original)).pages[0].extract_text()
        assert "Ana da Conceição" in text
        assert "Curitiba/PR, 01 de dezembro de 2026." in text
        assert "Brasil" not in text
        assert default.get("/api/emissoes").json()["total"] == 0
        assert course.get("/api/emissoes").json()["total"] == 1
        assert course.post("/api/lotes/validar", json={"rows": [payload("inexistente")]}).json()["valid"] == 0
        assert default.post("/api/lotes/validar", json={"rows": [payload("inexistente")]}).json()["valid"] == 0
        archive = ZipFile(io.BytesIO(course.get("/api/backup").content))
        manifest = json.loads(archive.read("manifesto.json"))
        assert manifest["profile"] == "curso-fotografia"
        assert manifest["database"] == "certificates.sqlite3"
        assert json.loads(archive.read("profiles/default.json"))["profile"] == "curso-fotografia"
        for name, digest in manifest["sha256"].items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest
        assert "profiles/curso-fotografia/profile.json" in archive.namelist()
        assert "profiles/participacao/profile.json" not in archive.namelist()

    # Restore exactly the layout exported by the application, and reopen it.
    restored = tmp_path / "restored"
    archive.extractall(restored)
    with TestClient(create_app(restored / "data", profile=restored / "profiles/curso-fotografia")) as app:
        assert app.get("/api/emissoes").json()["total"] == 1
        assert app.get(issued["pdf_url"]).content == original


def test_existing_database_and_pdf_survive_profile_binding(tmp_path):
    data = tmp_path / "legacy"
    data.mkdir()
    # Reproduce a pre-profile database by removing only the new binding table.
    with TestClient(create_app(data)) as app:
        issued = app.post("/api/emissoes", json={"request_id": str(uuid4()), "rows": [payload()]}).json()
        pdf = app.get(issued["pdf_url"]).content
        app.put("/api/configuracoes", json={"cidade": "Curitiba", "uf": "PR"})
    with sqlite3.connect(data / "certificates.sqlite3") as db:
        db.execute("DROP TABLE instance_profile")
    with TestClient(create_app(data)) as app:
        assert app.get("/api/emissoes").json()["total"] == 1
        assert app.get(issued["pdf_url"]).content == pdf
        assert app.get("/api/configuracoes").json() == {"cidade": "Curitiba", "uf": "PR"}


def test_profiles_cannot_reuse_another_profiles_data(tmp_path, participation):
    create_app(tmp_path / "legacy")
    with pytest.raises(ValueError, match="outro perfil"):
        create_app(tmp_path / "legacy", profile=participation)
    create_app(tmp_path / "shared", profile=participation)
    with pytest.raises(ValueError, match="outro perfil"):
        create_app(tmp_path / "shared")
    second = create_profile("outro-evento", "Outro Evento", tmp_path / "other-profile")
    with pytest.raises(ValueError, match="outro perfil"):
        create_app(tmp_path / "shared", profile=second)


def test_environment_selection_and_default_data_path(monkeypatch, tmp_path, participation):
    monkeypatch.setenv("CERTIFICATES_PROFILE", str(participation))
    monkeypatch.setenv("CERTIFICATES_DATA_DIR", str(tmp_path / "new"))
    assert env("DATA_DIR") == str(tmp_path / "new")
    app = create_app()
    assert app.state.profile.id == "curso-fotografia"
    assert app.state.data_dir == tmp_path / "new"
    monkeypatch.delenv("CERTIFICATES_DATA_DIR")
    assert env("DATA_DIR") is None
    assert load_profile().default_data_dir == ROOT / "data" / "curso-fotografia"


@pytest.mark.parametrize("mutation", ["model", "page", "format", "color", "schema", "dimensions", "fields", "dependencies"])
def test_invalid_profile_fails_before_opening_database(tmp_path, participation, mutation):
    config_path = participation / "profile.json"
    meta_path = participation / "assets/modelos.json"
    config = json.loads(config_path.read_text())
    meta = json.loads(meta_path.read_text())
    if mutation == "model":
        config["default_model"] = "inexistente"
    elif mutation == "page":
        meta["models"][0]["page"] = 99
    elif mutation == "format":
        meta["fields"][0]["format"] = "{nome_aluno.__class__}"
    elif mutation == "color":
        config["accent_color"] = "invalid"
    elif mutation == "schema":
        meta["schema"] = "unknown"
    elif mutation == "dimensions":
        meta["page"]["height_pt"] = 100
    elif mutation == "fields":
        meta["fields"] = []
    else:
        meta["fields"][0]["format"] = "{nome_aluno} em {data_por_extenso}"
    config_path.write_text(json.dumps(config))
    meta_path.write_text(json.dumps(meta))
    with pytest.raises(ValueError):
        create_app(tmp_path / "data", profile=participation)
    assert not (tmp_path / "data").exists()


def test_profile_scaffold_does_not_overwrite_existing_files(tmp_path, participation):
    before = (participation / "profile.json").read_bytes()
    with pytest.raises(FileExistsError):
        create_profile("outro-evento", "Outro Evento", participation)
    assert (participation / "profile.json").read_bytes() == before


def test_default_data_directories_are_configured_per_profile(participation):
    assert load_profile().default_data_dir == ROOT / "data" / "participacao"
    assert load_profile(participation).default_data_dir == ROOT / "data" / "curso-fotografia"


def test_custom_profile_variants_and_import_aliases(tmp_path, participation):
    config_path = participation / "profile.json"
    meta_path = participation / "assets/modelos.json"
    config = json.loads(config_path.read_text())
    meta = json.loads(meta_path.read_text())
    config["default_model"] = "base"
    config["imports"] = {"aliases": {"categoria": "modelo_id", "nivel": "degree"},
                         "label_prefixes": ["Certificado "], "model_aliases": {"básico": "base"}}
    meta["models"] = [
        {"id": "base", "label": "Certificado Base", "page": 1, "group": "nivel", "degree": 0},
        {"id": "avancado", "label": "Certificado Avançado", "page": 1, "group": "nivel", "degree": 1},
    ]
    config_path.write_text(json.dumps(config))
    meta_path.write_text(json.dumps(meta))
    with TestClient(create_app(tmp_path / "variant-data", profile=participation)) as app:
        content = "nome;categoria;nivel\nAna;Base;1\nJoão;básico;0\nLuís;Base;9\n"
        result = app.post("/api/lotes/importar", files={"file": ("variantes.csv", content.encode())},
                          data={"defaults": json.dumps(payload("base"))})
        assert result.status_code == 200
        items = result.json()["items"]
        assert items[0]["row"]["modelo_id"] == "avancado"
        assert items[1]["row"]["modelo_id"] == "base"
        assert "modelo_id" in items[2]["errors"]
        assert result.json()["valid"] == 2
