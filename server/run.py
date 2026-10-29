import os
import socket
import fcntl
from pathlib import Path
import uvicorn

if __name__ == "__main__":
    data = Path(os.environ.get("PAGELS_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
    data.mkdir(parents=True, exist_ok=True)
    pid_file = data / "servidor.pid"
    # Keep the lock for the whole process, including shutdown.
    pid_handle = pid_file.open("a+")
    try:
        fcntl.flock(pid_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("A aplicação já está em execução. Abra o endereço no navegador.")
    pid_handle.seek(0)
    pid_handle.truncate()
    pid_handle.write(str(os.getpid()))
    pid_handle.flush()
    host = os.environ.get("PAGELS_HOST", "0.0.0.0")
    port = int(os.environ.get("PAGELS_PORT", "8090"))
    print(f"\nPagels Certificados\nNeste computador: http://localhost:{port}", flush=True)
    try:
        ips = sorted({i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET) if not i[4][0].startswith("127.")})
        for ip in ips:
            print(f"Na mesma rede: http://{ip}:{port}", flush=True)
    except OSError:
        pass
    print("Mantenha este terminal aberto. Para parar: Ctrl+C.\n", flush=True)
    try:
        uvicorn.run("server.main:app", host=host, port=port, workers=1)
    finally:
        pid_handle.seek(0)
        pid_handle.truncate()
        pid_handle.close()
