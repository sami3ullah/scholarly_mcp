# Connecting Claude and ChatGPT

[← Docs index](README.md) · [Self-hosting](SELF-HOSTING.md)

How readers add a deployed scholarly-mcp server to their AI assistant. The endpoint is `https://<PUBLIC_HOST>/mcp` (Streamable HTTP). Running the server on your own machine and stdio are in the [client guide](guides/connecting-clients.md).

## Which auth each client needs

| Client                              | API key                             | OAuth                 |
| ----------------------------------- | ----------------------------------- | --------------------- |
| Claude Code                         | Yes, as a header                    | Yes                   |
| Claude Desktop, local config        | Yes, through `mcp-remote`           | Yes                   |
| Claude (claude.ai, Desktop, mobile) | Only where "Request headers" exists | Yes                   |
| ChatGPT (developer mode, apps)      | No                                  | Yes                   |
| MCP Inspector, other MCP clients    | Yes, as a header                    | Depends on the client |

API keys are enough for a pilot with Claude Code and Claude Desktop. Connectors added in claude.ai or ChatGPT are called from those platforms' cloud, not from the reader's machine, so the server must be reachable from the internet, and they expect OAuth: ChatGPT supports OAuth or no auth, and claude.ai's request-header option (for a fixed key) is in beta for some organisations only. `AUTH_MODE` picks what a deployment accepts:

- `api-key` (default): keys only. Enough for Claude Code and Claude Desktop.
- `api-key+oauth`: both, on one hostname. Recommended once ChatGPT or claude.ai readers join: they log in through your identity provider, and existing key holders (pilots, scripts, monitoring) keep their keys ([ADR 0047](adr/0047-api-keys-and-oauth-in-one-deployment.md)).
- `oauth`: your identity provider only.

Platform settings and screens change; the platforms' own pages are the reference: [Claude custom connectors](https://claude.com/docs/connectors/custom), [ChatGPT developer mode](https://developers.openai.com/api/docs/guides/developer-mode).

## With an API key

Make one key per person or team ([self-hosting guide](SELF-HOSTING.md#4-api-keys)) and send it to them once, over a channel you trust. It looks like `smk_…`.

**Claude Code:**

```bash
claude mcp add --transport http scholarly https://mcp.example.org/mcp \
  --header "Authorization: Bearer smk_…"
```

**Claude Desktop** (Settings → Developer → Edit Config, `claude_desktop_config.json`), through the `mcp-remote` bridge, which needs Node.js on the reader's machine:

```json
{
  "mcpServers": {
    "scholarly": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote@0.15.2",
        "https://mcp.example.org/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer smk_…" }
    }
  }
}
```

Restart Claude Desktop; the six tools appear under the tools menu. (The `env` indirection avoids a space inside `args`, which some Windows setups split.)

**claude.ai with request headers:** Settings → Connectors → Add custom connector, URL `https://mcp.example.org/mcp`, and under request headers `Authorization: Bearer smk_…`. If the dialog has no such section, the organisation does not have it yet; use OAuth.

## With OAuth

The server does not issue tokens. It checks JWT access tokens from your identity provider (Keycloak, Entra ID, Auth0, Okta, Cognito, …) and tells clients where to log in through Protected Resource Metadata at `https://<PUBLIC_HOST>/.well-known/oauth-protected-resource/mcp` ([operating guide](guides/operating-the-server.md#oauth)).

1. **In the identity provider:**
   - An API or resource whose audience is exactly `https://mcp.example.org/mcp`; tokens must carry it in `aud`. Clients ask for it with the `resource` parameter (RFC 8707); check your provider maps that to `aud` (Auth0 calls it the API identifier).
   - Asymmetric token signing (RS256 or ES256) and a published JWKS.
   - A client for each platform, or dynamic client registration. claude.ai registers itself through dynamic client registration when the provider allows it, or takes a client ID and secret under the connector's advanced settings. ChatGPT takes a client ID and secret too, or uses client ID metadata documents if the provider advertises them.
   - The platform's OAuth redirect URL on that client, as each platform's docs give it.
   - Optional: a claim with the reader's institution, for `check_access`.
2. **In `deploy/.env`:**

   ```bash
   AUTH_MODE=api-key+oauth   # or oauth, to stop accepting API keys
   OAUTH_ISSUER=https://login.example.org/realms/main
   OAUTH_AUDIENCE=https://mcp.example.org/mcp
   OAUTH_JWKS_URL=https://login.example.org/realms/main/protocol/openid-connect/certs
   # OAUTH_REQUIRED_SCOPES=mcp:read
   # OAUTH_INSTITUTION_CLAIM=institution
   ```

   then `docker compose up -d --wait`. Check that `curl -s https://mcp.example.org/.well-known/oauth-protected-resource/mcp` names your issuer, and that `/mcp` without a token answers `401` with a `WWW-Authenticate` header pointing to it.

3. **Readers add the connector:**
   - **Claude** (claude.ai, Desktop, mobile): Settings → Connectors → Add custom connector, name `Scholarly articles`, URL `https://mcp.example.org/mcp`, client ID and secret under advanced settings if you made one. Connect, log in, allow. Team and Enterprise owners can add it once for the organisation.
   - **ChatGPT:** Settings → Apps → Advanced settings, turn on developer mode, then create an app with the URL `https://mcp.example.org/mcp` and OAuth. Business, Enterprise and Edu workspace admins can publish it for the workspace.
   - **Claude Code:** `claude mcp add --transport http scholarly https://mcp.example.org/mcp`, then `/mcp` in a session to log in.

Usage and rate limits then count per OAuth client (`oauth:<client id>`), and `check_access` uses the institution claim. With `api-key+oauth`, key holders count per key as before.

## What readers see

- Six read-only tools. Ask for example _"Find recent articles on cold vs hot snare polypectomy"_ or _"Wann ist eine Helicobacter-pylori-Eradikation sinnvoll?"_.
- Clients that support MCP Apps show `search_articles` results as article cards; every other client shows a plain list with linked titles ([card view](guides/funnel-and-card-view.md)).
- Every link opens a landing page on `PUBLIC_HOST`, never the article itself; the assistant gets a 280-character teaser at most.

## Troubleshooting

| Symptom                                   | Cause and fix                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `401` with a key you just made            | The key was made against another database: run `keys` through `admin` in the same `deploy/` dir  |
| `421 Misdirected Request`                 | The client used a hostname other than `PUBLIC_HOST`                                              |
| Connector says it cannot reach the server | claude.ai and ChatGPT call from the internet: check DNS, ports 443, the certificate, the tunnel  |
| OAuth login works, then every call is 401 | Token `aud` is not exactly `OAUTH_AUDIENCE`, `iss` differs from `OAUTH_ISSUER`, or HS256 signing |
| `RATE_LIMITED` in answers                 | The caller used `RATE_LIMIT_PER_MINUTE` (default 60); raise it in `.env`                         |
