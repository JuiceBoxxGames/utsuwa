> [!WARNING]
> Utsuwa and Juice Boxx Games have not minted, launched, endorsed, or authorized any cryptocurrency, token, coin, NFT, or blockchain project. We never will. If you see crypto associated with Utsuwa or The Lab, it is a scam. This repository is the only authentic Utsuwa project repository.

<p align="center">
  <img alt="Utsuwa, an open-source AI companion you can see and talk to" src="static/brand-assets/banner-light.avif" width="100%">
</p>

<p align="center">
  <a href="https://utsuwa.ai">Website</a>
  ·
  <a href="https://app.utsuwa.ai">Try it in your browser</a>
  ·
  <a href="https://docs.utsuwa.ai">Docs</a>
  ·
  <a href="https://utsuwa.ai/blog">Blog</a>
  ·
  <a href="https://github.com/JuiceBoxxGames/utsuwa/releases">Releases</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/JuiceBoxxGames/utsuwa/releases"><img src="https://img.shields.io/github/v/release/JuiceBoxxGames/utsuwa?label=Release&color=00b2ff" alt="Latest release"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22+-green.svg" alt="Node.js 22+"></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs welcome"></a>
</p>

<p align="center">
  <a href="https://github.com/JuiceBoxxGames/utsuwa/releases/latest">
    <img alt="Download for macOS" src="static/brand-assets/download-buttons/macos-light.avif" width="31%">
  </a>
  <a href="https://github.com/JuiceBoxxGames/utsuwa/releases/latest">
    <img alt="Download for Windows" src="static/brand-assets/download-buttons/windows-light.avif" width="31%">
  </a>
  <a href="https://github.com/JuiceBoxxGames/utsuwa/releases/latest">
    <img alt="Download for Linux" src="static/brand-assets/download-buttons/linux-light.avif" width="31%">
  </a>
</p>

<p align="center">
  <sub>Beta builds are unsigned, so your OS will warn on first launch (<a href="#download-the-desktop-app">install notes</a>). Prefer zero install? <a href="https://app.utsuwa.ai">Run it in your browser</a>.</sub>
</p>

---

**Utsuwa is an open-source AI companion with 3D VRM avatars.** A platform where you can have a virtual companion that learns and grows with you, bundled with optional mechanics inspired by Japanese [dating sim](https://en.wikipedia.org/wiki/Dating_sim) games. Utsuwa is privacy-focused: your data is stored locally and never leaves your device.

"Utsuwa" means "vessel" in Japanese. A container for AI to inhabit visually.

<p align="center">
  <img alt="The Utsuwa app: a 3D VRM companion with chat, mood, and voice" src="static/marketing/companion-light.webp" width="100%">
</p>

## Features

- **VRM Model Viewer**: Load and display VRM 3D avatar models with orbit controls, automatic camera framing per model, and live camera settings (zoom, height, field of view)
- **Developer Tools**: Test VRM facial expressions and animations, or upload a temporary `.vrm` file for a non-persistent preview that reverts when you leave the page
- **AR Mode**: On WebXR-capable devices (Android Chrome, headset browsers), place your companion on your real floor, drag her around, and pinch to resize
- **Photo Mode**: Pose her from a pose library, set her expression, pick a background, add a color filter, vignette, or frame, drop draggable stickers on the shot, and capture in high resolution with a quick snap or self-timer. Head tracking keeps her eyes on your camera while she holds the pose
- **Touch Reactions**: Tap her and she reacts with an expression and a physics ripple through hair and clothes. Reactions depend on where you tap and how close the two of you are
- **Scene Backgrounds**: Swap the backdrop behind her for pastel gradients or cute patterns (dots, hearts, sparkles, stripes, gingham) right from the Controls panel; your pick persists
- **Physics Intensity**: A Movement slider from Subtle to Lively scales how much her hair and outfit respond to motion, respecting each model's own rig tuning
- **Model-Centric UI**: Full-screen 3D model with unobtrusive overlay controls
- **3D Speech Bubbles**: Chat responses appear as bubbles that track the model's head in 3D space, revealed word by word at a configurable speed
- **Chat Window**: Optional messenger-style floating window with the full conversation history and the input docked inside; drag it anywhere, resize from any edge, snap it left or right. Display modes (Immersive, Chat window, Both, Off) live in Settings > Display
- **Thinking Status**: A shimmer label narrates what she is actually doing (Remembering, Looking at your photo, Thinking), with a configurable delay and an optional soft audio ping
- **Chat Interface**: Floating input bar (left, center, or right aligned) with streaming responses
- **Voice Input**: Speech-to-text via a local Whisper server (Speaches, faster-whisper-server, whisper.cpp), Groq (Whisper), or the browser's Web Speech API, with real-time audio visualization
- **Show Her Photos**: Show your companion an image via the attach (paperclip) button in the chat bar or drag-and-drop. Vision-capable models (GPT-4o, Claude, Gemini, or local ones like LLaVA) actually see it and can remember the moment, and kept photos live on a scrapbook-style board. Images stay on your device and only ever reach vision-capable models
- **LLM Integration**: Support for 8 LLM providers: OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, LM Studio, and any OpenAI-compatible endpoint (OpenRouter, Together, vLLM, ...)
- **Local Model Discovery**: Ollama and LM Studio discover installed local models directly from your device
- **MCP Tools**: Connect Model Context Protocol servers — Home Assistant's official MCP integration, web search via SearXNG, and more — and let the companion call their tools during chat. Per-server HTTP/stdio transports, bearer-token authentication, and an `MCP_ENABLED=server` gate for self-hosted web deployments (see [MCP Servers](https://docs.utsuwa.ai/docs/guides/mcp))
- **Text-to-Speech**: Support for ElevenLabs and OpenAI TTS, local voices via any OpenAI-compatible server (Kokoro-FastAPI, openedai-speech), and local OmniVoice. OmniVoice streams: speech starts while the model is still writing, and foreign words can be spoken per word in their own language and voice. With OmniVoice + Alternative Voice, the model controls its spoken reply via native `speak_segment` / `pause_segment` / `gesture_segment` tool calls (when tool calling is enabled); otherwise the documented inline `speak()` / `pause()` / `gesture()` syntax is used
- **Fully Local Option**: Run the whole stack offline — local LLM (Ollama/LM Studio), local TTS, and local Whisper STT — so nothing leaves your device
- **Lip-sync**: Audio-driven mouth animation synced to TTS playback
- **Animations**: VRMA-based idle and talking animations with automatic blinking
- **Character Customization**: Customize your companion's name, personality, and system prompt
- **Avatar Tasks & Timers**: Your companion can schedule reminders for itself, e.g. to check back with you later. Fired and missed timers appear in the reminder dropdown (bell icon) so you can see what happened and dismiss them. Reminders persist across browser reloads and stay in sync between the main app and the desktop overlay
- **Companion System**: Multi-axis relationship tracking with mood, events, and semantic memory
- **Semantic Memory**: Local AI-powered memory search using Transformers.js - finds memories by meaning, not just keywords
- **Memory Graph**: Interactive visualization showing how memories connect semantically
- **Data Export/Import**: Download your data as a save file, restore anytime
- **Theming**: Light and dark mode support with system preference detection
- **Desktop App** *(beta)*: Native desktop app for macOS, Windows, and Linux with transparent overlay mode, so your companion floats on your desktop

### Local-First Storage

All your data is stored locally on your device using IndexedDB:
- No database setup required
- Works offline after initial load
- Export/import save files to back up or transfer your data
- Settings > Data to manage your save files

### Companion System

Build a meaningful relationship with your AI companion through a dating sim-inspired progression system:

- **Multi-axis Relationships**: Track affection, trust, intimacy, comfort, and respect separately
- **8 Relationship Stages**: Progress from Stranger → Acquaintance → Friend → Close Friend → Romantic Interest → Dating → Committed → Soulmate
- **Dynamic Mood**: Real-time emotions with causality tracking (she remembers *why* she feels a certain way)
- **Visual Novel Events**: Milestone moments, romantic scenes, and choices that matter - with custom dialogue and branching responses
- **Semantic Memory**: Facts are indexed with vector embeddings for meaning-based retrieval - "outdoor activities" finds memories about hiking. Runs locally using Transformers.js, no API calls
- **Natural Progression**: Hybrid system combining app heuristics + LLM suggestions for believable relationship growth
- **Time-Aware**: Your companion notices when you've been away and reacts accordingly
- **Scheduled Tasks**: The companion can set timers/reminders for itself. Timers that fired while the app was closed are marked as missed and shown in the reminder dropdown for you to review and dismiss. The list survives a browser reload and is kept in sync across the main app and overlay windows

See the [Companion System Architecture](https://docs.utsuwa.ai/technology/companion-system) for full details.

### Desktop Application (Beta)

A native desktop app built with Tauri that includes all web features plus:

- **Overlay Mode**: Your companion floats on your desktop with a transparent background
- **Always-on-Top**: The overlay stays visible over all other windows
- **Draggable Positioning**: Click and drag the character to reposition anywhere on screen, or lock her in place
- **Resizable Overlay**: Hover to reveal a soft frame and drag the corner tab to resize; your size is remembered
- **Overlay Camera**: A separate camera profile (zoom, height, FOV) tuned independently from the main app
- **Floating Chat**: Expandable chat input that appears when you click the chat icon, with replies in a readable docked bubble
- **Window Switching**: Seamlessly switch between the full app and overlay mode
- **Global Hotkeys**: Push-to-talk, toggle overlay, and focus chat with keyboard shortcuts

The desktop app uses the same codebase as the web version, and your save files are compatible between both.

## Supported Providers

### LLM Providers (8)

Utsuwa supports popular cloud and local LLMs. For endpoints that speak the OpenAI API (OpenRouter, Together, vLLM, LiteLLM, etc.), use the **OpenAI-Compatible** provider:
- Set the **Base URL** to the endpoint root (e.g. `https://api.openai.com/v1/`).
- **API Key** is optional; leave it empty for keyless local servers.
- Enter a model manually or fetch available models after providing a base URL.
- **Advanced Parameters** (temperature, top-p, max tokens, presence/frequency penalties) are passed to the endpoint when set.

| Category | Providers |
|----------|-----------|
| **Cloud** | OpenAI, Anthropic, Google Gemini, DeepSeek, xAI (Grok) |
| **Local** | Ollama, LM Studio |
| **OpenAI-Compatible** | OpenRouter, Together, vLLM, LiteLLM, etc. |

#### Context Window and Memory Budget

The **Context Window** setting is available for every LLM provider. When enabled, it tells Utsuwa how many tokens the selected model can process. The app then:

- Retrieves the matching number of recent conversation turns from working memory.
- Scales the amount of injected memory (recent conversation turns and relevant facts) to match the window size.
- Truncates older chat history before sending, always keeping the system prompt and the user's newest message.

If the setting is left off, Utsuwa keeps the historical defaults (10 retrieved turns, 6 injected turns, 5 facts) and does not truncate history. This is useful when you want the provider to handle its own context management.

### TTS Providers (4)

| Category | Providers |
|----------|-----------|
| **Cloud** | ElevenLabs, OpenAI TTS |
| **Local** | Local TTS (Kokoro-FastAPI, openedai-speech, any OpenAI-compatible server), OmniVoice |

OmniVoice is a fully local text-to-speech option that runs on your own GPU or CPU. It supports both built-in synthetic voices and custom voice clones, covers many languages, and can switch between two voices **per word**: when you are learning a language, foreign words and phrases are spoken in their own language and dialect (with an optional second voice), while the surrounding explanation stays in the primary voice. Speech starts while the model is still writing — complete sentences are synthesised as soon as they arrive. See [OmniVoice Setup](https://docs.utsuwa.ai/docs/guides/omnivoice) for installation instructions.

With OmniVoice and **Alternative Voice** enabled, the speech layer mandates native tool calling: the model delivers its spoken reply as `speak_segment` tool calls (plus `pause_segment` for silent pauses and `gesture_segment` for small gestures). These calls arrive whole, so they cannot be broken up by streaming chunk boundaries. Tool calling is **on by default** and can be disabled in the speech settings; when it is disabled (or the provider does not support it), the model uses the inline `speak()` / `pause()` / `gesture()` syntax instead — that inline path remains the documented fallback and its output is sanitised defensively.

Language switching has two layers. The model declares the language per segment via `speak_segment`; the speech orchestrator then validates and splits every segment against the session's language pair using the embedded language detector ([eld](https://www.npmjs.com/package/eld)), which is restricted to exactly the primary and the alternative language. Mixed sentences are additionally carved into language runs (anchored on articles, function words, diacritics and infinitive endings) so both halves keep their own voice. Every secondary language the proxy offers can be selected, but the signal tables are fleshed out for German, English and Spanish in every pair direction; other languages fall back to whole-segment detection only.

### STT Providers (4)

| Category | Providers |
|----------|-----------|
| **Local** | Local STT (Speaches, faster-whisper-server, whisper.cpp, any OpenAI-compatible `/v1/audio/transcriptions` server) |
| **Cloud** | Groq (Whisper), OpenAI (Whisper) |
| **Browser** | Web Speech API (no API key required) |

Voice input is accessed via the microphone button in the chat bar. Selection is automatic by priority: a configured local Whisper server wins, then Groq, then OpenAI, then the browser's Web Speech API. A local server or a cloud key works on any platform including desktop; Web Speech API works without an API key in Chrome, Edge, and Safari. See [Local STT Setup](https://docs.utsuwa.ai/docs/guides/local-stt-setup) to run a local Whisper server.

## Getting Started

> [!NOTE]
> Utsuwa is in its very early development stages. If you're using the app, **save your data often**. Early versions may not have backwards-compatible save states and could require manual reformatting.

### Try it Online

Use Utsuwa directly at **[app.utsuwa.ai](https://app.utsuwa.ai)**. No installation required.

### Download the Desktop App

Native desktop builds (with transparent overlay mode) are available for all three platforms on the [GitHub Releases](https://github.com/JuiceBoxxGames/utsuwa/releases) page:

| Platform | Download |
|----------|----------|
| **macOS** | `.dmg` (universal: Apple Silicon + Intel) |
| **Windows** | `.exe` installer |
| **Linux** | `.AppImage`, `.deb`, or `.rpm` |

> [!NOTE]
> The desktop app is in beta and currently **unsigned**, so your OS will warn you the first time you open it.
> - **macOS:** right-click the app → **Open** → **Open** (or run `xattr -dr com.apple.quarantine /Applications/Utsuwa.app`).
> - **Windows:** on the SmartScreen prompt, click **More info** → **Run anyway**.

### Self-Hosting

If you prefer to run Utsuwa locally or host your own instance:

#### Prerequisites

- Node.js 22+
- pnpm (recommended) or npm
- A modern browser (Chrome, Firefox, Safari, Edge) for the web version

#### Installation

```bash
# Clone the repository
git clone https://github.com/JuiceBoxxGames/utsuwa.git
cd utsuwa

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at `http://localhost:5173`

#### Running the Desktop App (Beta)

To run the desktop app from source, you'll need the [Rust toolchain](https://rustup.rs/) in addition to the web prerequisites:

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Run the desktop app
pnpm tauri dev
```

#### Configuration

1. Click the **Settings** (gear icon) in the sidebar
2. Navigate to **Settings > LLM Model** to configure your chat provider:
   - Enable Chat (LLM)
   - Select a cloud provider and enter your API key
   - Or select a local server like Ollama or LM Studio and choose an installed model from the discovered model dropdown
   - Optional: enable **Context Window** to scale memory injection and history truncation to your model's token limit
3. Configure text-to-speech in **Settings > TTS** (optional):
   - Select a TTS provider
   - Enter your API key
   - Configure voice settings
    - For **OmniVoice**, design a synthetic voice (gender, age, pitch, accent), preview it, regenerate the persistent profile, or clone a new voice from a short audio sample. Optionally enable the **Alternative Voice** so foreign words are spoken in their own language with a second voice. Language switches are model-declared per segment and then validated per sentence and even mid-sentence by the embedded detector (quoted Spanish/English phrases, accents, characteristic word patterns), so each part keeps its own voice
4. Configure voice input in **Settings > STT** (optional):
   - Enter your Groq or OpenAI API key, or set a local Whisper server URL

All API keys are stored locally on your device and are never sent to any server except the respective API providers.

#### Loading a VRM Model

1. Go to **Settings > Character** and find the **Avatar** gallery
2. Pick one of the bundled models, or click **Add Custom** to upload your own `.vrm` file

#### Data Management

Your companion data is stored locally on your device. To back up or transfer your data:

1. Go to **Settings > Data**
2. Click **Export Save** to download a JSON file with all your data
3. To restore, click **Import Save** and select your save file
4. Choose **Replace** (wipe and restore) or **Merge** (add to existing)

## Project Structure

```
utsuwa/
├── src/
│   ├── lib/
│   │   ├── ai/             # LLM response parsing and prompt building
│   │   ├── assets/         # Static assets
│   │   ├── components/     # Svelte components
│   │   ├── config/         # App and docs configuration
│   │   ├── data/           # Event definitions and static data
│   │   ├── db/             # IndexedDB database (Dexie)
│   │   ├── engine/         # Companion engine (state, memory, events)
│   │   ├── services/       # LLM, TTS, STT, storage services
│   │   ├── stores/         # Svelte 5 stores (state management)
│   │   ├── styles/         # Shared CSS (prose, etc.)
│   │   ├── types/          # TypeScript types
│   │   └── utils/          # Utility functions
│   ├── content/
│   │   ├── blog/           # Blog post markdown content
│   │   └── docs/           # Documentation site markdown content
│   └── routes/
│       ├── app/            # Main application routes
│       ├── api/            # API routes
│       ├── blog/           # Blog routes
│       ├── docs/           # Documentation site routes
│       └── overlay/        # Desktop overlay route
├── src-tauri/               # Tauri desktop app (Rust)
├── static/
│   └── models/             # Place default VRM models here
├── tools/                   # Optional helpers and self-hosted integrations
│   └── omnivoice/          # Local OmniVoice TTS proxy
└── package.json
```

## Scripts

```bash
pnpm dev          # Start web development server
pnpm test         # Run the test suite (node --test)
pnpm build        # Build web app for production
pnpm preview      # Preview production build
pnpm lint         # Type-check the project (svelte-check)
pnpm check        # Same as lint (alias)
pnpm check:watch  # Type-check in watch mode
pnpm tauri dev    # Run the desktop app in development mode
pnpm tauri build  # Build desktop app installer
```

## Roadmap

### Completed

- [x] VRM model loading and display with orbit controls
- [x] 3D speech bubbles tracking model head position
- [x] Multi-provider LLM support (8 providers)
- [x] Multi-provider TTS support (4 providers)
- [x] Audio-driven lip-sync
- [x] VRMA-based animations (idle, talking, blinking)
- [x] Companion system with multi-axis relationships
- [x] 8-stage relationship progression (Stranger → Soulmate)
- [x] Visual novel event system with choices
- [x] Semantic memory system with local embeddings (Transformers.js)
- [x] Time-based mood and relationship decay/recovery
- [x] Local-first IndexedDB storage with export/import
- [x] Theme system with light/dark modes
- [x] Voice input via local Whisper server, Groq, OpenAI (Whisper), and Web Speech API
- [x] Desktop application with transparent overlay mode (macOS, Windows, and Linux)
- [x] Cross-platform desktop builds via CI (macOS, Windows, Linux)
- [x] In-app auto-updates for the desktop app
- [x] Show companion images (multimodal vision) with a keepsake photo board
- [x] Custom OpenAI-compatible LLM endpoint (OpenRouter, Together, Mistral, vLLM, LiteLLM, ...)
- [x] AR mode on WebXR-capable devices
- [x] Live camera settings (zoom, height, field of view) with per-overlay profiles
- [x] Context window control with memory scaling and history truncation
- [x] Reminders and timers with an alarm dropdown, multi-window aware
- [x] Photo mode: poses, expressions, backgrounds, filters, frames, stickers, head tracking, high-res capture
- [x] Relationship-staged touch reactions
- [x] Persistent scene backgrounds (pastel gradients and patterns)
- [x] Spring-bone physics intensity slider
- [x] OmniVoice Local TTS - Self-hosted OmniVoice proxy support for local text-to-speech
- [x] MCP Tool Calling - Connect Model Context Protocol servers (HTTP + stdio) and let the companion call their tools during chat, with per-server toggles and an `MCP_ENABLED=server` gate for self-hosted web deployments

### In Progress / Planned

- [ ] **File and Video Uploads** - Add support for attaching files and videos for multimodal LLM workflows and providers that can use richer context or web-aware tools (image support has shipped)
- [ ] **Live2D Support** - Alternative to VRM for 2D animated avatars
- [ ] **Hands-Free Voice Mode** - Full duplex conversation: speak naturally and she answers, no push-to-talk, with voice activity detection
- [ ] **Flexible Chat Layout** - Choose between the floating chat bar, a full conversation sidebar, or both at once

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and contribute to the project.

## Security

For information about security considerations and how to report vulnerabilities, please see our [Security Policy](SECURITY.md).

## Acknowledgments

Utsuwa is built on the shoulders of these excellent projects:

### Inspiration

- **[Airi](https://github.com/moeru-ai/airi)** - The original inspiration for this project. A beautiful AI companion with VRM avatar support.
- **[Amica](https://github.com/semperai/amica)** - Open-source AI companion with VRM support and emotional expressions.
- **[Riko Project](https://github.com/rayenfeng/riko_project)** by [JustRyan](https://www.youtube.com/@JustRayen) - AI waifu project showcasing VRM avatar interactions.

### Core Technologies

- **[@pixiv/three-vrm](https://github.com/pixiv/three-vrm)** - VRM model loading and rendering for Three.js
- **[xsAI](https://github.com/moeru-ai/xsai)** - `@xsai/stream-text` streams cloud LLM responses on the hosted web deployment
- **[Three.js](https://github.com/mrdoob/three.js)** - 3D graphics engine
- **[Threlte](https://github.com/threlte/threlte)** - Svelte components for Three.js
- **[SvelteKit](https://github.com/sveltejs/kit)** - Web application framework
- **[Tauri](https://github.com/tauri-apps/tauri)** - Desktop application framework
- **[Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)** - Utility-first CSS framework
- **[Transformers.js](https://github.com/xenova/transformers.js)** - In-browser ML for semantic memory embeddings

### UI & Data

- **[bits-ui](https://github.com/huntabyte/bits-ui)** - Headless UI components for Svelte
- **[Dexie.js](https://github.com/dexie/Dexie.js)** - IndexedDB wrapper for local storage
- **[force-graph](https://github.com/vasturiano/force-graph)** - Force-directed graph visualization for memory graph
- **[simple-icons](https://github.com/simple-icons/simple-icons)** - SVG icons for provider logos

## License

Utsuwa is licensed under the [GNU AGPL-3.0-or-later](LICENSE). In plain terms: you can use, modify, self-host, and redistribute it freely, and if you offer a modified version to others, including over a network, you share your changes under the same license.

Releases up to and including 0.12.0 were published under the MIT License and remain so. Code contributed under MIT is carried forward with its attribution intact.

## Star History

<a href="https://www.star-history.com/?repos=JuiceBoxxGames%2Futsuwa&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=JuiceBoxxGames/utsuwa&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=JuiceBoxxGames/utsuwa&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=JuiceBoxxGames/utsuwa&type=date&legend=top-left" />
 </picture>
</a>
