import io
from uuid import uuid4
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pypdf import PdfReader

from desktop.backend import DesktopAccess
from server.main import create_app

TOKEN = "a" * 64


def test_desktop_rejects_other_clients_and_preserves_web_origin_checks(tmp_path):
    app = DesktopAccess(create_app(tmp_path, "pagels-jiu-jitsu"), TOKEN)
    with TestClient(app) as client:
        for url in ["/", "/api/health", "/api/backup", "/api/modelos/base.pdf"]:
            assert client.get(url).status_code == 403
            assert client.get(url, headers={"X-Pagels-Desktop": "incorrect"}).status_code == 403
        headers = {"X-Pagels-Desktop": TOKEN}
        assert client.get("/api/health", headers=headers).json()["models"] == 23
        assert client.put("/api/configuracoes", json={"cidade": "Florianópolis", "uf": "SC"},
                          headers=headers | {"Origin": "https://other.example"}).status_code == 403


def test_desktop_issues_with_original_brand_and_reopens_saved_pdf(tmp_path):
    headers = {"X-Pagels-Desktop": TOKEN}
    item = {"nome_aluno": "João da Silva", "cidade": "São José", "uf": "SC", "data": "2026-11-03", "modelo_id": "azul"}
    app = DesktopAccess(create_app(tmp_path, "pagels-jiu-jitsu"), TOKEN)
    with TestClient(app, headers=headers) as client:
        profile = client.get("/api/perfil").json()
        assert profile["name"] == "Pagels Jiu-Jitsu"
        assert profile["accent_color"] == "#c62828"
        assert client.get(profile["logo_url"]).status_code == 200
        assert client.get("/api/health").json()["models"] == 23
        result = client.post("/api/emissoes", json={"rows": [item], "request_id": str(uuid4())})
        assert result.status_code == 200
        url = result.json()["pdf_url"]
        original = client.get(url).content
        assert "João da Silva" in PdfReader(io.BytesIO(original)).pages[0].extract_text()
        with ZipFile(io.BytesIO(client.get("/api/backup").content)) as backup:
            assert "data/pagels.sqlite3" in backup.namelist()
            assert "profiles/pagels-jiu-jitsu/assets/logo.jpg" in backup.namelist()
    # Reopen with a new credential, mirroring a desktop restart.
    with TestClient(DesktopAccess(create_app(tmp_path, "pagels-jiu-jitsu"), "b" * 64),
                    headers={"X-Pagels-Desktop": "b" * 64}) as client:
        assert client.get("/api/emissoes").json()["total"] == 1
        assert client.get(url).content == original
