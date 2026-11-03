# syntax=docker/dockerfile:1.10
# The reference landing app's image (SM-14, ADR 0038): Next.js standalone output on a
# distroless, non-root Node 24 base. Build from the repository root:
#   docker build -f docker/landing/Dockerfile -t scholarly-mcp-landing .
# Run it behind a proxy that sets `x-forwarded-for` (compose `landing` profile).

ARG NODE_IMAGE=node:24.22.2-trixie-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm CI=true HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@scholarly-mcp/landing..." \
 && LANDING_STANDALONE=true pnpm turbo run build --filter "@scholarly-mcp/landing..."
# The standalone server holds only the files it traced; static assets are copied beside it.
# The cache directory is created for the app user, as compose mounts a tmpfs there.
RUN mkdir -p /out \
 && cp -a apps/landing/.next/standalone /out/app \
 && cp -a apps/landing/.next/static /out/app/apps/landing/.next/static \
 && mkdir -p /out/app/apps/landing/.next/cache

FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="scholarly-mcp-landing" \
      org.opencontainers.image.description="Reference landing page for scholarly-mcp links. Independent prototype, not affiliated with Thieme." \
      org.opencontainers.image.source="https://github.com/sami3ullah/scholarly_mcp" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out/app /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
USER nonroot
EXPOSE 3000
ENTRYPOINT ["/nodejs/bin/node", "/app/apps/landing/server.js"]
