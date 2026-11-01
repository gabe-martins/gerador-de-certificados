import hashlib
import io
import json
import os
import sqlite3
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4
from zipfile import ZipFile, ZIP_DEFLATED
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import FileResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pypdf import PdfReader
from .pdf_engine import CertificateEngine, UFS, single_page, filename, duplicate_key, clean, normalized
from .profiles import ROOT, FONT_DIR, DEFAULT_SETTINGS, load_profile, env
from .imports import parse_import, template_xlsx, MAX_ROWS
from .storage import CertificateStore

APP_VERSION = "1.2.0"


class Rows(BaseModel):
    rows: list[dict] = Field(min_length=1, max_length=MAX_ROWS)


class Issue(Rows):
    request_id: UUID
    allow_duplicates: bool = False


def create_app(data_dir=None, profile=None):
    profile = load_profile(profile)
    engine = CertificateEngine(profile)
    ASSETS, MODELS, VERSION = profile.assets, engine.models, profile.version
    validate, generate = engine.validate, engine.generate
    data = Path(data_dir or env("DATA_DIR", profile.default_data_dir))
    database_name = profile.database_name
    store = CertificateStore(data, profile)
    db = store.connect
    lock = threading.RLock()
    app = FastAPI(title=f"Gerador de Certificados · {profile.config['name']}", version=APP_VERSION, docs_url=None, redoc_url=None)
    app.state.data_dir = data
    app.state.profile = profile
    app.state.engine = engine

    @app.middleware("http")
    async def same_origin(request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.headers.get("origin"):
            origin = urlsplit(request.headers["origin"])
            if origin.netloc != request.headers.get("host") or origin.scheme not in ("http", "https"):
                return JSONResponse({"detail": "Esta operação deve ser feita pela própria aplicação."}, status_code=403)
        result = await call_next(request)
        result.headers["X-Content-Type-Options"] = "nosniff"
        result.headers["Referrer-Policy"] = "same-origin"
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/modelos/base.pdf"):
            result.headers["Cache-Control"] = "no-store"
        return result

    def check_rows(rows, conn):
        results, seen = [], set()
        for index, raw in enumerate(rows):
            row, errors, sizes = validate(raw)
            warnings = []
            if not errors:
                key = duplicate_key(row)
                if key in seen:
                    warnings.append("Este nome, modelo e data aparecem mais de uma vez neste lote.")
                if conn.execute("SELECT 1 FROM certificates WHERE duplicate_key=? LIMIT 1", (key,)).fetchone():
                    warnings.append("Já existe uma emissão para este nome, modelo e data no histórico.")
                seen.add(key)
            results.append({"index": index, "row": row, "errors": errors, "warnings": warnings, "font_sizes": sizes})
        return {"items": results, "valid": sum(not i["errors"] for i in results), "total": len(results), "warnings": sum(bool(i["warnings"]) for i in results)}

    def job_or_404(job_id, conn):
        job = conn.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if job is None:
            raise HTTPException(404, "Emissão não encontrada.")
        return dict(job)

    def job_result(job):
        return {k: job[k] for k in ("id", "created_at", "count", "template_version")} | {"pdf_url": f'/api/emissoes/{job["id"]}/pdf', "zip_url": f'/api/emissoes/{job["id"]}/zip'}

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": APP_VERSION, "profile": profile.id, "models": len(MODELS), "today": datetime.now(ZoneInfo(profile.config["timezone"])).date().isoformat()}

    @app.get("/api/perfil")
    def active_profile():
        return profile.public()

    @app.get("/api/perfil/logo")
    def profile_logo():
        if not profile.config.get("logo"):
            raise HTTPException(404, "Este perfil não tem logotipo.")
        return FileResponse(ASSETS / profile.config["logo"])

    @app.get("/api/modelos")
    def models():
        return {"models": list(MODELS.values()), "version": VERSION, "ufs": UFS, "max_batch": MAX_ROWS}

    @app.get("/api/modelos/base.pdf")
    def base_pdf():
        return FileResponse(ASSETS / "modelos.pdf", media_type="application/pdf", headers={"Cache-Control": "public, max-age=3600", "ETag": f'"{VERSION}"'})

    @app.post("/api/preview")
    def preview(raw: dict):
        # Blank fields are placeholders; supplied fields still receive final validation.
        row = {k: clean(raw.get(k)) for k in ("nome_aluno", "cidade", "uf", "data", "modelo_id")}
        filled = row | {"nome_aluno": row["nome_aluno"] or next(f["placeholder"] for f in profile.meta["fields"] if "nome_aluno" in f["input_keys"]), "cidade": row["cidade"] or "CIDADE", "uf": row["uf"] or "SP", "data": row["data"] or "2026-01-01", "modelo_id": row["modelo_id"] or profile.config["default_model"]}
        checked, errors, _ = validate(filled)
        if errors:
            raise HTTPException(422, {"errors": errors})
        row["uf"] = checked["uf"] if row["uf"] else ""
        return Response(generate([row], preview=True), media_type="application/pdf")

    @app.post("/api/lotes/validar")
    def check(body: Rows):
        with db() as conn:
            return check_rows(body.rows, conn)

    @app.post("/api/lotes/importar")
    async def import_file(file: UploadFile = File(...), defaults: str = Form("{}")):
        content = await file.read(5_000_001)
        await file.close()
        if len(content) > 5_000_000:
            raise HTTPException(413, "O arquivo deve ter até 5 MB.")
        try:
            default_values = json.loads(defaults)
            if not isinstance(default_values, dict):
                raise ValueError("Dados do evento inválidos.")
            rows = parse_import(content, file.filename or "", default_values, profile)
            if not rows:
                raise ValueError("Inclua pelo menos um participante na planilha.")
        except (ValueError, TypeError, UnicodeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        with db() as conn:
            return check_rows(rows, conn)

    @app.get("/api/lotes/modelo.xlsx")
    def xlsx():
        return Response(template_xlsx(profile), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="modelo_{profile.id}.xlsx"'})

    @app.get("/api/lotes/modelo.csv")
    def csv():
        return Response("\ufeffnome_aluno;cidade;uf;data;modelo_id\r\n".encode(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="modelo_{profile.id}.csv"'})

    @app.post("/api/emissoes")
    def issue(body: Issue):
        with lock, db() as conn:
            validation = check_rows(body.rows, conn)
            if validation["valid"] != validation["total"]:
                raise HTTPException(422, validation)
            rows = [i["row"] for i in validation["items"]]
            payload_hash = hashlib.sha256(json.dumps(rows, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
            # Check retries before duplicate warnings: a retry must return the same issuance.
            conn.execute("BEGIN IMMEDIATE")
            previous = conn.execute("SELECT * FROM jobs WHERE request_id=?", (str(body.request_id),)).fetchone()
            if previous:
                if previous["payload_hash"] != payload_hash:
                    raise HTTPException(409, "O identificador desta operação já foi usado com outros dados. Tente novamente.")
                return job_result(dict(previous))
            if validation["warnings"] and not body.allow_duplicates:
                raise HTTPException(409, {"code": "duplicates", "validation": validation})
            job_id = str(uuid4())
            job = {"id": job_id, "request_id": str(body.request_id), "payload_hash": payload_hash,
                "created_at": datetime.now(ZoneInfo(profile.config["timezone"])).isoformat(), "template_version": VERSION, "count": len(rows)}
            content = generate(rows)
            path = data / "pdfs" / f"{job_id}.pdf"
            partial = path.with_suffix(".partial")
            try:
                with partial.open("wb") as handle:
                    handle.write(content)
                    handle.flush()
                    os.fsync(handle.fileno())
                partial.replace(path)
                conn.execute("INSERT INTO jobs VALUES(:id,:request_id,:payload_hash,:created_at,:template_version,:count)", job)
                for i, row in enumerate(rows):
                    conn.execute("INSERT INTO certificates VALUES(?,?,?,?,?,?,?,?)", (job_id, i, row["nome_aluno"], row["cidade"], row["uf"], row["data"], row["modelo_id"], duplicate_key(row)))
                conn.commit()
            except Exception:
                conn.rollback()
                path.unlink(missing_ok=True)
                partial.unlink(missing_ok=True)
                raise
            return job_result(job)

    @app.get("/api/emissoes")
    def history(q: str = "", modelo_id: str = "", data_inicio: str = "", data_fim: str = "", page: int = 1):
        page = max(1, page)
        conditions, params = [], []
        if q:
            conditions.append("normalize_name(c.nome_aluno) LIKE ?")
            params.append(f"%{normalized(q[:200])}%")
        for column, op, value in (("modelo_id", "=", modelo_id), ("data", ">=", data_inicio), ("data", "<=", data_fim)):
            if value:
                conditions.append(f"c.{column} {op} ?")
                params.append(value)
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        with db() as conn:
            count = conn.execute("SELECT count(*) FROM certificates c" + where, params).fetchone()[0]
            items = conn.execute("SELECT c.*, j.created_at, j.count as job_count FROM certificates c JOIN jobs j ON j.id=c.job_id" + where + " ORDER BY j.created_at DESC, c.position ASC LIMIT 50 OFFSET ?", params + [(page-1)*50]).fetchall()
            return {"items": [dict(i) for i in items], "total": count, "page": page, "page_size": 50}

    @app.get("/api/emissoes/{job_id}/pdf")
    def pdf(job_id: str, inline: bool = False):
        with db() as conn:
            job_or_404(job_id, conn)
        return FileResponse(data / "pdfs" / f"{job_id}.pdf", media_type="application/pdf", filename=f"certificados_{profile.id}_{job_id[:8]}.pdf", content_disposition_type="inline" if inline else "attachment")

    @app.get("/api/emissoes/{job_id}/certificados/{position}/pdf")
    def individual_pdf(job_id: str, position: int, inline: bool = False):
        with db() as conn:
            job_or_404(job_id, conn)
            row = conn.execute("SELECT * FROM certificates WHERE job_id=? AND position=?", (job_id, position)).fetchone()
        if row is None:
            raise HTTPException(404, "Certificado não encontrado.")
        content = single_page((data / "pdfs" / f"{job_id}.pdf").read_bytes(), position)
        disposition = "inline" if inline else "attachment"
        return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'{disposition}; filename="{filename(dict(row), position)}"'})

    @app.get("/api/emissoes/{job_id}/zip")
    def zip_pdfs(job_id: str):
        with db() as conn:
            job_or_404(job_id, conn)
            rows = conn.execute("SELECT * FROM certificates WHERE job_id=? ORDER BY position", (job_id,)).fetchall()
        content = PdfReader(data / "pdfs" / f"{job_id}.pdf")
        output = io.BytesIO()
        with ZipFile(output, "w", ZIP_DEFLATED) as z:
            for i, row in enumerate(rows):
                z.writestr(filename(dict(row), i), single_page(content, i))
        return Response(output.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="certificados_{profile.id}.zip"'})

    @app.get("/api/configuracoes")
    def settings():
        with db() as conn:
            row = dict(conn.execute("SELECT cidade,uf FROM settings WHERE id=1").fetchone())
        return row

    @app.put("/api/configuracoes")
    def save_settings(body: dict):
        cidade, uf = clean(body.get("cidade")), clean(body.get("uf")).upper()
        if len(cidade) > 100 or (uf and uf not in UFS) or bool(cidade) != bool(uf):
            raise HTTPException(422, "Informe cidade e UF válidas, ou deixe ambos vazios.")
        with db() as conn:
            conn.execute("UPDATE settings SET cidade=?,uf=? WHERE id=1", (cidade, uf))
        return {"cidade": cidade, "uf": uf}

    @app.get("/api/backup")
    def backup():
        with lock, tempfile.TemporaryDirectory() as temp:
            snapshot = Path(temp) / database_name
            with db() as source, sqlite3.connect(snapshot) as target:
                source.backup(target)
            with sqlite3.connect(snapshot) as conn:
                ids = [r[0] for r in conn.execute("SELECT id FROM jobs")]
            output = io.BytesIO()
            manifest = {}
            with ZipFile(output, "w", ZIP_DEFLATED) as z:
                files = [(snapshot, f"data/{database_name}")] + [(data / "pdfs" / f"{i}.pdf", f"data/pdfs/{i}.pdf") for i in ids]
                files += [(p, f"profiles/{profile.id}/assets/" + p.name) for p in ASSETS.iterdir() if p.is_file()]
                files += [(profile.directory / "profile.json", f"profiles/{profile.id}/profile.json")]
                files += [(p, "assets/fonts/" + p.name) for p in FONT_DIR.iterdir() if p.is_file()]
                for path, name in files:
                    content = path.read_bytes()
                    z.writestr(name, content)
                    manifest[name] = hashlib.sha256(content).hexdigest()
                defaults = DEFAULT_SETTINGS if DEFAULT_SETTINGS["profile"] == profile.id else {"profile": profile.id}
                default_content = json.dumps(defaults, indent=2).encode()
                z.writestr("profiles/default.json", default_content)
                manifest["profiles/default.json"] = hashlib.sha256(default_content).hexdigest()
                z.writestr("manifesto.json", json.dumps({"version": 2, "profile": profile.id, "database": database_name, "template_version": VERSION, "sha256": manifest}, indent=2))
                z.writestr("RESTAURAR.txt", "Pare a aplicação. Guarde a pasta data atual. Restaure data/ no diretório de dados do perfil; restaure profiles/ e assets/ na raiz do projeto. Selecione o perfil indicado em manifesto.json antes de iniciar. Consulte docs/profiles.md.\n")
            return Response(output.getvalue(), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="backup_{profile.id}_{datetime.now().strftime("%Y-%m-%d_%H-%M-%S")}.zip"'})

    dist = ROOT / "frontend" / "dist"
    if dist.exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="frontend-assets")

        @app.get("/")
        def index():
            return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
    return app
