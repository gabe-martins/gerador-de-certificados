"""Run with the packaged Windows python.exe, on Windows or under Wine.

Uses the shipped Python, .pyd modules, libraries, source, assets and frontend.
All generated certificates live in a disposable directory.
"""
import hashlib
import io
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

APP = Path(sys.argv[1]).resolve() / "resources/backend/app"
REPORT = Path(sys.argv[2]).resolve()
sys.path.insert(0, str(APP))

from pypdf import PdfReader
from server.profiles import load_profile
from server.pdf_engine import CertificateEngine


def start_backend(data, token):
    child = subprocess.Popen([sys.executable, "-u", str(APP / "desktop/backend.py")],
        cwd=APP, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8")
    child.pagels_log = []
    threading.Thread(target=lambda: child.pagels_log.extend(child.stderr), daemon=True).start()
    child.stdin.write(json.dumps({"data_dir": str(data), "token": token}) + "\n")
    child.stdin.flush()
    messages = queue.Queue()
    threading.Thread(target=lambda: messages.put(child.stdout.readline()), daemon=True).start()
    try:
        message = json.loads(messages.get(timeout=45))
        assert message["event"] == "ready"
        return child, f"http://127.0.0.1:{message['port']}"
    except Exception:
        child.kill()
        print("".join(child.pagels_log), file=sys.stderr)
        raise


def request(origin, path, token=None, payload=None, method=None, body=None, content_type=None):
    headers = {"X-Pagels-Desktop": token} if token else {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if content_type:
        headers["Content-Type"] = content_type
    # The app uses local HTTP only. Avoid host proxies and an unrelated HTTPS
    # certificate-store initialization when this check runs in a Wine prefix.
    opener = urllib.request.OpenerDirector()
    for handler in [urllib.request.HTTPHandler(), urllib.request.HTTPDefaultErrorHandler(), urllib.request.HTTPErrorProcessor()]:
        opener.add_handler(handler)
    with opener.open(urllib.request.Request(origin + path, body, headers, method=method), timeout=30) as response:
        return response.read()


def stop(child):
    child.stdin.close()
    try:
        assert child.wait(timeout=20) == 0, "".join(child.pagels_log)
    finally:
        if child.poll() is None:
            child.kill()


def main():
    assert sys.platform == "win32", "Use o Python Windows do pacote."
    engine = CertificateEngine(load_profile("pagels-jiu-jitsu"))
    assert len(engine.models) == 23
    rows = [{"nome_aluno": f"Aluno {index:02d} João Gonçalves", "cidade": "São José", "uf": "SC",
             "data": "2026-11-03", "modelo_id": model} for index, model in enumerate(engine.models)]
    with tempfile.TemporaryDirectory(prefix="Pagels portátil ") as directory:
        data = Path(directory) / "data"
        token = "a" * 64
        child, origin = start_backend(data, token)
        try:
            try:
                request(origin, "/api/backup")
                raise AssertionError("API desktop acessível sem credencial.")
            except urllib.error.HTTPError as error:
                assert error.code == 403
            health = json.loads(request(origin, "/api/health", token))
            assert health["models"] == 23 and health["profile"] == "pagels-jiu-jitsu"
            assert b"/assets/" in request(origin, "/", token)
            preview = request(origin, "/api/preview", token, rows[0])
            assert rows[0]["nome_aluno"] in PdfReader(io.BytesIO(preview)).pages[0].extract_text()
            issued = json.loads(request(origin, "/api/emissoes", token,
                {"request_id": str(uuid4()), "rows": rows}))
            original = request(origin, issued["pdf_url"], token)
            pages = PdfReader(io.BytesIO(original)).pages
            assert len(pages) == 23
            for index, page in enumerate(pages):
                text = page.extract_text()
                assert rows[index]["nome_aluno"] in text
                assert all(row["nome_aluno"] not in text for row in rows if row != rows[index])
            request(origin, "/api/configuracoes", token, {"cidade": "Florianópolis", "uf": "SC"}, method="PUT")
            with ZipFile(io.BytesIO(request(origin, issued["zip_url"], token))) as archive:
                assert len(archive.namelist()) == 23
            with ZipFile(io.BytesIO(request(origin, "/api/backup", token))) as archive:
                manifest = json.loads(archive.read("manifesto.json"))
                assert manifest["profile"] == "pagels-jiu-jitsu"
                for name, expected in manifest["sha256"].items():
                    assert hashlib.sha256(archive.read(name)).hexdigest() == expected
        finally:
            stop(child)
        child, origin = start_backend(data, "b" * 64)
        try:
            assert json.loads(request(origin, "/api/emissoes", "b" * 64))["total"] == 23
            assert request(origin, issued["pdf_url"], "b" * 64) == original
            assert json.loads(request(origin, "/api/configuracoes", "b" * 64))["cidade"] == "Florianópolis"
        finally:
            stop(child)
    result = {"status": "passed", "python": sys.version, "platform": sys.platform,
              "models": 23, "environment": "Windows binaries; Wine when executed from Linux",
              "checks": ["Windows native modules", "timezone data", "private HTTP server", "production frontend",
                         "PDF preview", "23 original models", "page isolation", "individual ZIP", "backup hashes",
                         "preferences", "parent EOF shutdown", "restart persistence"]}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
