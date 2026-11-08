#!/usr/bin/env bash
# The self-hosting bundle end to end (ADR 0045): deploy/compose.yaml with the images
# smoke.sh built (demo index baked in), PUBLIC_HOST=localhost so Caddy uses its local CA, then
# docker/e2e/smoke.mjs over HTTPS through Caddy, as a reader's client would call it.
#   docker/e2e/deploy-smoke.sh [sqlite|postgres]
# Run docker/e2e/smoke.sh first, or set SCHOLARLY_IMAGE and LANDING_IMAGE to images with an
# index. postgres uses the bundled database (COMPOSE_PROFILES=postgres) and copies the index in.
set -euo pipefail

store=${1:-sqlite}
case "$store" in
  sqlite | postgres) ;;
  *) echo "usage: docker/e2e/deploy-smoke.sh [sqlite|postgres]" >&2; exit 2 ;;
esac
cd "$(dirname "$0")/../../deploy"

work=$(mktemp -d)
# Settings as the process environment, which compose prefers over a .env file; no .env here.
export COMPOSE_PROJECT_NAME=scholarly-deploy-smoke-$store
export SCHOLARLY_IMAGE=${SCHOLARLY_IMAGE:-scholarly-mcp:local}
export LANDING_IMAGE=${LANDING_IMAGE:-scholarly-mcp-landing:local}
export PUBLIC_HOST=localhost ACME_EMAIL=ops@example.org BIND_ADDRESS=127.0.0.1
export PUBLIC_HTTP_PORT=${SMOKE_PUBLIC_HTTP_PORT:-18081} PUBLIC_HTTPS_PORT=${SMOKE_PUBLIC_HTTPS_PORT:-18443}
export STORE=$store LANDING_API_SECRET_PATH=$work/landing_api_secret
if [ "$store" = postgres ]; then
  password=$(openssl rand -hex 16)
  export COMPOSE_PROFILES=postgres
  export PG_SUPERUSER_PASSWORD=$password PG_INGEST_PASSWORD=$password PG_SERVER_PASSWORD=$password
  export DATABASE_URL=postgres://scholarly_server:$password@postgres:5432/scholarly
  export ADMIN_DATABASE_URL=postgres://scholarly_ingest:$password@postgres:5432/scholarly
fi
openssl rand -hex 32 >"$LANDING_API_SECRET_PATH"
chmod 644 "$LANDING_API_SECRET_PATH" # read by uid 65532 in the containers

started=$(date +%s)
step() { printf '\n== %s (%ss)\n' "$1" "$(($(date +%s) - started))"; }

finish() {
  local status=$?
  if [ "$status" != 0 ]; then docker compose logs --no-color --tail 80 >&2 || true; fi
  if [ "${SMOKE_KEEP:-0}" != 1 ]; then docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true; fi
  rm -rf "$work"
  exit "$status"
}
trap finish EXIT

if [ "$store" = postgres ]; then
  step "Demo index copied into the bundled Postgres"
  docker compose run --rm admin ingest copy --from /data/index.sqlite >/dev/null
fi

step "Stack up ($store)"
docker compose up -d --wait

step "Smoke checks over HTTPS through Caddy"
# Caddy's local CA signs the localhost certificate; this check trusts it for the run only.
NODE_TLS_REJECT_UNAUTHORIZED=0 \
  SMOKE_MCP_URL=https://localhost:$PUBLIC_HTTPS_PORT \
  SMOKE_LANDING_URL=https://localhost:$PUBLIC_HTTPS_PORT \
  node --no-warnings ../docker/e2e/smoke.mjs

step "Plain HTTP redirects to HTTPS"
status=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PUBLIC_HTTP_PORT/mcp")
[ "$status" = 308 ] || { echo "HTTP answered $status, not 308" >&2; exit 1; }

step "Done"
