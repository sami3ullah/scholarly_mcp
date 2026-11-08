# Setting up with an agent

[← Back to the docs index](../README.md)

Instructions for a coding agent (Claude Code, Codex, Cursor, or any agent that can run shell commands) that a user asked to set up scholarly-mcp. A person can follow them too; the [manual quick start](../../README.md#set-up-manually) is the short version.

**Goal:** the scholarly-mcp server runs locally in Docker and the user's MCP client lists its six tools.

**Done when:** `http://localhost:8080/readyz` answers `"status":"ready"`, a `tools/list` call returns six tools, and the server is registered in the user's client.

## Rules

- Ask the user before installing software, stopping or removing a container you did not start, or editing a config file shared with other servers in a way that drops entries.
- Do not use `sudo`. Keep the port bound to `127.0.0.1`; the server needs no key, so binding it to every interface makes it public on the network.
- Merge into existing client config files; never overwrite them.
- If a step fails, show the user the command and its output, and stop instead of guessing.

## 1. Check Docker

```bash
docker info --format '{{.ServerVersion}}'
```

If this fails, Docker is missing or not running. Ask the user to install or start Docker Desktop (or Docker Engine on Linux), then continue.

## 2. Check for an existing server and a free port

```bash
docker ps -a --filter name='^scholarly-mcp$' --format '{{.Names}} {{.Status}}'
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/readyz
```

- A container named `scholarly-mcp` already exists: if it is running and `/readyz` answers `200`, skip to step 4. If it is stopped, start it with `docker start scholarly-mcp` and go to step 4.
- Something else answers on port 8080 (any code other than `000`): use port 8081 instead, and use that port in every URL below.

## 3. Start the server

```bash
docker run -d --name scholarly-mcp --restart unless-stopped \
  -p 127.0.0.1:8080:8080 ghcr.io/sami3ullah/scholarly-mcp:latest
```

The image carries a demo index of about 200 open access articles, the embedding model and the Thieme preset; it needs no other setup. The first pull is about 800 MB.

## 4. Wait until it is ready

Loading the model takes up to a minute.

```bash
for i in $(seq 60); do
  curl -sf http://127.0.0.1:8080/readyz && break
  sleep 2
done
```

It prints `{"status":"ready",...}` when done. If it never does, show the user `docker logs --tail 50 scholarly-mcp`.

## 5. Check the tools

```bash
curl -s -X POST http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | grep -o '"name":"[a-z_]*"' | sort -u
```

Expect six names: `check_access`, `cite`, `find_related`, `get_article`, `get_journal`, `search_articles`.

## 6. Register the server in the user's client

The endpoint is `http://localhost:8080/mcp` over Streamable HTTP, with no key or header. Register it in the client you are running in, or the one the user names.

**Claude Code:**

```bash
claude mcp add --transport http scholarly http://localhost:8080/mcp
claude mcp list    # scholarly: http://localhost:8080/mcp (HTTP) - ✔ Connected
```

Add `--scope user` if the user wants it in every project, not just the current one.

**Cursor** (`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project):

```json
{ "mcpServers": { "scholarly": { "url": "http://localhost:8080/mcp" } } }
```

**VS Code** (`.vscode/mcp.json` in the workspace):

```json
{ "servers": { "scholarly": { "type": "http", "url": "http://localhost:8080/mcp" } } }
```

**Claude Desktop** reaches local servers over stdio, so bridge to HTTP with `mcp-remote` (needs Node.js) in `claude_desktop_config.json` (on macOS in `~/Library/Application Support/Claude/`), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "scholarly": { "command": "npx", "args": ["-y", "mcp-remote", "http://localhost:8080/mcp"] }
  }
}
```

**Any other client:** add a Streamable HTTP server named `scholarly` at the URL above as that client's documentation describes. A client that only speaks stdio can use the same `mcp-remote` bridge.

Most clients load new servers only after a restart or a new session; tell the user if theirs does.

## 7. Report to the user

Tell the user:

- that the server runs at `http://localhost:8080/mcp` and which client it was added to;
- to try a question such as _"Find recent articles on stroke thrombolysis"_ or _"Welche Artikel gibt es zur Sepsis bei Kindern?"_;
- that the demo index is small (about 200 open access articles) and that article links point to a landing page, which this single container does not serve; the full stack with the landing page and the full Thieme index is in the [README](../../README.md#quick-start) and the [ingestion guide](ingestion.md);
- how to stop it (`docker stop scholarly-mcp`) and remove it (`docker rm -f scholarly-mcp`, plus `claude mcp remove scholarly` or the matching config entry).
