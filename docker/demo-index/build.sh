#!/usr/bin/env bash
# Builds the demo index (ADR 0039) into <out-dir>/index.sqlite with the scholarly-mcp image:
# only the DOIs in presets/thieme.demo-dois.txt, fetched from Crossref and Europe PMC, with
# full text only under CC BY 4.0. Then checks that every licence in the index is CC BY 4.0,
# so the index may be baked into a published image.
#   docker/demo-index/build.sh <out-dir> [image]     (image default: $SCHOLARLY_IMAGE or scholarly-mcp:local)
set -euo pipefail

out=${1:?usage: docker/demo-index/build.sh <out-dir> [image]}
image=${2:-${SCHOLARLY_IMAGE:-scholarly-mcp:local}}
cc_by=https://creativecommons.org/licenses/by/4.0/
cd "$(dirname "$0")/../.."

# The image writes as uid 65532.
mkdir -p "$out" && chmod 0777 "$out"
out=$(cd "$out" && pwd)
mailto=()
if [ -n "${CROSSREF_MAILTO:-}" ]; then mailto=(-e "CROSSREF_MAILTO=$CROSSREF_MAILTO"); fi

docker run --rm --read-only --tmpfs /tmp \
  --env-file presets/thieme.env \
  -e INGEST_DOIS_FILE=/app/presets/thieme.demo-dois.txt \
  -e "FULLTEXT_LICENSE_ALLOWLIST=$cc_by" \
  ${mailto[@]+"${mailto[@]}"} \
  -v "$out:/data" \
  "$image" ingest full

index="$out/index.sqlite"
not_cc_by=$(sqlite3 "$index" "
  select (select count(*) from articles a
          where json_array_length(a.record, '\$.licenses') = 0
             or exists (select 1 from json_each(a.record, '\$.licenses') l
                        where l.value ->> 'url' <> '$cc_by'))
       + (select count(*) from chunks
          where license_url is not null and license_url <> '$cc_by')")
if [ "$not_cc_by" != 0 ]; then
  echo "The demo index holds $not_cc_by articles or chunks not under CC BY 4.0; do not publish it." >&2
  exit 1
fi
sqlite3 "$index" "select 'Demo index: ' || (select count(*) from articles) || ' articles, '
  || (select count(*) from chunks) || ' chunks, all CC BY 4.0'"
