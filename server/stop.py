import os
import signal
from pathlib import Path

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    data = Path(os.environ.get("PAGELS_DATA_DIR", root / "data"))
    try:
        pid = int((data / "servidor.pid").read_text().strip())
        process = Path(f"/proc/{pid}")
        command = (process / "cmdline").read_bytes().split(b"\0")
        if pid <= 1 or b"server.run" not in command or (process / "cwd").resolve() != root:
            raise ValueError()
        os.kill(pid, signal.SIGTERM)
        print("Encerramento solicitado. As emissões concluídas permanecem salvas.")
    except (OSError, ValueError):
        raise SystemExit("Nenhuma instância desta aplicação foi encontrada em execução.")
