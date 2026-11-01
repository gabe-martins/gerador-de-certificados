import os
import signal
from pathlib import Path
from .profiles import load_profile, env

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    data = Path(env("DATA_DIR", load_profile().default_data_dir))
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
