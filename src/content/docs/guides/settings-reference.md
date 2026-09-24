---
title: Settings Reference
description: Every settings page in Utsuwa, section by section, with what each control does and its default.
---

# Settings Reference

Open settings from the **Controls** button (sliders icon, top right), then the gear. The sidebar lists the pages in this order: Character, Display, Animations, LLM Model, TTS, STT, MCP, Memory, Data, Developer.

- Type in **Search settings** to filter the sidebar. Press `/` to jump to the search field.
- Press `Esc` or choose **Back to companion** to return to the main screen.
- **MCP** only appears where MCP can run: the desktop app, or a self-hosted web build started with `MCP_ENABLED=server`.

Everything on these pages saves on this device as you change it. There is no Save button.

## Character

Settings > Character has two tabs: **Profile** and **State & activity**.

### Profile tab

**Identity**

| Control | What it does | Default |
|---|---|---|
| Name | What you call your companion. Saves when you leave the field. An empty name saves as "Utsuwa". | Utsuwa |

**Appearance**

| Control | What it does | Default |
|---|---|---|
| Avatar | A gallery of your models. Click a card to switch to it. | The bundled avatar |
| Add Custom | Opens **Upload Custom Model**. Drop a `.vrm` file or click to browse. The model is stored on this device and added to the gallery. | |

The gallery has no delete button. To remove uploaded models, use **Clear VRM Storage** in Settings > Developer, which removes all of them at once.

**Personality**

A free-text field for how your companion speaks, behaves, and sees the world. It becomes part of her system prompt. Changes save when you leave the field.

**Experience**

| Control | What it does | Default |
|---|---|---|
| Companion mode | **Dating sim** turns on relationship progression, stages, and events. **Companion** focuses on everyday conversation. Switching asks you to confirm with **Change mode**. Name and personality stay the same. | Dating sim |

### State & activity tab

A read-only view of how she is doing. It is the same summary you see when you click her name in the chat bar.

- **Companion state**: her current mood with its latest cause, Energy, and Mood intensity. In Dating sim mode it also shows the relationship stage and the Affection, Trust, Intimacy, Comfort, and Respect meters. **Time together** shows Days together, Interactions, Day streak, and Best streak.
- **Achievements** (Dating sim only): events you have completed, newest first.

## Display

Settings > Display controls appearance and how conversations show up.

### Appearance

| Control | What it does | Default |
|---|---|---|
| Color theme | **System** follows your device. **Light** and **Dark** force a theme. The theme button in the Controls cluster cycles the same setting. | System |

### Chat display

**Reset to defaults** in this section resets the conversation layout, dock side, input bar alignment, text reveal, wait tone, and typing delay.

| Control | What it does | Default |
|---|---|---|
| Conversation layout | **Immersive** shows replies as a speech bubble beside her and a floating input bar. **Chat window** docks a panel with the conversation history. | Immersive |
| Dock side | Only in Chat window layout. **Left** or **Right**. The panel sits beside her on wide screens and below her on small screens. | Right |
| Input bar alignment | Only in Immersive layout. Where the input bar sits along the bottom edge: **Left**, **Center**, or **Right**. | Center |
| Text reveal | How fast replies appear word by word: **Off**, **Slow**, **Normal**, or **Fast**. Off shows the full reply at once. | Normal |

### Typing indicator

| Control | What it does | Default |
|---|---|---|
| Wait tone | Plays a soft audio ping while the typing indicator is visible. | Off |
| Delay | Seconds to wait before the typing dots appear, from 0 to 10 in steps of 0.1. | 0 s |

### Behavior

| Control | What it does | Default |
|---|---|---|
| Keep screen awake | Keeps the display on while Utsuwa is visible. The line under it reports the real state: active, inactive, or not supported. If the browser declines, a **Try again** button appears. | Off |
| Mood expressions | Her resting face follows her mood, and she can flash brief reactions. Turn it off if your model's expressions read too strong. See [Expressions and Moments](/docs/guides/expressions-and-moments). | On |
| Personalized moments | She writes event scenes from what you have shared, in your language. Off plays the built-in scenes. | On |

## Animations

Settings > Animations manages the motions she can perform. **Play** on any row switches back to the main screen and plays the motion. See [Animations](/docs/guides/animations) for how she uses them.

### Base behavior

| Control | What it does | Default |
|---|---|---|
| Idle pool | Checkboxes for the motions she cycles through at random when nothing else is happening. Lists Idle 1 to Idle 5 plus your uploads. At least one must stay checked. | Idle 1 to Idle 5 |
| Thinking | A motion that loops while she works on a reply, before the first words arrive. Lists **None**, the idle motions, your uploads, and the built-in emotes. | None |

### Your animations

**Upload** takes one `.vrma` file. Each uploaded row has:

| Control | What it does | Default |
|---|---|---|
| Animation name | Editable, up to 60 characters. | The file name |
| Play | Plays the motion on the main screen. | |
| Delete | Removes the upload after a confirmation. This cannot be undone. | |
| Description | What the motion looks like, up to 300 characters. She reads this to decide when to use it. | Empty |
| Companion can use | Lets her trigger this motion during chat. | Off |

### Built-in emotes

Seven motions ship with the app: Show Full Body, Greeting, Peace Sign, Shoot, Spin, Model Pose, and Squat. You can edit their descriptions and the **Companion can use** switch, which starts on. You cannot rename or delete them.

## LLM Model

Settings > LLM Model configures the chat model.

| Control | What it does | Default |
|---|---|---|
| Chat (LLM) | Turns chat on. Off hides the other fields. | Off |
| Provider | OpenAI, Anthropic, Google Gemini, DeepSeek, xAI (Grok), Ollama, LM Studio, or OpenAI-Compatible. | None |
| API key | Shown for cloud providers. For OpenAI-Compatible it reads **API key (optional)**. | Empty |
| Base URL | Shown for Ollama, LM Studio, and OpenAI-Compatible. Leave it empty to use the default (`http://localhost:11434` for Ollama, `http://localhost:1234/v1/` for LM Studio). A **Having trouble?** link opens the Ollama origin guide. | Empty |
| Model | A dropdown of models from your provider. Cloud providers list models after you enter a key. Ollama and LM Studio list what is installed. The refresh button reloads the list. | None |
| Context Window | Off means **Default**. On, a slider from 1k to 128k scales memory and chat history to fit your model's context window. | Off (8k when first turned on) |

For **OpenAI-Compatible** the Model field is a text box, with a **Pick a fetched model...** dropdown once a base URL is set. This provider also has **Advanced Parameters**:

| Control | What it does | Default |
|---|---|---|
| Temperature | Randomness, from 0 (focused) to 2 (very creative). | 0.70 |
| Top P | Nucleus sampling, from 0 to 1. 1 disables it. | 1.00 |
| Max Tokens | Hard limit on response length. Empty uses the provider default. | Empty |
| Presence Penalty | Reduces repetition of tokens already used, from -2 to 2. | 0.0 |
| Frequency Penalty | Stronger penalty for frequently repeated tokens, from -2 to 2. | 0.0 |

See [Local LLM Setup](/docs/guides/local-llm-setup) for Ollama and LM Studio.

## TTS

Settings > TTS configures her voice. The page header reads **Text-to-Speech**.

| Control | What it does | Default |
|---|---|---|
| Speech (TTS) | Turns spoken replies on. | Off |
| Provider | ElevenLabs, OpenAI TTS, Fish Audio, Local TTS, or OmniVoice. | None |
| API key | ElevenLabs, OpenAI TTS, and Fish Audio. | Empty |
| Model | Cloud providers. Enter the key first. ElevenLabs and OpenAI TTS load models from your account. Fish Audio lists S2.1 Pro, S2.1 Pro Free, S2 Pro, and S1. | The first model in the list |
| Voice ID | ElevenLabs and Fish Audio. Type a voice id or pick a suggestion. Fish Audio also accepts a fish.audio voice link. | Rachel (ElevenLabs), Sarah (Fish Audio) |

**Local TTS** shows three fields instead:

| Control | What it does | Default |
|---|---|---|
| Voice | A voice your server knows. Suggestions are Kokoro voices. | `af_bella` |
| Model (optional) | The model name your server expects. | `kokoro` |
| Base URL | Your server's address. Empty uses the default. | `http://localhost:8880/v1/` |

**OmniVoice** shows its own panel:

- **OmniVoice Proxy**: the proxy address, with a status of Connected, Connecting..., or Not reachable. Empty uses `http://localhost:8881/v1/`.
- **Primary voice**: Language (default English), Voice (default Alloy), Mode (**Synthetic** or **Cloned**), **Regenerate**, **Test**, Speed (0.5 to 2.0, default 1), Num Step (4 to 64, default 32), Position Temperature (0 to 2, default 1), and Class Temperature (0 to 2, default 0.2).
- **Alternative voice**: the **Speak foreign words with a second voice** checkbox (off), then Language, Voice, **Force language per segment** (on), Mode, **Test Alt Voice**, and the Alt Speed, Alt Num Step, Alt Position Temperature, and Alt Class Temperature sliders.
- **Clone New Voice** (Cloned mode): Reference Audio (3 to 10 seconds), Voice Name, and Reference Text.

Speed is only exposed in the OmniVoice panel. See [Voice Providers](/docs/guides/voice-providers), [Local TTS Setup](/docs/guides/local-tts-setup), and [OmniVoice Setup](/docs/guides/omnivoice).

## STT

Settings > STT configures voice input. The page header reads **Voice Input**.

The order of use is fixed: a local server first, then Groq, then OpenAI, then the browser's built-in recognition. The desktop app has no built-in recognition, so it needs one of the first three.

### Cloud providers

| Control | What it does | Default |
|---|---|---|
| Groq API key | Uses Groq's Whisper (`whisper-large-v3-turbo`). | Empty |
| OpenAI API key (Whisper) | Uses OpenAI's `whisper-1`. | Empty |

### Local server

| Control | What it does | Default |
|---|---|---|
| Server URL | Your OpenAI-compatible transcription server. Filling this in is what turns the local server on. | Empty (placeholder `http://localhost:8000/v1/`) |
| Model | The model your server should use. Empty uses `Systran/faster-whisper-large-v3`. | Empty |
| Transcription timeout (seconds) | How long to wait for the server, from 5 to 600. Raise it for slow or CPU-only machines. Only the local server uses it; Groq and OpenAI use 30 seconds. | 30 |

See [Voice Providers](/docs/guides/voice-providers#voice-input) and [Local STT Setup](/docs/guides/local-stt-setup).

## MCP

Settings > MCP connects Model Context Protocol servers so she can call their tools in chat. The page header reads **MCP Servers**. On desktop a **Desktop mode** note explains that only HTTP servers connect there.

**Servers**

**Add Server** opens a form:

| Control | What it does | Default |
|---|---|---|
| Name | A label for the server. Required. | Empty |
| Transport | **HTTP** or **stdio**. stdio only runs on self-hosted web builds that allowlist the command with `MCP_STDIO_ALLOWED_COMMANDS`. | HTTP |
| URL | HTTP only. The server endpoint. Required. | Empty |
| Auth | HTTP only. **None** or **Bearer**. | None |
| Token | Bearer only. Required when Bearer is chosen. | Empty |
| Command, Arguments, Env Vars | stdio only. Env Vars take one `KEY=value` per line. | Empty |
| Inject text tool results as user messages | Helps local models that ignore tool-role messages. | Off |

Each saved server has an enable switch, **Edit server**, and **Remove server**.

**Available Tools** lists the tools your enabled servers expose. **Refresh** reloads them. See [MCP Servers](/docs/guides/mcp).

## Memory

Settings > Memory has four tabs: **Graph**, **Facts**, **Sessions**, and **Settings**. See [Memory](/docs/guides/memory) for how memory works.

- **Graph**: connections between memories. **Expand graph** opens it full size. Category toggles filter it, **Reset view** re-centers it, and **Inspect a memory** selects a node from a list. Selecting a node shows **Memory details** with **Open in Facts**.
- **Facts**: **Remembered facts** with **Search memories** and a **Category** filter (All categories, About you, Relationship, Shared experience). Each fact has **Delete**, which asks you to confirm with **Delete memory**. **Add a memory** takes the text (up to 2,000 characters), a **Memory category** (default About you), and **Importance** from 0 to 100 (default 50).
- **Sessions**: **Current** shows the saved turns of this session. **Saved** shows recorded session summaries.
- **Settings**: **Memory storage** links to Settings > Data. **Advanced** holds **State**, a read-only character state view, and **Parser test**, which shows how a sample response would be parsed without changing anything.

## Data

Settings > Data backs up and restores your save. The page header reads **Data Management**.

| Control | What it does |
|---|---|
| Download Save File | Under **Export Save**. Downloads a JSON save with your character state, memories, conversation history, sessions, and completed events. On desktop it goes to your Downloads folder. |
| Import Save | Choose a `.json` save. A preview shows the export date, character name, and record counts. Pick **Replace** (the default: clear existing data and import) or **Merge** (add to existing data and skip duplicates), then **Import**. The app reloads when done. |
| Clear All Data | Asks for confirmation with **Yes, Delete Everything**, then reloads. See [what it removes](/docs/guides/memory#what-clear-all-data-removes). |

The save file does not include API keys and settings, avatars, animations, background images, photos, or reminders.

## Developer

Settings > Developer has a live viewport and test tools. The page header reads **Developer Tools**.

- **Temporary VRM Model**: **Upload VRM** previews a model in memory only. **Restore Original**, or leaving the page, brings your avatar back.
- **Animation**: plays any available animation, or **None (idle)**.
- **Material Debug**: renders MToon material properties (Normals, Lit/Shade Rate, UV Coordinates).
- **Quick Tests**: Test Blink, Test Smile, Test Surprised, Test Sad, Test Mouth Open, and Reset All.
- **Event System**: opens test event scenes on the main screen.
- **Storage**: **Clear VRM Storage** removes every uploaded avatar. **Reset Character Data** deletes the whole local database, including memories, sessions, events, and reminders. Neither asks for confirmation.
- **Available Expressions**: every expression name your model has, followed by sliders grouped as Eyes, Brows, Mouth, and Other for the ones the page knows.
