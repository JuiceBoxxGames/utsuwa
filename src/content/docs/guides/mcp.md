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

Tool confirmation, prompt hardening, and the stdio allowlist are documented under [Hardening](#hardening).

## The MCP settings page

Open **Settings > MCP**.

**Servers**: one card per configured server, with an on/off switch, a transport badge, and edit and remove buttons. An `auth` badge marks HTTP servers with a bearer token.

- The **switch** enables or disables a single server. Disabled servers are never contacted and their tools are removed from the chat. Turning every server off disables MCP for chat without deleting the configuration.
- **Add Server** opens the form: **Name**, **Transport** (`HTTP` or `stdio`), then either **URL** + **Auth** (`none` or `bearer` + **Token**) for HTTP, or **Command**, **Arguments** and **Env Vars** for stdio.
- **Env Vars** takes one `KEY=value` per line; blank lines and `#` comments are ignored.
- **Inject text tool results as user messages** repeats each result as a user-side note. It helps local or SLIM models that ignore the strict tool role.

**Picture search**: choose the tool Utsuwa uses when the companion shows pictures. **Automatic** picks a query-taking tool; an explicit choice is never replaced silently. If it disappears, the popup reports that no picture tool is configured.

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

> stdio is fail-closed: set `MCP_STDIO_ALLOWED_COMMANDS=npx -y @brave/brave-search-mcp-server` and `MCP_STDIO_ENV_ALLOWLIST=BRAVE_API_KEY` in the Utsuwa server environment, otherwise this server shows a "stdio is disabled" error.

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

stdio servers are spawned per request with a 15-second timeout and run with a minimal slice of the server's environment plus the variables you configure here. Only enable MCP on a deployment you control, and allowlist the command line with `MCP_STDIO_ALLOWED_COMMANDS=npx -y mcp-searxng` and the variable with `MCP_STDIO_ENV_ALLOWLIST=SEARXNG_URL` (stdio is fail-closed).

Like Brave, the first `npx` start downloads the package and can exceed the 15-second timeout; if that happens, press **Refresh** in the tool list once and it stays warm afterwards.

### Showing pictures

The companion can show you pictures without needing model tool-calling. When the user asks for pictures, she puts a short subject in her state JSON (`image_search`); Utsuwa runs the **Picture search tool** selected under **Settings > MCP** and shows the structured results in a popup. `image_page` asks for the next page ("show me more"), and `close_images` closes it. The model never supplies image URLs, so it cannot invent one.

The selection is explicit:

- **Automatic (best matching)** picks a query-taking tool. This is the default.
- Choosing a server/tool pins it. If that tool disappears or stops taking a query, the app shows **No picture search tool configured** / a missing-tool error instead of silently switching to another server.
- A clear close request is honored even if the model forgets the JSON field. "More" reuses the current query and page when needed.

**Backends:** the app is not SearXNG-specific. Any MCP tool that takes a query and is recognisable as image/stock search can be selected: SearXNG's `searxng_web_search` (with `categories=images` and JSON results), Brave's `brave_image_search`, and Pexafy's `search_photos`, for example. Suggestions, page-readers, file-fetch and unrelated web/video/news tools are filtered out of the picker. The parser accepts SearXNG, Brave (`properties.url`) and Pexafy (`urls`, `attribution`) result shapes; license and credit are shown when the backend returns them. Pexafy's hosted endpoint may use OAuth or an MCP Bearer key; Utsuwa currently supports HTTP servers with no auth or a Bearer token, not OAuth. License metadata from open web image search is not a guarantee that an image is free to reuse.

Concrete examples:

- **SearXNG**: `searxng_web_search` with `categories=images`; Utsuwa sets JSON/result-detail arguments for you.
- **Brave**: `brave_image_search` from Brave's MCP server; Utsuwa reads `items[].url` plus `properties.url`.
- **Pexafy**: HTTP `https://mcp.pexafy.com/mcp`, tool `search_photos`; free stock photos with licence and attribution. Utsuwa's MCP client supports no auth or a Bearer MCP key, not OAuth; the anonymous endpoint may work, but verify it on your deployment.

**No backend:** without a configured picture tool the feature is unavailable. The prompt says so, and an attempted search produces `No picture search tool configured`; there is no silent fallback to a different provider. A model's built-in web search is not visible to the app and is therefore not used as a picture backend yet.

**Status and errors:** the popup opens immediately with **Searching…**, then shows the results, **No pictures found**, or **Search failed**. Search errors are never swallowed. With OmniVoice native speech tools, the generic state extraction also recovers the picture query when the speech tool calls swallowed the state block, and a small forced-JSON pass covers the case where a state block arrived without picture fields. Both ask only for a query, never for URLs.

**Privacy:** thumbnails are not hotlinked from the source host. Utsuwa loads them through the MCP file-fetch tool and shows a neutral placeholder when no such tool exists. Opening a full picture is an explicit user action. Without a file-fetch tool the popup still lists titles, sources and optional licenses, but it does not automatically request third-party images.

To load a picture's bytes (so a hotlink-protected or CORS-blocked source still displays), enable a server that exposes **`fetch_file_from_url`**. The reference server is the self-hosted `filefetcher`:

- **Name**: `Filefetcher`
- **Transport**: `HTTP`
- **URL**: `http://your-filefetcher-host:8000/mcp`
- **Auth**: `none`
- **Tool**: `fetch_file_from_url` with `{ "url": "<image url>", "max_dimension": 1280 }`

The tool must return the picture as an MCP **image content block** — `{"type":"image","data":"<base64>","mimeType":"image/png"}` — and not as base64 embedded in a text block. `max_dimension` caps the longest edge (the server never upscales), so the request stays small.

> If a picture server has **Ask before running tools** enabled, the search asks once for confirmation. Automatic thumbnail prefetch is skipped for such a server (the popup keeps placeholders) rather than queueing one dialog per image; opening one picture asks once.

> The fetched URL and the search come from the app, but the web server still SSRF-guards the file fetch: only `http(s)` is allowed, and metadata/link-local/private hosts are blocked unless `ALLOW_LOCAL_PROVIDER_HOSTS=true`. The guard resolves DNS and follows no redirects. On desktop there is no server relay.

> The app also applies a browser-safe blocked-host check before handing an image URL to `fetch_file_from_url`, including on the Tauri desktop path. It blocks link-local/metadata hosts and credentials; private/loopback is left to the web server's ALLOW_LOCAL_PROVIDER_HOSTS policy (and is allowed on desktop). DNS rebinding inside the external filefetcher remains a residual risk.

> MCP HTTP responses are capped at 12 MB; inline image blocks are capped at 12 images / 10 MB. Image blocks are replaced by `[image: mime]` in the model-facing text and carried separately as structured data.

> The selected server must return image URLs — an `img_src`/`thumbnail` field, or links ending in an image extension. A server that only returns page URLs will not produce pictures.

> The picture event is window-independent, but the desktop overlay is not wired in this change. Use the main window for now; an overlay presenter can be added later without changing the search core.

## Desktop builds (Tauri)

The desktop app is the MCP host itself: there is no backend to gate, so no `MCP_ENABLED` variable exists there. **HTTP** servers connect directly through the Tauri HTTP plugin (CORS-free) and work exactly as on web; **stdio** servers are not available (the app cannot spawn local MCP processes yet, so stdio entries show a per-server error in the tool list). The MCP page says so in a **Desktop mode** notice.

The Tauri HTTP permission is intentionally unrestricted (`http://*:*`, `https://*:*`, so any host on any port): MCP servers are configured at runtime, so a static allowlist cannot know them. The plugin only issues the requests the MCP client makes. Tool results go to the model and are never rendered as HTML in the UI. If you consider the desktop app's network surface sensitive, keep only the servers you trust enabled.

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
- stdio servers are spawned per request. A server started via `npx` downloads its package on first use; if that cold start exceeds the 15-second timeout, press **Refresh** in the tool list again (the package cache is warm afterwards).

## Hardening

- **Ask before running tools** (per server, on by default): every tool call waits for your answer. See [Confirming tool calls](#confirming-tool-calls).
- **`PUBLIC_MCP_PROMPT_HARDENING`** (on by default; `false`, `0`, or `off` opts out): adds a security layer to the system prompt on turns with MCP tools: tool results are untrusted data (never instructions), and state-changing or destructive actions require an explicit user request. On web the `PUBLIC_` variables are read at runtime; in the desktop build they are fixed at build time.
- **`PUBLIC_MCP_CONFIRM_TOOLS`**: comma-separated, case-sensitive tool names (blank entries are ignored), for example `unlock_door,set_alarm`. Listed tools are **never executed automatically**: the chat loop feeds back a "requires manual user confirmation" result so the model asks you first, and the `/api/mcp/call` route rejects direct calls with `403`. The tools stay visible to the model, and the block applies even when prompt hardening is off.
- **`MCP_STDIO_ALLOWED_COMMANDS`** and **`MCP_STDIO_ENV_ALLOWLIST`** (server builds only): which stdio command lines may run and which variables they may receive. See [stdio allowlists](#stdio-allowlists).

## Confirming tool calls

Each server has an **Ask before running tools** checkbox in its edit form. It is on for new servers, and servers saved before the option existed count as on too.

While it is on, every call the model makes to that server's tools pauses the reply and opens a dialog titled **Run `tool_name`?**. The dialog names the server and shows the exact arguments as JSON.

- **Run** executes the call and the reply continues with its result.
- **Skip**, **Escape**, or a click outside the dialog declines it. The model receives a result saying you declined and that it should not retry unless you ask, so it answers without the tool.
- When the model calls several tools in one round, the dialogs queue and appear one at a time.
- The dialog appears in the main window and in the desktop overlay, wherever the chat is running.

Tools listed in `PUBLIC_MCP_CONFIRM_TOOLS` are blocked before this step: they never open a dialog and never run from chat.

Turn the checkbox off only for servers you trust to run unattended. Those cards show an **auto-run** badge.

## stdio allowlists

Both variables are read by the server build only; the desktop app does not run stdio servers. Entries are separated by commas, and spaces around each entry are trimmed.

### `MCP_STDIO_ALLOWED_COMMANDS`

**stdio is fail-closed.** Without this variable no stdio server runs: the tool list shows a "stdio is disabled" error for the server and `/api/mcp/call` answers `403`.

Each entry is a full command line, split into words the way a shell would split simple arguments: spaces separate words, and single or double quotes keep a word with spaces together (`"C:\Program Files\node.exe"`). The first word is the command, the rest are its arguments.

A stdio server runs when some entry matches it:

1. The server's **Command** equals the entry's first word exactly. There is no path lookup, so `npx` and `/usr/local/bin/npx` are different commands.
2. The server's **Arguments** start with the entry's remaining words, in the same order and spelled exactly the same.
3. The argument counts are equal, unless the entry ends with a separate ` *` word. Then any further arguments are allowed after the listed ones.

| Entry | Allows | Rejects |
| --- | --- | --- |
| `npx -y @brave/brave-search-mcp-server` | `npx -y @brave/brave-search-mcp-server` | `npx -y @brave/brave-search-mcp-server --port 1` |
| `npx -y @modelcontextprotocol/server-filesystem *` | the same line plus any directories after it | `npx @modelcontextprotocol/server-filesystem /tmp` (missing `-y`) |
| `npx` | `npx` with no arguments | `npx -y anything` |
| `*` | every command line | nothing |

A bare command name like `npx` allows it only with no arguments, so older `npx,node,uvx`-style lists no longer work. The server config comes from the browser, and `node -e ...` would be arbitrary code. Utsuwa logs a startup warning for each bare command entry and another when `*` allows everything.

Because commas separate entries, a command line that itself contains a comma cannot be listed.

### `MCP_STDIO_ENV_ALLOWLIST`

Comma-separated variable names a stdio server's **Env Vars** may set, for example `BRAVE_API_KEY,SEARXNG_URL`. Names must match exactly, including case. Variables not on the list are dropped silently before the process starts.

Variables that change how code loads are dropped even when listed, in any case: `PATH`, `HOME`, `NODE_OPTIONS`, `NODE_PATH`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH`, `BASH_ENV`, `PYTHONPATH`, and anything starting with `NPM_CONFIG_`.

### Limits

- Listing tools (for example **Refresh** under *Available Tools*) starts at most 4 stdio servers at a time; the others wait for a free slot.
- A server that writes more than 4 MB to stdout without a newline is killed, and its pending requests fail with an error.
- Each stdio request times out after 15 seconds.

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
| stdio server shows "stdio is disabled" | No stdio allowlist is set. Add the full command line to `MCP_STDIO_ALLOWED_COMMANDS` (e.g. `npx -y mcp-searxng`) in the Utsuwa server environment and restart it. |
| stdio server shows "is not allowed" | The command and arguments do not match an allowlist entry exactly. Copy them into `MCP_STDIO_ALLOWED_COMMANDS`, or end the entry with ` *` to allow extra arguments. |
| stdio server ignores its env vars | The variable names are not in `MCP_STDIO_ENV_ALLOWLIST`. |
| Tool result says "requires manual user confirmation" | The tool is listed in `PUBLIC_MCP_CONFIRM_TOOLS`. Confirm the action with the user, or remove the name from the list. |

## Security notes

- Tool results are treated as untrusted data: they are never executed, only passed to the model. Prompt hardening states the same rule to the model, **Ask before running tools** puts every call in front of you, and `PUBLIC_MCP_CONFIRM_TOOLS` can block selected tools from running at all.
- Tokens never reach the model and are never logged by Utsuwa. They do travel to your own server inside the proxy request body, so a reverse proxy or body-logging layer in front of the deployment could capture them. Keep access logs clean.
- On the server-side HTTP path, link-local and cloud-metadata addresses (`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::/32`, `100.100.100.200`, `metadata.google.internal`, also via DNS resolution) are rejected before any request. Only same-origin 307/308 redirects are followed, and every destination is checked before sending credentials or tool arguments. Cross-origin redirects, including HTTPS-to-HTTP changes, are rejected. 301/302/303 are reported as errors instead of changing the JSON-RPC POST into a GET. IPv4-mapped IPv6 addresses are checked against the same blocked ranges. Loopback and RFC1918 stay reachable by design, because self-hosted MCP servers like Home Assistant live on the local network. Never enable MCP on a deployment untrusted users can reach.
- HTTP servers may only use `http:`/`https:` URLs; other schemes are rejected before any request is made (web proxy and desktop transport alike). The desktop transport additionally blocks literal link-local/metadata hosts; hostname resolution checks exist only where DNS is available (server build).
- stdio servers run commands on the Utsuwa host and receive only a minimal, allowlisted slice of the app environment (`PATH`, `HOME`, `LANG`, temp/cert vars) plus the per-server variables named in `MCP_STDIO_ENV_ALLOWLIST`. App secrets like `DATABASE_URL` or provider keys are never inherited. They are **fail-closed**: nothing runs unless `MCP_STDIO_ALLOWED_COMMANDS` lists the exact command line (or `*`). Critical variables such as `PATH` and `NODE_OPTIONS` from a server config are always ignored.
- The `/api/mcp/*` routes are **unauthenticated**, like the rest of the app: Utsuwa has no per-user accounts, so anyone who can reach the deployment can add servers and trigger tool calls. Because the client supplies the server config, the HTTP path also works as a proxy into loopback/RFC1918 (that is what makes self-hosted Home Assistant possible). Never expose an MCP-enabled deployment without an authenticating reverse proxy. Utsuwa logs a startup warning whenever MCP is enabled, and another when stdio is disabled or allows every command.
- The model can call any tool you expose. Expose only what you are comfortable with (Home Assistant's MCP integration lets you pick which entities are exposed).
- Disabling a server (or all servers) takes effect immediately: no further requests are made and its tools leave the chat.
