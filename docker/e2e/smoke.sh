#!/usr/bin/env bash
# End-to-end smoke test (SM-14): builds both images with the demo index baked in, starts the
# compose stack (server on SQLite or Postgres, landing app behind its proxy), makes an API
# key and runs docker/e2e/smoke.mjs, which calls every tool over HTTP. Tears the stack down
# afterwards, unless SMOKE_KEEP=1.
#   docker/e2e/smoke.sh [sqlite|postgres]
# SMOKE_INDEX_DIR names a directory holding a demo index.sqlite to reuse; without it the
# demo index is built first (docker/demo-index/build.sh, a few minutes, needs the internet).
set -euo pipefail

store=${1:-sqlite}
case "$store" in
  sqlite) server=server ;;
  postgres) server='server-pg' ;;
  *) echo "usage: docker/e2e/smoke.sh [sqlite|postgres]" >&2; exit 2 ;;
esac
cd "$(dirname "$0")/../.."

# Its own project and ports, so it neither touches nor clashes with a local stack.
export COMPOSE_PROJECT_NAME=scholarly-smoke-$store
export HTTP_PORT=${SMOKE_HTTP_PORT:-18080}
export LANDING_PORT=${SMOKE_LANDING_PORT:-13000}
export LANDING_BASE_URL=http://localhost:$LANDING_PORT
export PG_PORT=${SMOKE_PG_PORT:-15432}
compose=(docker compose --profile "$store" --profile landing)

started=$(date +%s)
step() { printf '\n== %s (%ss)\n' "$1" "$(($(date +%s) - started))"; }

finish() {
  local status=$?
  if [ "$status" != 0 ]; then "${compose[@]}" logs --no-color --tail 80 >&2 || true; fi
  if [ "${SMOKE_KEEP:-0}" != 1 ]; then "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; fi
  exit "$status"
}
trap finish EXIT

if [ -z "${SMOKE_INDEX_DIR:-}" ]; then
  step "Server image without an index, to build the demo index with"
  docker build -q -f docker/server/Dockerfile -t scholarly-mcp:local . >/dev/null
  SMOKE_INDEX_DIR=$(mktemp -d)
  step "Demo index into $SMOKE_INDEX_DIR"
  docker/demo-index/build.sh "$SMOKE_INDEX_DIR"
fi
export INDEX_DIR=$SMOKE_INDEX_DIR

step "Images with the demo index"
"${compose[@]}" build --quiet

if [ "$store" = postgres ]; then
  step "Postgres, migrated, with the demo index copied in"
  "${compose[@]}" up -d --wait postgres
  "${compose[@]}" run --rm migrate
  "${compose[@]}" run --rm migrate ingest copy --from /data/index.sqlite
fi

step "Stack up ($store, landing)"
"${compose[@]}" up -d --wait

step "API key"
key_env=()
if [ "$store" = postgres ]; then
  # Keys are written by the writer role (docker/README.md).
  key_env=(-e "DATABASE_URL=postgres://scholarly_ingest:${PG_INGEST_PASSWORD:-ingest-local}@postgres:5432/scholarly")
fi
key=$("${compose[@]}" run --rm --no-deps ${key_env[@]+"${key_env[@]}"} "$server" keys create --label smoke | tail -n 1)
case "$key" in smk_*) ;; *) echo "keys create printed no key" >&2; exit 1 ;; esac

step "Smoke checks"
SMOKE_MCP_URL=http://127.0.0.1:$HTTP_PORT \
  SMOKE_LANDING_URL=http://127.0.0.1:$LANDING_PORT \
  SMOKE_KEY=$key \
  node docker/e2e/smoke.mjs

step "Done"
