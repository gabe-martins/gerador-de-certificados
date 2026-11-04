"""Private desktop entry point, independent of the Unix web launcher.

Configuration arrives through stdin. EOF requests a graceful shutdown, including
when the desktop process crashes. No desktop credentials are written to disk.
"""
import asyncio
import hmac
import json
import socket
import sys
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import uvicorn
from server.main import create_app


class DesktopAccess:
    def __init__(self, app, token):
        self.app = app
        self.token = token.encode("ascii")

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope.get("headers", []))
            supplied = headers.get(b"x-pagels-desktop", b"")
            if not hmac.compare_digest(supplied, self.token):
                body = b'{"detail":"Abra pelo aplicativo Pagels Certificados."}'
                await send({"type": "http.response.start", "status": 403,
                            "headers": [(b"content-type", b"application/json"),
                                        (b"cache-control", b"no-store")]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


def main():
    config = json.loads(sys.stdin.readline())
    if len(config.get("token", "")) < 32:
        raise ValueError("Credencial local inválida.")
    data = Path(config["data_dir"]).resolve()
    app = DesktopAccess(create_app(data, "pagels-jiu-jitsu"), config["token"])
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    # Binding to port zero avoids conflicts with existing web installations.
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]

    class DesktopServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets=sockets)
            if self.started:
                print(json.dumps({"event": "ready", "port": port}), flush=True)

    server = DesktopServer(uvicorn.Config(app, host="127.0.0.1", port=port,
                           access_log=False, log_level="warning",
                           timeout_graceful_shutdown=15))

    def watch_parent():
        # The first line was consumed above. EOF or a shutdown message stops it.
        sys.stdin.readline()
        server.should_exit = True

    threading.Thread(target=watch_parent, daemon=True).start()
    try:
        asyncio.run(server.serve(sockets=[listener]))
    finally:
        listener.close()


if __name__ == "__main__":
    main()
