# syntax=docker/dockerfile:1.10
# The scholarly-mcp image (SM-14): the MCP server and the ingest CLI on a distroless,
# non-root Node 24 base. Build from the repository root:
#   docker build -f docker/server/Dockerfile -t scholarly-mcp .
# Bake an index in by passing a directory holding index.sqlite as the `index` context:
#   docker build -f docker/server/Dockerfile --build-context index=<dir> -t scholarly-mcp .

ARG NODE_IMAGE=node:24.22.2-trixie-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot

FROM ${NODE_IMAGE} AS build
ARG TARGETARCH
ENV PNPM_HOME=/pnpm CI=true HUSKY=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile \
      --filter "@scholarly-mcp/server..." --filter "@scholarly-mcp/ingest..." \
 && pnpm turbo run build --filter "@scholarly-mcp/server..." --filter "@scholarly-mcp/ingest..."
# Production dependencies only (without the root's husky `prepare`, a dev tool), then the
# files the apps need at run time.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    rm -rf node_modules packages/*/node_modules apps/*/node_modules \
 && npm pkg delete scripts.prepare \
 && pnpm install --offline --frozen-lockfile --prod \
      --filter "@scholarly-mcp/server..." --filter "@scholarly-mcp/ingest..."
RUN sh docker/server/prune.sh "$TARGETARCH"
ENV EMBEDDER_CACHE_DIR=/out/models
RUN cp docker/server/fetch-model.mjs apps/server/ && node apps/server/fetch-model.mjs
RUN mkdir -p /out/app \
 && cp -a node_modules package.json /out/app/ \
 && for dir in packages/* apps/server apps/ingest; do \
      [ -d "$dir/dist" ] || continue; \
      mkdir -p "/out/app/$dir" && cp -a "$dir/package.json" "$dir/dist" "/out/app/$dir/"; \
      [ -d "$dir/node_modules" ] && cp -a "$dir/node_modules" "/out/app/$dir/"; \
      for extra in vendor styles; do [ -d "$dir/$extra" ] && cp -a "$dir/$extra" "/out/app/$dir/"; done; \
    done; true \
 && cp -a docker/server/scholarly-mcp.mjs presets /out/app/ \
 && mkdir -p /out/data /out/state

# The index baked into the image: whatever `--build-context index=<dir>` holds, normally
# just index.sqlite. Without it, none; mount one at /data or run `ingest full`.
FROM scratch AS index
COPY docker/server/no-index/ /

FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="scholarly-mcp" \
      org.opencontainers.image.description="MCP server for scholarly article discovery. Independent prototype, not affiliated with Thieme." \
      org.opencontainers.image.source="https://github.com/sami3ullah/scholarly_mcp" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/app /app
COPY --from=build /out/models /models
COPY --from=build --chown=nonroot:nonroot /out/state /var/lib/scholarly
# The ingest writes builds next to the index, so /data belongs to the app user too.
COPY --from=build --chown=nonroot:nonroot /out/data /data
COPY --from=index --chown=nonroot:nonroot / /data/
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    HTTP_HOST=0.0.0.0 \
    HTTP_PORT=8080 \
    METRICS_HOST=0.0.0.0 \
    METRICS_PORT=9464 \
    EMBEDDER_CACHE_DIR=/models \
    EMBEDDER_ALLOW_REMOTE=false \
    INDEX_PATH=/data/index.sqlite \
    RUNTIME_DB_PATH=/var/lib/scholarly/runtime.sqlite
USER nonroot
EXPOSE 8080 9464
# The runtime database is the only thing the server writes; mount a volume there.
VOLUME ["/var/lib/scholarly"]
ENTRYPOINT ["/nodejs/bin/node", "/app/scholarly-mcp.mjs"]
CMD ["serve"]
