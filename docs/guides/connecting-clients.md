# Connecting clients

[← Back to the docs index](../README.md)

How to run the MCP server and connect Claude Desktop, MCP Inspector or any other MCP client. You need a built index first ([ingestion guide](ingestion.md)) and the embedding model in the local cache (the first `ingest` run downloads it to `.cache/models`).

## Build

```bash
source ~/.nvm/nvm.sh && nvm use
pnpm install
pnpm build
```

## Configuration

The server reads environment variables, validated at boot ([server README](../../apps/server/README.md#configuration)). The minimum is `LANDING_BASE_URL`. The Thieme preset (`presets/thieme.env`) sets it to the reference landing app, `http://localhost:3000`, and sets `PUBLISHER_NAME=Thieme`.

| Variable               | Default               | Meaning                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MCP_TRANSPORT`        | `stdio`               | `stdio` for a local client, `http` for Streamable HTTP                                                     |
| `HTTP_HOST`            | `127.0.0.1`           | Beyond loopback needs `AUTH_MODE` and `HTTP_ALLOWED_HOSTS` ([operating guide](operating-the-server.md))    |
| `HTTP_PORT`            | `8080`                | HTTP port; the endpoint is `/mcp`                                                                          |
| `INDEX_PATH`           | `data/index.sqlite`   | The index the ingest builds; reopened when a new build lands                                               |
| `RUNTIME_DB_PATH`      | `data/runtime.sqlite` | Landing sessions, API keys and the usage outbox; created when missing                                      |
| `AUTH_MODE`            | `none`                | `none`, `api-key` or `oauth` for HTTP ([operating guide](operating-the-server.md))                         |
| `EMBEDDER_CACHE_DIR`   | the library default   | Where the model is cached, e.g. `.cache/models`                                                            |
| `LANDING_BASE_URL`     | required              | Where card links point                                                                                     |
| `PUBLISHER_NAME`       | `the publisher`       | Named in descriptions and the notice                                                                       |
| `JOURNAL_URL_TEMPLATE` | unset                 | Journal page link with `{issn}`; no journal links without it                                               |
| `HTTP_ALONGSIDE_STDIO` | `false`               | On stdio, also serve the landing API on `HTTP_PORT`, so card links open ([landing guide](landing-page.md)) |

## Claude Desktop (stdio)

Add the server to `claude_desktop_config.json` (on macOS in `~/Library/Application Support/Claude/`), with absolute paths. Call `node` directly, not `pnpm`, because anything a wrapper prints to stdout breaks the stdio protocol.

```json
{
  "mcpServers": {
    "scholarly-mcp": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/scholarly-mcp/apps/server/dist/main.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "INDEX_PATH": "/absolute/path/to/scholarly-mcp/data/index.sqlite",
        "RUNTIME_DB_PATH": "/absolute/path/to/scholarly-mcp/data/runtime.sqlite",
        "EMBEDDER_CACHE_DIR": "/absolute/path/to/scholarly-mcp/.cache/models",
        "EMBEDDER_ALLOW_REMOTE": "false",
        "LANDING_BASE_URL": "http://localhost:3000",
        "HTTP_ALONGSIDE_STDIO": "true",
        "PUBLISHER_NAME": "Thieme"
      }
    }
  }
}
```

`which node` after `nvm use` gives the Node 24 path. `HTTP_ALONGSIDE_STDIO` lets the landing app at `localhost:3000` call the server's landing API on port 8080, so the card links open a page; start the app as the [landing guide](landing-page.md#run-it-locally) shows. Restart Claude Desktop, then ask for example "Find recent Thieme articles on anticoagulation for atrial fibrillation in older patients". Logs go to Claude Desktop's MCP log for the server (stderr).

## MCP Inspector

Inspector starts the server without your shell's environment, so put the settings in an env file:

```bash
cat > .env.server <<EOF
MCP_TRANSPORT=stdio
LANDING_BASE_URL=http://localhost:3000
PUBLISHER_NAME=Thieme
EMBEDDER_CACHE_DIR=$PWD/.cache/models
EMBEDDER_ALLOW_REMOTE=false
INDEX_PATH=$PWD/data/index.sqlite
RUNTIME_DB_PATH=$PWD/data/runtime.sqlite
LOG_LEVEL=warn
EOF

# Web UI
npx @modelcontextprotocol/inspector node --env-file=.env.server apps/server/dist/main.js

# Or the CLI: list the tools, then run one search
npx @modelcontextprotocol/inspector --cli node --env-file=.env.server apps/server/dist/main.js --method tools/list
npx @modelcontextprotocol/inspector --cli node --env-file=.env.server apps/server/dist/main.js \
  --method tools/call --tool-name search_articles --tool-arg query="Sepsis Intensivstation" --tool-arg limit=2
```

Over Streamable HTTP, start the server, then point Inspector at `http://127.0.0.1:8080/mcp` with the "Streamable HTTP" transport:

```bash
MCP_TRANSPORT=http EMBEDDER_CACHE_DIR=.cache/models \
  node --env-file=presets/thieme.env apps/server/dist/main.js
```

By default the HTTP endpoint accepts only local `Host` and `Origin` headers and no auth (`AUTH_MODE=none`), which config allows on loopback only. To require API keys or OAuth, expose it beyond this machine, or meter usage, see [Operating the server](operating-the-server.md).

## What to expect

- `tools/list` shows six read-only tools: `search_articles`, `get_article`, `find_related`, `get_journal`, `cite`, `check_access`.
- Every response carries a `notice` and a plain-text rendering with linked titles; card links carry a landing token and UTM tags, never the query.
- Errors are tool results with `isError: true` and a stable code (`INVALID_INPUT`, `NOT_FOUND`, `CURSOR_STALE`, `TIMEOUT`, `INDEX_UNAVAILABLE`, `INTERNAL`); the message says what to do.
- Without an index the server still starts: tools answer `INDEX_UNAVAILABLE`, and it opens the index once the ingest has built one (checked every 30 s).

The rules behind all of this are in [ADR 0025](../adr/0025-mcp-server-and-tool-rules.md).
