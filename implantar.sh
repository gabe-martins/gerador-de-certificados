#!/usr/bin/env bash
# Run on the Docker server, inside this project's folder.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v docker >/dev/null || { printf 'Docker não está instalado.\n' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null
if [[ ! -f .env ]]; then
  umask 077
  printf 'PAGELS_BIND_IP=192.168.15.9\nPAGELS_PORT=8090\nPAGELS_UID=%s\nPAGELS_GID=%s\nPAGELS_IMAGE_TAG=1.1.0\n' "$(id -u)" "$(id -g)" > .env
fi
mkdir -p data
docker compose config --quiet
# Build before replacing the running container. Existing files under data/ are preserved.
docker compose build --pull certificados
docker compose up -d --wait --wait-timeout 120 certificados
docker compose ps certificados
printf '\nPagels disponível na porta configurada (padrão http://192.168.15.9:8090).\n'
