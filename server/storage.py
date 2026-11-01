"""SQLite persistence and ownership binding for a single installed profile."""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .pdf_engine import normalized


class CertificateStore:
    def __init__(self, data_dir, profile):
        self.data = Path(data_dir)
        self.database_name = profile.database_name
        if any(path.name != self.database_name for path in self.data.glob("*.sqlite3")):
            raise ValueError("Este diretório contém dados de outro perfil. Configure CERTIFICATES_DATA_DIR separado.")
        self.data.mkdir(parents=True, exist_ok=True)
        (self.data / "pdfs").mkdir(exist_ok=True)
        with self.connect() as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS instance_profile (id INTEGER PRIMARY KEY CHECK(id=1), profile_id TEXT NOT NULL)")
            previous_profile = conn.execute("SELECT profile_id FROM instance_profile WHERE id=1").fetchone()
            if previous_profile and previous_profile[0] != profile.id:
                raise ValueError("O diretório de dados pertence a outro perfil. Configure CERTIFICATES_DATA_DIR separado.")
            conn.execute("INSERT OR IGNORE INTO instance_profile VALUES(1, ?)", (profile.id,))
            conn.executescript("""
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL,
                created_at TEXT NOT NULL, template_version TEXT NOT NULL, count INTEGER NOT NULL);
              CREATE TABLE IF NOT EXISTS certificates (
                job_id TEXT NOT NULL REFERENCES jobs(id), position INTEGER NOT NULL,
                nome_aluno TEXT NOT NULL, cidade TEXT NOT NULL, uf TEXT NOT NULL,
                data TEXT NOT NULL, modelo_id TEXT NOT NULL, duplicate_key TEXT NOT NULL,
                PRIMARY KEY(job_id, position));
              CREATE INDEX IF NOT EXISTS cert_duplicate ON certificates(duplicate_key);
              CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), cidade TEXT NOT NULL, uf TEXT NOT NULL);
              INSERT OR IGNORE INTO settings VALUES(1, '', '');
            """)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.data / self.database_name, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.create_function("normalize_name", 1, normalized, deterministic=True)
        try:
            with conn:
                yield conn
        finally:
            conn.close()
