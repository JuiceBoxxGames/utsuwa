---
title: Architecture Overview
description: How Utsuwa's VRM scene, chat pipeline, voice, memory, storage, and desktop shell fit together.
---

# Architecture Overview

Utsuwa is a SvelteKit app that runs in the browser or inside a Tauri desktop shell. The companion engine, memory, and all saved data live on the user's device. A small set of SvelteKit server routes exists for the web build: they relay requests that a browser cannot make directly. The desktop build has no server routes and calls providers itself.

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Client (browser or Tauri webview)                │
│                                                                      │
│  Chat UI ─────► Turn pipeline (companion-chat.ts, companion-turn.ts) │
│    │              │  heuristics, memory retrieval, prompt builder,   │
│    │              │  response parser, state merge, events            │
│    │              ▼                                                  │
│    │           LLM transport: direct fetch or /api/chat              │
│    │              │                                                  │
│    ▼              ▼                                                  │
│  3D scene ◄── Svelte 5 rune stores ──► Voice (TTS queue, STT)        │
│  Threlte +     character, vrm, display, animation library,           │
│  three-vrm     tts, stt, mcp, settings, modules, photomode           │
│                   │                                                  │
│                   ▼                                                  │
│  IndexedDB: Dexie (utsuwa-db) + localforage (models, keepsakes,      │
│             backgrounds, animations)    localStorage: settings       │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
          ┌────────────────────────┴───────────────────────┐
          ▼                                                ▼
┌───────────────────────────────┐          ┌───────────────────────────┐
│  SvelteKit server (web only)  │          │  Providers                │
│  /api/chat                    │ ───────► │  LLM: cloud or local      │
│  /api/providers/models        │          │  TTS: cloud or local      │
│  /api/tts/fish-audio          │          │  STT: cloud or local      │
│  /api/tts/local (opt-in)      │          │  MCP servers (opt-in)     │
│  /api/mcp/tools, /call (opt-in)│         │                           │
└───────────────────────────────┘          └───────────────────────────┘
```

## Core Components

### VRM Rendering

The avatar renders with Three.js through Threlte, the Svelte wrapper for Three.js.

**Key files:**
- `src/lib/components/vrm/Scene.svelte`: camera, lights, orbit controls, scene backgrounds, tap raycasting, photo capture, and AR placement
- `src/lib/components/vrm/VrmModel.svelte`: model loading, the idle and talking cycle, expressions, lip sync, and tap reactions
- `src/lib/stores/vrm.svelte.ts`: model state, head tracking for UI positioning, talking and thinking flags, and flash requests. Uploaded models persist in the `utsuwa-vrm` localforage store
- `src/lib/services/vrm-animations.ts`: loads `.vrma` files and caches one parsed animation per URL

**Libraries:** `@pixiv/three-vrm` and `@pixiv/three-vrm-animation` for VRM and VRMA, `@threlte/core` for the render loop, and `@threlte/xr` for AR mode.

**How it works:**
1. The user picks a built-in model or uploads a `.vrm` file.
2. The VRM loader parses it into a Three.js scene object.
3. Threlte runs the render loop inside Svelte's reactivity.
4. Each frame, `VrmModel.svelte` blends animation, expression layers, and lip-sync weights onto the humanoid.

On WebXR devices that support `immersive-ar` (Android Chrome, headset browsers), `src/lib/stores/ar.svelte.ts` enables AR mode and `ArPlacement.svelte` places the model on a real floor.

### Face Layers

The face combines several layers. Higher layers win over lower ones:

1. Photo mode expression, emotes, and tap reactions
2. The flash layer: a short reaction the model asks for with the `expression` field
3. The resting mood face, driven by the tracked mood
4. Lip sync, which drives only the mouth visemes

`src/lib/engine/mood-expression.ts` maps each emotion to a VRM expression. `moodExpressionTarget()` scales the resting face by mood intensity. `flashExpressionTarget()` returns a stronger weight, capped at 0.9. A flash holds 2.5 seconds, or up to 8 seconds while she is speaking, then fades. Both layers switch off with Settings > Display > Mood expressions. See [Companion System](/docs/technology/companion-system#mood-state) for the mapping.

### Animation Library and Action Gate

Settings > Animations manages the built-in emotes, the idle pool, an optional thinking clip, and uploaded `.vrma` files.

**Key files:**
- `src/lib/stores/animation-library.svelte.ts`: metadata in localStorage (`utsuwa-animations`) so other windows get a `storage` event; blobs in the `utsuwa-animations` localforage store
- `src/lib/stores/animation-library-parser.ts`: built-in entries, stored-metadata validation, and idle pool resolution
- `src/lib/services/storage/animations.ts`: upload checks (`.vrma` only, 25 MB, 60 seconds)
- `src/lib/engine/action-gate.ts`: decides whether a requested action plays
- `src/lib/services/animation-actions.ts`: glue between the parsed `action` field, the gate, and the VRM store

Enabled animations are listed in the prompt's `<avatar>` layer. When a reply sets `action`, the gate drops unknown ids, repeats of the same id within 20 seconds, and any action within 8 seconds of the last one. Photo mode and a playing emote always win. Cooldowns are per session.

### Chat Pipeline

`src/lib/services/chat/companion-chat.ts` runs one send loop for both the main app and the desktop overlay. `src/lib/services/chat/companion-turn.ts` handles everything after the model replies.

**Transports** (`src/lib/services/llm/transport.ts` picks one; `active-llm.ts` resolves the provider, model, key, and base URL):
- **Direct fetch**: used for Ollama, LM Studio, and every provider in the desktop build. Anthropic uses its `/messages` API. Everything else uses `/chat/completions`.
- **Server route** (`src/routes/api/chat/+server.ts`): used for cloud providers on web. It streams through the xsAI SDK (`@xsai/stream-text`) and sends lines prefixed `0:` (text), `t:` (tool call), and `e:` (error).

**Key files:**
- `src/lib/ai/prompt-builder.ts`: system prompt layers, the extraction prompt, and context-window truncation
- `src/lib/ai/response-parser.ts`: splits dialogue from the JSON state block and normalizes it
- `src/lib/services/chat/content.ts`: per-provider image serialization
- `src/lib/services/chat/chat-phase.ts`: the phase labels shown while she works
- `src/lib/engine/`: heuristics, stage transitions, memory, events, and the other pure engine modules

**Flow:**
```
User message
    │
    ▼
Memory retrieval ──── recent turns, facts by similarity, session summary
    │                 (phase: remembering)
    ▼
Prompt builder ────── persona, state, memory, optional layers
    │
    ▼
LLM stream ────────── direct fetch or /api/chat, up to 5 rounds with MCP tools
    │                 (phase: thinking, or seeing for image turns)
    ▼
Response parser ───── strip reasoning, stop tokens, and fake turns;
    │                 read the JSON block
    ▼
Extraction fallback ─ second forced-JSON call when the block is missing
    │
    ▼
State merge ───────── heuristic baseline plus sanitized LLM deltas
    │
    ▼
Apply ─────────────── stats, stage transition, action, flash, memories,
                      turn history, event check, speech
```

The model ends each reply with a JSON block. When the block is missing, `companion-turn.ts` makes a second call through `completeJson()` in `transport.ts` that returns only JSON. See [Companion System](/docs/technology/companion-system#llm-output-format) for both paths.

**Showing images:** The paperclip button or a drag and drop attaches a photo. `content.ts` serializes it as OpenAI-style `image_url` data URLs or Anthropic base64 `source` blocks. `src/lib/services/providers/vision.ts` gates the feature to vision-capable models. Kept photos go to the `utsuwa-keepsakes` localforage store through `src/lib/services/storage/keepsakes.ts`.

**MCP tools:** When MCP servers are enabled, the send loop adds their tools to the request and runs up to 5 tool rounds per reply. See [MCP Servers](/docs/guides/mcp).

### Generated Moments

When an event fires, `src/lib/services/events/moment-generator.ts` asks the chat model to rewrite the scene text. It uses the same transport choice as chat. `src/lib/engine/moments.ts` builds the prompt, selects memories, and validates the output. The built-in scene plays whenever generation is off, times out after 15 seconds, or returns something invalid. A written scene is cached for the session so a reopened event does not call the model again. See [Companion System](/docs/technology/companion-system#generated-moments).

### Voice Pipeline

Text-to-speech runs after the reply is parsed. OmniVoice is the exception: it streams while the model is still writing.

**Key files:**
- `src/lib/stores/tts.svelte.ts`: the speech queue and the OmniVoice streaming session
- `src/lib/services/tts/speech-scheduler.ts`: turns compiled segments into orchestrator calls and publishes gestures
- `src/lib/services/voice-orchestrator.ts`: synthesizes segment N+1 while segment N plays, handles interrupts, and picks the voice per language
- `src/lib/services/tts/streaming-speech-buffer.ts`: cuts streamed text into speakable segments for OmniVoice
- `src/lib/services/tts/speech-compiler.ts` and `tool-definitions.ts`: parse `speak()` calls and native `speak_segment` tool calls
- `src/lib/services/tts/language-detector.ts`: checks declared segment languages with ELD
- `src/lib/services/tts/index.ts`: provider factory and the shared `AudioContext`
- `src/lib/services/lipsync/analyzer.ts`: maps the playing audio to the `aa`, `ee`, `ih`, `oh`, and `ou` visemes

**Providers:**
- **ElevenLabs** (`elevenlabs.ts`), cloud, API key
- **OpenAI TTS** (`openai-tts.ts`), cloud, API key
- **Fish Audio** (`fish-audio.ts`), cloud, API key. Its TTS endpoint sends no CORS headers, so web posts to `/api/tts/fish-audio` and desktop uses the Tauri HTTP plugin
- **Local TTS**, any OpenAI-compatible `/v1/audio/speech` server such as Kokoro-FastAPI. Default `http://localhost:8880/v1/`
- **OmniVoice**, the local proxy in `tools/omnivoice`. Default `http://localhost:8881/v1/`

Local TTS and OmniVoice share the `openai-tts.ts` client. If the browser's direct request fails on web, the client retries once through `/api/tts/local`. That route answers `403` unless the server sets `ALLOW_LOCAL_PROVIDER_HOSTS=true`, and it only ever posts to `{base}/audio/speech`. Validation lives in `src/lib/services/tts/local-proxy.ts`.

**Flow:**
1. The reply is split into sentences (or OmniVoice segments with a language each).
2. The scheduler hands segments to the orchestrator, which synthesizes ahead of playback.
3. Web Audio plays each buffer through an `AnalyserNode`.
4. The lip-sync analyzer reads the analyser every frame and sets mouth weights.

With OmniVoice and Alternative Voice on, models that support tools receive `speak_segment`, `pause_segment`, and `gesture_segment` tools with a required `language`. Anthropic and models without tools use the inline `speak({...})` syntax instead. See [OmniVoice Setup](/docs/guides/omnivoice).

### Speech-to-Text

**Key files:**
- `src/lib/services/stt/openai-stt.ts`: records with `MediaRecorder` and posts to `/audio/transcriptions` on Groq, OpenAI, or a local Whisper server
- `src/lib/services/stt/web-speech.ts`: the browser Web Speech API
- `src/lib/stores/stt.svelte.ts`: provider selection and session state

The active provider is chosen automatically: a configured local server first, then Groq, then OpenAI, then Web Speech. Web Speech is not offered in the desktop webview. Local transcription times out after 30 seconds by default; Settings > STT accepts 5 to 600 seconds.

### Memory System

**Key files:**
- `src/lib/engine/memory.ts`: retrieval, scoring, and embedding backfill
- `src/lib/engine/memory-session.ts`: working memory, per-run sessions, and hydration on load
- `src/lib/engine/fact-dedup.ts`: duplicate detection by normalized text or cosine similarity of at least 0.9
- `src/lib/engine/embedding-version.ts`: tags each vector with its model id so old vectors get re-embedded
- `src/lib/services/embeddings.ts`: loads the embedding model and ranks facts
- `src/lib/services/storage/memory.ts`: fact, session, and turn storage, including write-side dedup
- `src/lib/engine/memory-budget.ts`: scales injected turns and facts to the model's context window
- `src/lib/types/memory.ts`: memory types and limits

Embeddings come from `Xenova/paraphrase-multilingual-MiniLM-L12-v2` running in the browser through `@huggingface/transformers`. Vectors have 384 dimensions. Retrieval scores up to 500 of the most important facts. See [Companion System](/docs/technology/companion-system#memory-system) and [Memory Graph](/docs/technology/memory-graph).

### State Management

Stores use Svelte 5 runes (`$state`, `$derived`, `$effect`).

**Key stores:**
- `src/lib/stores/character.svelte.ts`: the companion's state, mode, saves, and cross-window sync over the `utsuwa-character-state` BroadcastChannel
- `src/lib/stores/persona.svelte.ts`: name and personality prompt
- `src/lib/stores/settings.svelte.ts`: provider keys, base URLs, and hotkeys (`utsuwa-settings` in localStorage)
- `src/lib/stores/modules.svelte.ts`: the chat and speech switches and their provider settings. Internally these are the `consciousness` and `speech` modules
- `src/lib/stores/display.svelte.ts`: theme, chat layout, typing indicator, wake lock, mood expressions, and personalized moments
- `src/lib/stores/animation-library.svelte.ts`: the animation library and base behavior
- `src/lib/stores/chat.svelte.ts`: messages and loading state
- `src/lib/stores/tts.svelte.ts` and `stt.svelte.ts`: voice output and input
- `src/lib/stores/mcp.svelte.ts`: MCP servers, tools, and the capability probe
- `src/lib/stores/photomode.svelte.ts`: photo mode state
- `src/lib/stores/reminders.svelte.ts`: the reminder poll loop
- `src/lib/stores/overlay.svelte.ts` and `updater.svelte.ts`: desktop overlay and updater state

### Settings Pages

Settings live under `src/routes/app/settings/`. The sidebar shows these pages:

| Label | Route folder | What it holds |
|-------|--------------|---------------|
| Character | `persona` | Identity, appearance, personality, and mode; state and activity |
| Display | `display` | Theme, chat layout, typing indicator, and behavior toggles |
| Animations | `animations` | Base behavior, uploaded animations, built-in emotes |
| LLM Model | `llm` | Chat provider, model, context window, advanced parameters |
| TTS | `tts` | Speech provider and voice |
| STT | `stt` | Voice input providers, local server, timeout |
| MCP | `mcp` | MCP servers and tools. Hidden on web when the server has MCP off |
| Memory | `memory` | Graph, facts, sessions, and advanced tools |
| Data | `data` | Export, import, and clear |
| Developer | `developer` | Expression tests, temporary VRM, event and storage tools |

### Photo Mode

Photo mode adds poses, expressions, backgrounds, filters, frames, stickers, head tracking, and high-resolution capture.

**Key files:**
- `src/lib/stores/photomode.svelte.ts`: mode state, lens override, and capture options
- `src/lib/services/poses.ts`: loads `static/poses/manifest.json`; adding a pose is a data change
- `src/lib/services/scene-backgrounds.ts`: gradient and pattern presets shared by the live scene and captures
- `src/lib/services/storage/scene-background-images.ts`: the uploaded background image in the `utsuwa-backgrounds` localforage store
- `src/lib/services/photo-capture.ts`: compositing for backgrounds, frames, vignette, and stickers
- `src/lib/components/photomode/`: the dock, sticker layer, and frame preview

A capture renders one supersampled frame, then composites the rest on a 2D canvas so the PNG matches the preview. The file goes to Downloads through `src/lib/utils/save-to-downloads.ts`: a browser download on web, a direct write with the fs plugin on desktop.

### Tap Reactions and Physics

- `src/lib/services/photo-touch.ts`: maps a tap to a touch zone by the nearest humanoid bone
- `src/lib/engine/photo-reactions.ts`: the reaction table keyed on zone and relationship tier; repeat taps escalate and cool down
- `src/lib/engine/spring-physics.ts`: the Movement slider's multipliers over each rig's spring settings, plus a frame-delta clamp that stops spring bones from exploding after a tab refocus

### Reminders

- `src/lib/utils/reminders.ts`: parses `[reminder:5min]...[/reminder]` tags and natural phrasing like "remind me in 10 minutes"
- `src/lib/stores/reminders.svelte.ts`: polls every 10 seconds, reports missed reminders, and claims each due reminder atomically so only one window reacts
- `src/lib/services/chat/reminder-chat.ts`: sends a fired reminder through the chat pipeline as a system event

### Storage Layer

**Dexie** (`src/lib/db/index.ts`, database `utsuwa-db`, schema version 6):

| Table | Contents |
|-------|----------|
| `characterStates` | The single companion record: persona, stats, mood, mode |
| `facts` | Memories with optional embeddings |
| `sessions` | Session summaries |
| `conversationTurns` | Saved turns |
| `completedEvents` | Event completions with choice and outcome |
| `reminders` | Reminders and their fired and dismissed state |

**localforage stores** (also IndexedDB):

| Store | Contents |
|-------|----------|
| `utsuwa-vrm` | Uploaded VRM models |
| `utsuwa-keepsakes` | Shown photos and photo mode captures, with thumbnails |
| `utsuwa-backgrounds` | The uploaded scene background |
| `utsuwa-animations` | Uploaded `.vrma` files |

**localStorage** holds settings: `utsuwa-settings`, `utsuwa-display`, `utsuwa-animations` (metadata), `utsuwa-mcp-v1`, and one `utsuwa-module-*` key per module.

The save file from `src/lib/db/export.ts` covers the Dexie character, facts, sessions, turns, and completed events. Reminders, localforage stores, and settings are not exported.

### Server Routes and Gates

The web build has five server routes. None of them store data.

| Route | Purpose | Gate |
|-------|---------|------|
| `/api/chat` | Streams chat for cloud providers | URL guard |
| `/api/providers/models` | Lists models for cloud providers | URL guard |
| `/api/tts/fish-audio` | Relays Fish Audio TTS to its fixed URL | None needed |
| `/api/tts/local` | Relays Local TTS and OmniVoice speech | `ALLOW_LOCAL_PROVIDER_HOSTS=true` |
| `/api/mcp/tools`, `/api/mcp/call` | MCP proxy | `MCP_ENABLED=server` |

`src/lib/services/providers/url-guard.ts` checks every client-supplied base URL before the server fetches it. It rejects non-HTTP schemes and private hosts: loopback, RFC 1918, CGNAT, link-local and cloud metadata, multicast, and IPv6 local ranges, including IPv4-mapped and NAT64 forms and every IPv4 spelling the URL parser accepts. `url-guard.server.ts` then resolves the hostname and applies the same check to every address, and its fetch wrapper re-checks each request and refuses redirects. Setting `ALLOW_LOCAL_PROVIDER_HOSTS=true` lets self-hosters reach loopback and private hosts, for example an OpenAI-compatible server on their LAN; link-local, metadata, unspecified, and multicast addresses stay blocked.

The MCP routes answer `404` unless `MCP_ENABLED` is `server` (or `both`). stdio servers also need `MCP_STDIO_ALLOWED_COMMANDS`. At startup, `src/hooks.server.ts` logs a warning whenever MCP is on.

### Marketing Site i18n

The landing page is localized with Paraglide JS. English is at `/` and Japanese at `/ja`. Messages live in `messages/en.json` and `messages/ja.json`, and `project.inlang/` configures the project. The compiled output goes to `src/lib/paraglide/`, which is generated and not committed. `src/hooks.server.ts` runs the Paraglide middleware only for marketing routes, and `src/hooks.ts` removes the locale prefix before routing. The app, docs, and blog are English only.

## Project Structure

```
src/
├── lib/
│   ├── ai/               # Prompt building and response parsing
│   ├── components/
│   │   ├── chat/         # Chat bar, chat window, speech bubble, photoboard
│   │   ├── display/      # Screen wake lock
│   │   ├── docs/         # Documentation site components
│   │   ├── events/       # Event scene and choice UI
│   │   ├── icons/        # Icon components
│   │   ├── marketing/    # Landing page components
│   │   ├── memory/       # Memory graph, inspector, parser test
│   │   ├── onboarding/   # First-run setup
│   │   ├── overlay/      # Desktop overlay controls
│   │   ├── photomode/    # Photo mode dock, stickers, frame preview
│   │   ├── settings/     # Settings sections
│   │   ├── ui/           # Shared UI primitives
│   │   ├── updater/      # Desktop update banner
│   │   └── vrm/          # 3D scene, model, AR placement
│   ├── config/           # Site links and docs navigation
│   ├── data/             # Event definitions
│   ├── db/               # Dexie schema, export and import
│   ├── engine/           # Pure engine modules (stages, heuristics, memory, events, moments)
│   ├── services/
│   │   ├── chat/         # Send loop, turn processing, direct streaming
│   │   ├── events/       # Generated moments
│   │   ├── lipsync/      # Audio to viseme analysis
│   │   ├── mcp/          # MCP protocol, HTTP and stdio clients, tool loop
│   │   ├── modules/      # Module registry for the chat and speech switches
│   │   ├── platform/     # Tauri and web detection, windows, hotkeys
│   │   ├── providers/    # Provider registry, defaults, URL guard, model discovery
│   │   ├── storage/      # IndexedDB access
│   │   ├── stt/          # Speech-to-text clients
│   │   └── tts/          # Text-to-speech clients and speech pipeline
│   ├── stores/           # Svelte 5 rune stores
│   ├── styles/           # Shared CSS
│   ├── types/            # TypeScript types
│   └── utils/            # Helpers
├── routes/
│   ├── api/              # Server routes (web build only)
│   ├── app/              # The app and its settings pages
│   ├── blog/             # Blog
│   ├── docs/             # Documentation site
│   ├── download/         # Download page
│   └── overlay/          # Desktop overlay window
└── content/
    ├── blog/             # Blog posts
    └── docs/             # Documentation pages
src-tauri/                # Tauri desktop shell (Rust)
tools/omnivoice/          # OmniVoice proxy (Python, Docker)
tests/browser/            # Playwright browser tests
```

## Key Interactions

### Expression Updates

1. The turn applies a mood change through `characterStore.applyUpdates()`.
2. `VrmModel.svelte` recomputes the mood target from `moodExpressionTarget()`.
3. Each frame it fades the old expression out before the new one comes in.
4. If the reply set `expression`, `vrmStore.requestFlash()` layers a short reaction on top.

### Event Triggering

1. After the state update, `companion-turn.ts` checks for a stage change. A demotion fires the relationship strain event.
2. Otherwise `checkAllEvents()` tests every event's conditions and cooldowns and picks the highest priority.
3. The page opens the event scene, generating the moment text if possible.
4. Choosing an option records the completion and applies the choice's state changes.

Events only fire in Dating Sim Mode and never on system-event turns.

## Desktop Application (Tauri)

The desktop app wraps the same SvelteKit build with Tauri v2. It uses the static build, so there are no server routes: chat, model lists, MCP, and Fish Audio all go straight from the app.

### Platform Layer

**Key files:**
- `src/lib/services/platform/platform.ts`: `isTauri()` and `isDesktopBuild()`
- `src/lib/services/platform/window.ts`: window dragging for the overlay
- `src/lib/services/platform/hotkeys.ts`: global shortcuts for push-to-talk, toggling the overlay, and focusing chat

```typescript
import { isTauri } from '$lib/services/platform';

if (isTauri()) {
  await startDragging();
}
```

### Windows

`src-tauri/tauri.conf.json` declares two windows:

| Window | Route | Notes |
|--------|-------|-------|
| `main` | `/app` | The full app |
| `overlay` | `/overlay` | Transparent, undecorated, always on top, hidden from the taskbar, hidden at launch |

`src-tauri/src/lib.rs` defines two commands. The overlay button calls `show_overlay` and then hides the main window. The overlay hotkey calls `toggle_overlay`. Leaving the overlay shows and focuses `main`, then hides the overlay. If the main window is gone, the overlay stays open and reports the error.

Both windows share IndexedDB and localStorage. Character state syncs over a BroadcastChannel, settings sync through `storage` events, and reminders use an atomic claim so only one window reacts.

### Overlay Rendering

1. The overlay window is `transparent` with no decorations.
2. The overlay page's background is transparent.
3. `src/lib/components/vrm/VrmScene.svelte` creates the renderer with `alpha: true`.
4. In overlay mode, `Scene.svelte` sets the scene background to `null` and calls `setClearColor(0x000000, 0)`.

**Key file:** `src/routes/overlay/+page.svelte`

### Updater

The updater plugin checks `latest.json` on the latest GitHub release. `src/lib/components/updater/UpdateBanner.svelte` runs a silent check at launch. `src/lib/stores/updater.svelte.ts` downloads and installs the signed update, then relaunches through the process plugin. Releases are built as drafts and published by a maintainer; publishing is what makes an update visible to installed apps.

### Capabilities

`src-tauri/capabilities/default.json` grants window control, global shortcuts, the updater, file reads under the user's folders (with `.ssh`, `.aws`, `.gnupg`, and `.config` denied), file writes to Downloads, and HTTP to any `http` or `https` URL. The open HTTP scope exists because MCP servers are configured at runtime.

## Technologies

| Category | Technology |
|----------|------------|
| Framework | SvelteKit 2, Svelte 5 |
| Language | TypeScript |
| 3D rendering | Three.js with Threlte |
| VRM support | @pixiv/three-vrm, @pixiv/three-vrm-animation |
| LLM streaming | xsAI SDK on the server route, fetch for direct calls |
| Desktop | Tauri v2 |
| Styling | Tailwind CSS 4 |
| Database | Dexie (IndexedDB) and localforage |
| Embeddings | Transformers.js |
| Memory graph | force-graph |
| Language detection | ELD |
| i18n | Paraglide JS (marketing pages) |
| Build tool | Vite |
