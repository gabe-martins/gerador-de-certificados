#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
"${CERTIFICATES_PYTHON:-python3}" -m venv .venv
.venv/bin/python -m pip install -r requirements.lock
printf '\nInstalação concluída. Inicie com: bash iniciar.sh\n'
