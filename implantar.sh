#!/usr/bin/env bash
# Run on the Docker server, inside this project's folder.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v docker >/dev/null || { printf 'Docker não está instalado.\n' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null
if [[ ! -f .env ]]; then
  umask 077
  sed -e "s/^CERTIFICATES_UID=.*/CERTIFICATES_UID=$(id -u)/" \
      -e "s/^CERTIFICATES_GID=.*/CERTIFICATES_GID=$(id -g)/" .env.example > .env
fi
# Compose resolves the configured data mount, including custom instance directories.
data_path=$(docker compose config --environment | sed -n 's/^CERTIFICATES_DATA_PATH=//p')
data_path=${data_path:-./data}
mkdir -p -- "$data_path"
docker compose config --quiet
# Build before replacing the running container. Existing files under data/ are preserved.
docker compose build --pull certificados
docker compose up -d --wait --wait-timeout 120 certificados
docker compose ps certificados
printf '\nGerador de Certificados disponível no endereço configurado em .env.\n'
