FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PAGELS_DATA_DIR=/data \
    TZ=America/Sao_Paulo
WORKDIR /app
COPY requirements.lock ./requirements.lock
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir --only-binary=:all: -r requirements.lock \
    && groupadd --gid 10001 pagels \
    && useradd --uid 10001 --gid 10001 --no-create-home pagels \
    && mkdir -p /data \
    && chown 10001:10001 /data
COPY --chown=10001:10001 server/ ./server/
COPY --chown=10001:10001 assets/ ./assets/
COPY --from=frontend --chown=10001:10001 /build/dist/ ./frontend/dist/
USER 10001:10001
EXPOSE 8090
CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8090", "--workers", "1"]
