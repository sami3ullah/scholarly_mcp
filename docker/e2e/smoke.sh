#!/usr/bin/env bash
# End-to-end smoke test: builds both images with the demo index baked in, starts the
# compose stack (server on SQLite or Postgres, landing app behind its proxy) and runs
# docker/e2e/smoke.mjs, which calls every tool over HTTP with no credentials. Tears the stack down
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

step "Smoke checks"
SMOKE_MCP_URL=http://127.0.0.1:$HTTP_PORT \
  SMOKE_LANDING_URL=http://127.0.0.1:$LANDING_PORT \
  node docker/e2e/smoke.mjs

step "Usage export on the read-only image"
# The tool calls above are metered; the exporter appends them to METER_JSONL_PATH within a
# few seconds, unless the path cannot be written.
exported=0
for _ in $(seq 1 30); do
  if "${compose[@]}" exec -T "$server" /nodejs/bin/node -e \
    "process.exit(require('node:fs').statSync(process.env.METER_JSONL_PATH, { throwIfNoEntry: false })?.size > 0 ? 0 : 1)"; then
    exported=1
    break
  fi
  sleep 1
done
if [ "$exported" != 1 ]; then
  echo "no usage events reached METER_JSONL_PATH within 30 s" >&2
  exit 1
fi

step "Done"
