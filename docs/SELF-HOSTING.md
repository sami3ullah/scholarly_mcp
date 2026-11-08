# Self-hosting

[← Docs index](README.md) · [Main README](../README.md)

Run scholarly-mcp on your own server with Docker Compose: the MCP server, the landing page behind every card link, and TLS, on one hostname. SQLite needs nothing else; Postgres can be bundled or your own. The same steps work on any Linux VM, on AWS and behind Cloudflare. Why it is built this way: [ADR 0045](adr/0045-self-hosting-bundle.md).

```
                     https://mcp.example.org
 AI clients ──/mcp──►┌───────┐──► server ──► SQLite volumes, or Postgres
 readers ─────/*────►│ Caddy │──► landing app ──(internal: landing API)──► server
                     └───────┘
```

## What you need

- A Linux host with Docker Engine and the Compose plugin (Docker 24+, Compose 2.24+). `x86-64` with AVX, or `arm64`.
- 2 vCPUs and 4 GiB of memory for SQLite with the full Thieme index (about 1.3 GB on disk) at 20 tool calls a second; 2 GiB is enough for the demo index. On Postgres, the same for the server host, and 2 to 4 vCPUs for the database ([capacity](OPERATIONS.md#capacity)).
- A hostname you control, here `mcp.example.org`, with its DNS record pointing at the host; ports 80 and 443 open to the internet (or Cloudflare Tunnel, [below](#cloudflare)).
- Outbound HTTPS to `api.crossref.org` and `www.ebi.ac.uk` (Europe PMC) for index builds.

## 1. Install

```bash
# Debian or Ubuntu; other systems: https://docs.docker.com/engine/install/
curl -fsSL https://get.docker.com | sudo sh

sudo git clone https://github.com/sami3ullah/scholarly_mcp.git /opt/scholarly-mcp
cd /opt/scholarly-mcp/deploy
sudo cp .env.example .env && sudo chmod 600 .env
```

Edit `.env`: set `PUBLIC_HOST`, `CROSSREF_MAILTO` and `ACME_EMAIL`, and pick a store (step 2). Then make the secret the landing app and the server share:

```bash
sudo sh -c 'openssl rand -hex 32 > secrets/landing_api_secret'
sudo chown 65532:65532 secrets/landing_api_secret && sudo chmod 400 secrets/landing_api_secret
```

The commands below assume you are in `/opt/scholarly-mcp/deploy` and allowed to run `docker` (or prefix `sudo`).

## 2. Pick a store

| Store                  | Choose it when                                                               | In `.env`                                       |
| ---------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| **SQLite** (default)   | One server is enough (20 calls a second on 2 vCPUs)                          | `STORE=sqlite`                                  |
| **Postgres, bundled**  | You want Postgres but have none                                              | block B of `.env.example`                       |
| **Postgres, your own** | You run Postgres already (RDS, Cloud SQL, Azure, a cluster) or want replicas | block C of `.env.example`, plus the roles below |

### Your own Postgres

It needs Postgres 14+ with pgvector 0.8+ and pg_trgm (on Amazon RDS and Aurora, Azure and Cloud SQL both are available extensions). Connect as a superuser (on RDS, the master user) once and run, with two long random passwords:

```sql
CREATE ROLE scholarly_ingest LOGIN PASSWORD '…';
CREATE ROLE scholarly_server LOGIN PASSWORD '…';
CREATE DATABASE scholarly OWNER scholarly_ingest;
REVOKE ALL ON DATABASE scholarly FROM PUBLIC;
GRANT CONNECT ON DATABASE scholarly TO scholarly_server;
\connect scholarly
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

On RDS, `GRANT scholarly_ingest TO <master user>;` first if the `CREATE DATABASE … OWNER` is refused. Then set in `.env`:

```bash
STORE=postgres
DATABASE_URL=postgres://scholarly_server:…@db.internal:5432/scholarly?sslmode=require
ADMIN_DATABASE_URL=postgres://scholarly_ingest:…@db.internal:5432/scholarly?sslmode=require
```

The server connects as `scholarly_server`, which can read the index but not change it; index builds and the funnel report use `scholarly_ingest` ([roles](guides/postgres.md#roles)). Leave room for three copies of the index (live, previous, the build): about 4 GB for the Thieme corpus. Set `maintenance_work_mem` to 512 MB or more (an RDS parameter group) so full builds make their vector index in memory.

## 3. Start

On Postgres, load the demo index the image carries first (SQLite does this by itself):

```bash
docker compose run --rm admin ingest copy --from /data/index.sqlite     # Postgres only
```

Then:

```bash
docker compose up -d --wait
docker compose ps
curl -fsS https://mcp.example.org/readyz                                 # 200: up, with an index open
```

`--wait` returns when the server is ready, Caddy has its certificate in a few seconds after that. `init` runs `ingest migrate` on every `up` and exits; that is expected.

The MCP endpoint is public: anyone who knows the URL can connect, with no key ([ADR 0048](adr/0048-public-server-without-auth.md)). Each client address may make `RATE_LIMIT_PER_MINUTE` tool calls a minute (default 60, bursts of `RATE_LIMIT_BURST`, default 20); raise both in `.env` when many readers share one address, such as a hospital network. The bundle sets `HTTP_TRUSTED_PROXIES` to the private ranges, as only Caddy reaches the server, so the limit applies to the reader's address that Caddy passes on. Addresses are never stored or logged.

Usage (searches, cards shown, landing visits, click-through) as JSON; add `--since 2026-11-01` for a period:

```bash
docker compose run --rm admin funnel --store --out /tmp/funnel.html --json /dev/stdout
```

The [funnel guide](guides/funnel-and-card-view.md) explains the numbers and the live view. For billing, a webhook sends every usage event to your system (`METER_WEBHOOK_URL`, `METER_WEBHOOK_SECRET`; [metering](guides/operating-the-server.md#usage-metering)). How readers connect Claude and ChatGPT: [CONNECTORS.md](CONNECTORS.md).

## 4. The full index

The image carries about 200 open access articles so a new install answers at once. Build the whole corpus of your preset (the Thieme preset: DOI prefix 10.1055 from 2024, about 71,000 articles):

```bash
docker compose run -d --name scholarly-full-build admin ingest full
docker logs -f scholarly-full-build      # a few hours, mostly embedding; Ctrl-C stops following, not the build
docker rm scholarly-full-build           # when it has exited
```

It builds next to the live index, verifies it, and swaps it in only when it passes; the server picks it up within 30 seconds, without a restart. On Postgres you can instead copy a SQLite index built elsewhere, which fetches nothing: put it on the host and run `docker compose run --rm -v /path/to/index.sqlite:/import/index.sqlite:ro admin ingest copy --from /import/index.sqlite`.

### Keep it fresh

Schedule an incremental run; it becomes a full run once a week so embargoed licences open ([ingestion guide](guides/ingestion.md#keeping-it-fresh)):

```bash
sudo tee /etc/cron.d/scholarly-mcp >/dev/null <<'EOF'
17 * * * * root cd /opt/scholarly-mcp/deploy && flock -n /run/scholarly-ingest.lock docker compose run --rm admin ingest incremental >> /var/log/scholarly-ingest.log 2>&1
EOF
```

A failed run leaves the live index as it was and exits non-zero; alert on it ([what to watch](OPERATIONS.md#watch)).

## Upgrade

Read the release notes, then set the new `SCHOLARLY_VERSION` in `.env` and:

```bash
git -C /opt/scholarly-mcp pull
docker compose pull && docker compose up -d --wait
```

Migrations almost always only add, so rolling back is setting the previous version and `up` again. The exception is the migration that removes API keys ([ADR 0048](adr/0048-public-server-without-auth.md)), which drops their table and columns: rolling back past it needs the backup below. Back up the runtime data before an upgrade: on SQLite `docker compose run --rm --entrypoint /nodejs/bin/node admin -e "new (require('node:sqlite').DatabaseSync)('/var/lib/scholarly/runtime.sqlite').exec(\"VACUUM INTO '/data/runtime-backup.sqlite'\")"` writes a copy onto the index volume (on the host under `/var/lib/docker/volumes/scholarly_index/_data/`, to copy off the machine); on Postgres, the database's own backups. The index can always be rebuilt ([backups](OPERATIONS.md#back-up)).

## Where to run it

### A plain VM (Hetzner, OVH, IONOS, DigitalOcean, on-premises)

Exactly the steps above. Open ports 80 and 443 (`ufw allow 80,443/tcp`), point the DNS record at the VM, done. Caddy renews the certificate itself; keep the `caddy-data` volume.

### AWS

**EC2 (simplest).** An `m7g.large` (arm64, 2 vCPUs, 8 GiB) or `m7i.large`, Ubuntu 24.04, 30 GB gp3. Security group: 80 and 443 from anywhere, 22 from your network only. An Elastic IP, and a Route 53 (or other) A record for `PUBLIC_HOST`. Then the steps above. For SQLite take EBS snapshots of the volume (Data Lifecycle Manager).

**With RDS Postgres.** Create an RDS for PostgreSQL 16+ instance (`db.t4g.medium` is enough for a pilot, `db.m7g.large` for 20 calls a second) in the same VPC, reachable only from the EC2 security group. Run the role SQL from step 2, use block C in `.env` with `sslmode=require`. RDS backups then cover usage and landing sessions.

**Several replicas (ECS or EKS).** Run the image without this bundle: one service with `serve` behind an Application Load Balancer (HTTPS with an ACM certificate, health check `/readyz` on 8080), `STORE=postgres` on RDS, secrets from Secrets Manager as files (`DATABASE_URL_FILE`, `LANDING_API_SECRET_FILE`), and `ingest incremental` as a scheduled task. Settings are in [OPERATIONS.md](OPERATIONS.md#deploy); the ALB must route `/mcp` to the server and the rest to the landing image, and its subnets go in the landing proxy's trusted ranges and in the server's `HTTP_TRUSTED_PROXIES` (so rate limits apply per reader, not to the load balancer), or put Caddy behind it as below.

### Cloudflare

Cloudflare cannot run this as Workers or Pages: the server holds an embedding model in memory (about 600 MiB) and the index on disk. Run it on any VM (also one without a public IP) and let a Cloudflare Tunnel carry the traffic, so no port is opened:

1. In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel, copy its token, and add a public hostname `mcp.example.org` with the service `http://caddy:8080`.
2. In `.env`:

   ```bash
   COMPOSE_PROFILES=cloudflare          # with the bundled database: postgres,cloudflare
   CLOUDFLARE_TUNNEL_TOKEN=eyJ…
   SITE_ADDRESS=:8080                   # Cloudflare ends TLS; Caddy serves plain HTTP inside
   TRUSTED_PROXIES=private_ranges       # believe the reader address cloudflared passes on
   BIND_ADDRESS=127.0.0.1               # nothing published beyond the host
   ```

3. `docker compose up -d --wait`.

In Cloudflare, leave caching off for `/mcp` (the default for its responses) and keep WAF rules from challenging it: AI clients cannot solve a browser challenge. Behind any other proxy or load balancer that ends TLS, the last three settings are the same, with its address ranges in `TRUSTED_PROXIES`. The server's `HTTP_TRUSTED_PROXIES` stays as the bundle sets it, as Caddy still passes the reader address on. Rate limits apply per client address; for limits across many addresses, use Cloudflare's own rate limiting rules in front.

## Check it

The repository's end-to-end check runs every tool through the public hostname, as an AI client would, and opens a card link. It runs inside the image, so the host needs nothing else:

```bash
docker compose run --rm --entrypoint /nodejs/bin/node \
  -v "$PWD/../docker/e2e/smoke.mjs:/check/smoke.mjs:ro" \
  -e SMOKE_MCP_URL=https://mcp.example.org -e SMOKE_LANDING_URL=https://mcp.example.org \
  admin /check/smoke.mjs
```

It prints one `ok` line per check and ends with `12 checks passed`. Then add the server to Claude ([CONNECTORS.md](CONNECTORS.md)) and ask _"Find recent articles on cold snare polypectomy"_; each title links to a landing page on `https://mcp.example.org/mcp/landing`. For uptime monitoring, probe `https://mcp.example.org/readyz` (200 when an index is open).

## Troubleshooting

| Symptom                                                    | Cause and fix                                                                                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `required variable PUBLIC_HOST is missing`                 | `.env` is missing or not in the directory you run `docker compose` from                                                                    |
| Browser shows a certificate error for a minute, then works | Caddy was still getting the certificate; `docker compose logs caddy` shows why if it keeps failing (DNS not pointing here, port 80 closed) |
| `up --wait` fails, `server` unhealthy                      | `docker compose logs server`. On Postgres usually no index yet: run the `ingest copy` of step 3                                            |
| `init` exits 1: `permission denied to create extension`    | Create `vector` and `pg_trgm` as a superuser (step 2)                                                                                      |
| `landing` exits: cannot read `landing_api_secret`          | The secret file must be readable by uid 65532 (`chown 65532:65532`, step 1)                                                                |
| `421` from `/mcp`                                          | The client used a hostname other than `PUBLIC_HOST`                                                                                        |
| A landing page says the link has expired                   | Landing sessions last 24 hours; the page still shows the article. Searching again gives fresh links                                        |

More in [OPERATIONS.md](OPERATIONS.md#troubleshooting) and the [Postgres guide](guides/postgres.md#troubleshooting).
