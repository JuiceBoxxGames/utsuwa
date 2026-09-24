---
title: MCP Servers
description: "Give your companion external tools through the Model Context Protocol: Home Assistant, Brave Search, GitHub, and more."
---

# MCP Servers

Utsuwa can connect to external [MCP (Model Context Protocol)](https://modelcontextprotocol.io) servers and use their tools during chat: read a sensor value from Home Assistant, search the web, look up a repository. The model decides when a tool helps and calls it.

MCP is plain JSON-RPC 2.0, so Utsuwa ships a small built-in client with no SDK and no extra services.

## How it runs

| Build | Where tools execute | Transports |
| --- | --- | --- |
| Web (self-hosted, `MCP_ENABLED=server`) | Server routes `/api/mcp/*`, server to server, no CORS | HTTP + stdio |
| Web (hosted deployment) | Disabled unless the operator opts in | None |
| Desktop (Tauri) | Directly in the app via the Tauri HTTP plugin (CORS-free) | HTTP only |

Browser-side calls to MCP servers are blocked by CORS, mixed-content and Private Network Access rules, which is why the web build proxies through the server and the desktop build uses the Tauri HTTP plugin. stdio servers (local processes) only run in the server build. See [Desktop](#desktop-builds-tauri).

## Enabling MCP (web build)

MCP is **off by default**. Set the environment variable on the Utsuwa server:

```bash
MCP_ENABLED=server
```

- `server`: the server-side MCP proxy is on (HTTP and stdio).
- `both`: currently the same as `server`.
- Unset, `off`, or any other value (including `client`): the MCP routes return `404`, so a hosted deployment stays untouched by default.

Works the same for every deployment style: Docker Compose (`environment:` / an override file), a native install (`.env` next to the build, systemd `Environment=MCP_ENABLED=server`), or your shell. `.env.example` lists the variable as a commented default.

When MCP is disabled, the **MCP entry is hidden from the settings navigation** on web (the page probes the server once and disappears if the route answers 404). A direct link still shows a notice explaining that the administrator has not enabled MCP.

Optional hardening switches (prompt hardening, never-auto-execute tool list) are documented under [Optional hardening](#optional-hardening-env-gated).

## The MCP settings page

Open **Settings > MCP**.

**Servers**: one card per configured server, with an on/off switch, a transport badge, and edit and remove buttons. An `auth` badge marks HTTP servers with a bearer token.

- The **switch** enables or disables a single server. Disabled servers are never contacted and their tools are removed from the chat. Turning every server off disables MCP for chat without deleting the configuration.
- **Add Server** opens the form: **Name**, **Transport** (`HTTP` or `stdio`), then either **URL** + **Auth** (`none` or `bearer` + **Token**) for HTTP, or **Command**, **Arguments** and **Env Vars** for stdio.
- **Env Vars** takes one `KEY=value` per line; blank lines and `#` comments are ignored.
- **Inject text tool results as user messages** repeats each result as a user-side note. It helps local or SLIM models that ignore the strict tool role.

**Available Tools**: press **Refresh** to list the tools of all enabled servers. Each entry shows the tool name, its server, and the description the model sees. Per-server failures (bad token, wrong URL, spawn error) are shown right here instead of silently producing an empty list.

Tokens are stored locally (like other API keys) and are only sent to the server you configured. They never go to the LLM and are never logged.

## Examples

### Home Assistant (HTTP + bearer)

Home Assistant ships an official **MCP Server** integration that exposes the Assist API. Enable it in HA under **Settings > Devices & services > Add integration > Model Context Protocol Server** (it exposes `http://<your-ha>:8123/api/mcp`).

1. Create a long-lived access token in HA: **Profile > Security > Long-lived access tokens**.
2. Add a server in Utsuwa:
   - **Name**: `Home Assistant`
   - **Transport**: `HTTP`
   - **URL**: `http://homeassistant.local:8123/api/mcp`
   - **Auth**: `bearer`, **Token**: your long-lived access token
3. Press **Refresh** under *Available Tools*. You should see tools like `GetLiveContext` and `HassTurnOn`.
4. Ask your companion *"What's the temperature in the living room?"* She calls the tool and answers with the result.

> Home Assistant's router is strict about trailing slashes (`/api/mcp` works, `/api/mcp/` returns 404). Utsuwa probes both URL variants automatically, so either form works.

### Brave Search (stdio)

Brave publishes an official MCP server (`@brave/brave-search-mcp-server`) that needs a Brave Search API key. It runs as a local process on the Utsuwa server:

- **Name**: `Brave Search`
- **Transport**: `stdio`
- **Command**: `npx`
- **Arguments**: `-y @brave/brave-search-mcp-server`
- **Env Vars**:
  ```
  BRAVE_API_KEY=your-brave-api-key
  ```

Requires Node.js 22+ on the Utsuwa host. The first request downloads the package via `npx`; if the cold start exceeds the 15-second stdio timeout, press **Refresh** again. The cache is warm afterwards.

> stdio is fail-closed: set `MCP_STDIO_ALLOWED_COMMANDS=npx` in the Utsuwa server environment, otherwise this server shows a "stdio is disabled" error.

> The URL `https://api.search.brave.com/res/v1/web/search` is Brave's REST API, **not** an MCP endpoint. Pointing an HTTP MCP server at it fails with a `422` asking for `x-subscription-token`, because MCP clients speak JSON-RPC with a bearer token. Use the stdio server above instead.

### GitHub (HTTP + bearer)

GitHub's official remote MCP server is a good HTTP test for both web and desktop builds:

- **Name**: `GitHub`
- **Transport**: `HTTP`
- **URL**: `https://api.githubcopilot.com/mcp/`
- **Auth**: `bearer`, **Token**: a GitHub personal access token

Create a **fine-grained** PAT at **GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens** and grant read-only permissions such as `Contents: Read-only` (plus `Issues` / `Pull requests` if you want them). Restrict **Repository access** to selected repositories or all of them. Classic tokens (`repo` scope) also work but grant broader access.

### SearXNG (stdio)

Any MCP server that speaks stdio can be spawned by the server build. Example with a SearXNG MCP server via `npx`:

- **Name**: `SearXNG`
- **Transport**: `stdio`
- **Command**: `npx`
- **Arguments**: `-y mcp-searxng`
- **Env Vars**:
  ```
  SEARXNG_URL=http://your-searxng-host:8080
  ```

stdio servers are spawned per request with a 15-second timeout and run with the server's environment plus the variables you configure here. Only enable MCP on a deployment you control, and allowlist the command with `MCP_STDIO_ALLOWED_COMMANDS` (stdio is fail-closed).

## Desktop builds (Tauri)

The desktop app is the MCP host itself: there is no backend to gate, so no `MCP_ENABLED` variable exists there. **HTTP** servers connect directly through the Tauri HTTP plugin (CORS-free) and work exactly as on web; **stdio** servers are not available (the app cannot spawn local MCP processes yet, so stdio entries show a per-server error in the tool list). The MCP page says so in a **Desktop mode** notice.

The Tauri HTTP permission is intentionally unrestricted (`http://**`, `https://**`): MCP servers are configured at runtime, so a static allowlist cannot know them. The plugin only issues the requests the MCP client makes. Tool results go to the model and are never rendered as HTML in the UI. If you consider the desktop app's network surface sensitive, keep only the servers you trust enabled.

The per-server switch is the desktop off switch: turn all servers off and the companion stops using MCP tools. A local server that only offers stdio (like Brave) can still be used on desktop by running it in HTTP mode yourself and pointing Utsuwa at it:

```bash
npx -y @brave/brave-search-mcp-server --transport http --port 8080
```

- **Transport**: `HTTP`, **URL**: `http://127.0.0.1:8080/mcp`, **Auth**: `none`

Brave's HTTP mode is unauthenticated and binds to loopback only. That is fine for a local process and not suitable for remote access.

## Using tools in chat

Once at least one server is enabled and its tools are listed, Utsuwa sends them to the model with every reply. The model can call several tools before answering: up to **5 tool rounds** per reply, with at most 8 tool calls per round. Results are fed back automatically and the final answer streams as usual (including voice). On the last round the model is told that the tool budget is spent and answers with the results it already has. HTTP requests time out after 15 seconds, including reading the response body. Expired HTTP sessions reconnect automatically. A single tool result is capped at 8000 characters.

If a local or SLIM model ignores tool results, enable **Inject text tool results as user messages** on that server.

Known limitations:

- The **Anthropic** provider path does not receive MCP tool definitions; use an OpenAI-compatible provider for MCP.
- Tools from all servers share one flat namespace. If two servers expose the same tool name, the first server in the list wins, so keep names unique.
- Authentication supports `none` and `bearer` only. Servers that need custom headers (for example `X-Api-Key`) are not supported yet.

## Optional hardening (env-gated)

Two opt-in switches cover the baseline of a tool-approval policy, and a third variable controls stdio. The two `PUBLIC_` switches default to off and change nothing until set. On web they are read at runtime; in the desktop build they are fixed at build time. Each works on its own.

- **`PUBLIC_MCP_PROMPT_HARDENING`** (`true` or `1`): adds a security layer to the system prompt on turns with MCP tools: tool results are untrusted data (never instructions), and state-changing or destructive actions require an explicit user request.
- **`PUBLIC_MCP_CONFIRM_TOOLS`**: comma-separated, case-sensitive tool names (blank entries are ignored), for example `unlock_door,set_alarm`. Listed tools are **never executed automatically**: the chat loop feeds back a "requires manual user confirmation" result so the model asks you first, and the `/api/mcp/call` route rejects direct calls with `403`. The tools stay visible to the model, and the block applies even when prompt hardening is off.
- **`MCP_STDIO_ALLOWED_COMMANDS`** (server builds only): comma-separated allowlist of stdio commands, for example `npx,node,uvx`. **stdio is fail-closed**: without this variable no stdio server runs (per-server error in the tool list, `403` on `/api/mcp/call`); with it, only the listed commands pass. `*` explicitly allows any command and makes the server log a startup warning.

A full interactive approval dialog (per-tool metadata such as `read-only` / `requires-confirmation`) is future work.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| MCP entry missing in settings | MCP is disabled on the server (`MCP_ENABLED` is not `server` or `both`). |
| `401` for an HTTP server | Token missing, invalid or expired. |
| `404` for an HTTP server | Wrong endpoint path. Utsuwa already retries with/without a trailing slash; check the server's documented MCP URL. |
| `422` asking for a specific header | The URL points at a REST API, not at an MCP endpoint. |
| `MCP stdio timeout` | Command too slow to start. The first `npx` run downloads the package; press **Refresh** again. |
| `spawn ... ENOENT` | Command not found on the Utsuwa host (check the command name and Node.js version). |
| Empty tool list, no error | The server is reachable but exposes no tools (or all are filtered server-side). |
| stdio server shows "stdio is disabled" | No stdio allowlist is set. Add `MCP_STDIO_ALLOWED_COMMANDS` (e.g. `npx`) to the Utsuwa server environment and restart it. |
| Tool result says "requires manual user confirmation" | The tool is listed in `PUBLIC_MCP_CONFIRM_TOOLS`. Confirm the action with the user, or remove the name from the list. |

## Security notes

- Tool results are treated as untrusted data: they are never executed, only passed to the model. `PUBLIC_MCP_PROMPT_HARDENING` states the same rule to the model, and `PUBLIC_MCP_CONFIRM_TOOLS` can block selected tools from ever running automatically.
- Tokens never reach the model and are never logged by Utsuwa. They do travel to your own server inside the proxy request body, so a reverse proxy or body-logging layer in front of the deployment could capture them. Keep access logs clean.
- On the server-side HTTP path, link-local and cloud-metadata addresses (`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::/32`, `100.100.100.200`, `metadata.google.internal`, also via DNS resolution) are rejected before any request. Only same-origin 307/308 redirects are followed, and every destination is checked before sending credentials or tool arguments. Cross-origin redirects, including HTTPS-to-HTTP changes, are rejected. 301/302/303 are reported as errors instead of changing the JSON-RPC POST into a GET. IPv4-mapped IPv6 addresses are checked against the same blocked ranges. Loopback and RFC1918 stay reachable by design, because self-hosted MCP servers like Home Assistant live on the local network. Never enable MCP on a deployment untrusted users can reach.
- HTTP servers may only use `http:`/`https:` URLs; other schemes are rejected before any request is made (web proxy and desktop transport alike). The desktop transport additionally blocks literal link-local/metadata hosts; hostname resolution checks exist only where DNS is available (server build).
- stdio servers run commands on the Utsuwa host and receive only a minimal, allowlisted slice of the app environment (`PATH`, `HOME`, `LANG`, temp/cert vars) plus the variables you configure per server. App secrets like `DATABASE_URL` or provider keys are never inherited. They are **fail-closed**: nothing runs unless `MCP_STDIO_ALLOWED_COMMANDS` lists the command (or `*`). Critical variables such as `PATH` and `NODE_OPTIONS` from a server config are ignored.
- The `/api/mcp/*` routes are **unauthenticated**, like the rest of the app: Utsuwa has no per-user accounts, so anyone who can reach the deployment can add servers and trigger tool calls. Because the client supplies the server config, the HTTP path also works as a proxy into loopback/RFC1918 (that is what makes self-hosted Home Assistant possible). Never expose an MCP-enabled deployment without an authenticating reverse proxy. Utsuwa logs a startup warning whenever MCP is enabled, and another when stdio is disabled or allows every command.
- The model can call any tool you expose. Expose only what you are comfortable with (Home Assistant's MCP integration lets you pick which entities are exposed).
- Disabling a server (or all servers) takes effect immediately: no further requests are made and its tools leave the chat.
