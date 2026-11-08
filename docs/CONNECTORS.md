# Connecting Claude and ChatGPT

[← Docs index](README.md) · [Self-hosting](SELF-HOSTING.md)

How readers add a deployed scholarly-mcp server to their AI assistant. The endpoint is `https://<PUBLIC_HOST>/mcp` (Streamable HTTP). Running the server on your own machine and stdio are in the [client guide](guides/connecting-clients.md).

## No authentication

The server is public: every client connects with the URL alone, with no key, header or login ([ADR 0048](adr/0048-public-server-without-auth.md)). It only hands out discovery data (metadata, a teaser of at most 280 characters and links), and access to the article itself is decided on the publisher's site behind every link. Calls are rate limited per client address instead.

Connectors added in claude.ai or ChatGPT are called from those platforms' cloud, not from the reader's machine, so the server must be reachable from the internet. Claude Code and Claude Desktop with a local config call it from the reader's machine.

Platform settings and screens change; the platforms' own pages are the reference: [Claude custom connectors](https://claude.com/docs/connectors/custom), [ChatGPT developer mode](https://developers.openai.com/api/docs/guides/developer-mode).

## Adding the server

**Claude Code:**

```bash
claude mcp add --transport http scholarly https://mcp.example.org/mcp
```

**Claude** (claude.ai, Desktop, mobile): Settings → Connectors → Add custom connector, name `Scholarly articles`, URL `https://mcp.example.org/mcp`, nothing under advanced settings. Connect. Team and Enterprise owners can add it once for the organisation.

**Claude Desktop, local config** (Settings → Developer → Edit Config, `claude_desktop_config.json`), through the `mcp-remote` bridge, which needs Node.js on the reader's machine. Use this where the Connectors UI is not available:

```json
{
  "mcpServers": {
    "scholarly": {
      "command": "npx",
      "args": ["-y", "mcp-remote@0.15.2", "https://mcp.example.org/mcp"]
    }
  }
}
```

Restart Claude Desktop; the six tools appear under the tools menu.

**ChatGPT:** Settings → Apps → Advanced settings, turn on developer mode, then create an app with the URL `https://mcp.example.org/mcp` and authentication "No auth" (or "None"). Business, Enterprise and Edu workspace admins can publish it for the workspace.

**MCP Inspector and other MCP clients:** the URL with the Streamable HTTP transport and no authentication.

## What readers see

- Six read-only tools. Ask for example _"Find recent articles on cold vs hot snare polypectomy"_ or _"Wann ist eine Helicobacter-pylori-Eradikation sinnvoll?"_.
- Clients that support MCP Apps show `search_articles` results as article cards; every other client shows a plain list with linked titles ([card view](guides/funnel-and-card-view.md)).
- Every link opens a landing page on `PUBLIC_HOST`, never the article itself; the assistant gets a 280-character teaser at most.

## Troubleshooting

| Symptom                                   | Cause and fix                                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `421 Misdirected Request`                 | The client used a hostname other than `PUBLIC_HOST`                                                                                                                                          |
| Connector says it cannot reach the server | claude.ai and ChatGPT call from the internet: check DNS, ports 443, the certificate, the tunnel                                                                                              |
| `RATE_LIMITED` in answers                 | The client address used `RATE_LIMIT_PER_MINUTE` (default 60); raise it in `.env`. If every client seems to share one bucket, set `HTTP_TRUSTED_PROXIES` to the proxy or load balancer ranges |
