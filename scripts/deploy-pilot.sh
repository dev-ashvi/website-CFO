#!/usr/bin/env bash
# Deploy / refresh WYZ analytics pilot stack. Never deletes volumes or work_dir.
set -euo pipefail

APP_DIR="${WYZ_APP_DIR:-/opt/wyz}"
COMPOSE_DIR="${WYZ_COMPOSE_DIR:-$APP_DIR/services/analytics}"
ENV_FILE="${WYZ_ENV_FILE:-$APP_DIR/.env.pilot}"
DATA_DIR="${WYZ_HOST_WORK_DIR:-/data/wyz-analytics-work}"

cd "$COMPOSE_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE (create from .env.pilot.example, chmod 600)" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# Export for compose substitution without printing secrets
source "$ENV_FILE"
set +a

if [[ -z "${WYZ_PILOT_API_TOKEN:-}" || ${#WYZ_PILOT_API_TOKEN} -lt 16 ]]; then
  echo "WYZ_PILOT_API_TOKEN missing/short in $ENV_FILE" >&2
  exit 1
fi
if [[ -z "${WYZ_PILOT_DOMAIN:-}" ]]; then
  echo "WYZ_PILOT_DOMAIN is required for Caddy TLS" >&2
  exit 1
fi
if [[ -z "${WYZ_ALLOWED_ORIGINS:-}" ]]; then
  echo "WYZ_ALLOWED_ORIGINS is required" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"
export WYZ_HOST_WORK_DIR="$DATA_DIR"
export WYZ_FRONTEND_DIST="${WYZ_FRONTEND_DIST:-$APP_DIR/frontend-dist}"
export WYZ_RELEASE_SHA="${WYZ_RELEASE_SHA:-$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"

echo "==> Deploying release=$WYZ_RELEASE_SHA domain=$WYZ_PILOT_DOMAIN"
docker compose \
  -f docker-compose.yml \
  -f docker-compose.pilot.yml \
  --env-file "$ENV_FILE" \
  up -d --build

echo "==> Waiting for analytics ready (internal)"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.yml -f docker-compose.pilot.yml --env-file "$ENV_FILE" \
    exec -T analytics-api \
    python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8788/api/v1/analytics/ready', timeout=2)" \
    >/dev/null 2>&1; then
    echo "ready ok"
    break
  fi
  sleep 2
  if [[ "$i" -eq 60 ]]; then
    echo "Timed out waiting for /ready" >&2
    docker compose -f docker-compose.yml -f docker-compose.pilot.yml --env-file "$ENV_FILE" ps
    exit 1
  fi
done

echo "==> Public health (via Caddy if DNS/TLS ready)"
curl -fsS "https://${WYZ_PILOT_DOMAIN}/api/v1/analytics/health" || \
  curl -fsS "http://127.0.0.1/api/v1/analytics/health" || \
  echo "(public health not reachable yet — check DNS/TLS)"

echo "==> Deploy complete. release=$WYZ_RELEASE_SHA"
echo "Rollback: git checkout <sha> && WYZ_RELEASE_SHA=<sha> $0"
echo "Never run: docker compose down -v"
