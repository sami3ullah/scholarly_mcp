#!/usr/bin/env bash
# Load test: starts the server image on an index, times the cold start to ready,
# runs docker/e2e/load.mjs (20 tool calls a second for 60 s by default) and reports
# resident memory before and after. The per-client rate limit is lifted for the run, as
# every call comes from this one client.
#   docker/e2e/load.sh <dir with index.sqlite> [image]
# LOAD_RATE and LOAD_SECONDS change the rate and the duration; LOAD_CPUS limits the server's
# CPUs (e.g. 2, the plan's target container; unset means no limit). SQLITE_SEARCH_WORKERS is
# passed on when set.
set -euo pipefail

dir=${1:?usage: docker/e2e/load.sh <dir with index.sqlite> [image]}
image=${2:-${SCHOLARLY_IMAGE:-scholarly-mcp:local}}
port=${LOAD_PORT:-18081}
cd "$(dirname "$0")/../.."
dir=$(cd "$dir" && pwd)
name=scholarly-load-$$

trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
started=$(node -e 'process.stdout.write(String(Date.now()))')
docker run -d --name "$name" --read-only --tmpfs /tmp \
  ${LOAD_CPUS:+--cpus "$LOAD_CPUS"} \
  ${SQLITE_SEARCH_WORKERS:+-e "SQLITE_SEARCH_WORKERS=$SQLITE_SEARCH_WORKERS"} \
  --env-file presets/thieme.env \
  -e HTTP_ALLOWED_HOSTS=localhost,127.0.0.1 \
  -e RATE_LIMIT_PER_MINUTE=100000 -e RATE_LIMIT_BURST=1000 \
  -e LOG_LEVEL=warn \
  -v "$dir:/data" \
  -p "127.0.0.1:$port:8080" \
  "$image" >/dev/null
until curl -sf "http://127.0.0.1:$port/readyz" >/dev/null; do
  if [ "$(docker inspect -f '{{.State.Running}}' "$name")" != true ]; then
    docker logs "$name" >&2
    exit 1
  fi
  sleep 0.1
done
ready=$(node -e 'process.stdout.write(String(Date.now()))')
echo "Cold start to ready: $((ready - started)) ms"
echo "Memory when ready: $(docker stats --no-stream --format '{{.MemUsage}}' "$name")"

LOAD_MCP_URL=http://127.0.0.1:$port node docker/e2e/load.mjs
echo "Memory after the run: $(docker stats --no-stream --format '{{.MemUsage}}' "$name")"
