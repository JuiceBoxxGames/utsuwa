---
title: Web Guide
description: A tour of Utsuwa in the browser, from first setup to the main screen, voice, photos, photo mode, AR, reminders, memory, and backups.
---

# Web Guide

This guide walks you through Utsuwa in a browser, on the hosted app or your own instance. Each section is short and links to a deeper page. For the desktop app, see the [Desktop Guide](/docs/guides/desktop-guide).

## Getting started

### The hosted app

Open [app.utsuwa.ai](https://app.utsuwa.ai). There is nothing to install. Your data stays in that browser on that device. Another browser or device starts empty until you import a save.

### Self-hosting

You need Node.js 22 or newer and pnpm.

```bash
git clone https://github.com/JuiceBoxxGames/utsuwa.git
cd utsuwa
pnpm install
pnpm dev
```

Open `http://localhost:5173/app`.

Cloud chat providers, model lists, and Fish Audio go through the app's own server routes, so a deployment needs a host that runs SvelteKit server code. Two optional environment variables change what the server may do:

- `ALLOW_LOCAL_PROVIDER_HOSTS=true` lets the server reach providers on private addresses. It also lets it relay speech to a local TTS engine that blocks the browser. See [Voice Providers](/docs/guides/voice-providers#local-tts-and-omnivoice).
- `MCP_ENABLED=server` turns on MCP tools. See [MCP Servers](/docs/guides/mcp).

## First-run setup

The first time you open the app, a setup wizard walks you through seven short steps. You finish it with its last button; clicking outside or pressing `Esc` does not close it.

1. **Welcome.** Click **Get started**.
2. **Choose your avatar.** Keep **Default** or click **Upload VRM** to add your own `.vrm` model.
3. **Name your companion.** Enter a **Name** and a **Core personality**. The personality shapes how she talks and behaves.
4. **Choose your mode.** **Dating sim** is a relationship that grows over time, with moods, events, and eight stages. **Companion** is a friendly assistant for conversation and everyday help. Dating sim is selected first.
5. **Connect a chat model.** Pick a provider and enter its API key, or pick Ollama or LM Studio and point it at your local server. Then pick a model. **Advanced options** holds the context window setting. **Next** unlocks once chat is set up.
6. **Want to hear them?** Turn on **Spoken replies** and set up a voice provider, or leave it off.
7. **Meet your companion.** Click **Start chatting**, or **Open companion** if you skipped chat.

Both service steps have **Set up later**, which skips that step. You can finish chat in Settings > LLM Model and voice in Settings > TTS. API keys stay on your device and go only to the provider you choose.

To run the wizard again without losing anything, open `/app?onboarding=1`.

## The main screen

Your companion fills the screen. Controls sit in the corners and along the bottom.

### Top left

| Button | What it does |
|---|---|
| Camera | Opens [photo mode](#photo-mode). |
| Brain | Opens the memory graph in Settings > Memory. |
| Photoboard | Shows the photos you have shown her ("Things you've shown her"). |

### Top right

| Button | What it does |
|---|---|
| Bell | Your reminders and timers. A badge counts the open ones. See [Reminders and timers](#reminders-and-timers). |
| Info | App version, links to GitHub and these docs, and checks for speech recognition, 3D graphics, and local storage. |
| Controls (sliders) | Opens four more buttons: **Settings** (gear), **Camera** (video icon), the **theme** button, and **AR** (cube). |

The desktop app adds a blue overlay button here. See the [Desktop Guide](/docs/guides/desktop-guide#main-window-and-overlay).

### The chat bar

Type in **Type a message...** and press `Enter` to send. `Shift+Enter` adds a new line. The bar also holds:

- **Her name**, with a mood icon. Click it for **Companion stats**: her mood, energy, relationship meters (Dating sim), and time together.
- **Attach** (paperclip), to [show her a photo](#showing-her-photos).
- **Microphone**, for [voice input](#voice-input).
- **Send**.

While she works on a reply, a label shows what she is doing: **Remembering...**, **Looking at your photo...**, or **Thinking...**. Small indicators float up when her stats change. Errors show as a message you can click to dismiss.

### Immersive and chat window layouts

Settings > Display > **Conversation layout** has two options.

- **Immersive** (the default): her reply appears in a speech bubble that follows her head. Click the bubble to dismiss it. The input bar floats at the bottom, aligned left, center, or right.
- **Chat window**: a docked **Conversation** panel shows the messages of this session, each with a copy button. The input moves into the panel. The trash button clears the visible history after you confirm. The panel sits beside her on wide screens and below her on small ones, on the side you choose.

The visible chat history lasts until you reload. Her memory of your conversations stays. Settings > Display also sets the text reveal speed, the typing indicator delay, and an optional wait tone. See the [Settings Reference](/docs/guides/settings-reference#display).

## Voice

### Her voice

Turn on **Speech (TTS)** in Settings > TTS and pick ElevenLabs, OpenAI TTS, Fish Audio, Local TTS, or OmniVoice. She speaks each reply with lip sync. See [Voice Providers](/docs/guides/voice-providers).

### Voice input

Click the microphone, speak, and click stop. Utsuwa transcribes what you said and sends it. It uses the first of these that is set up in Settings > STT:

1. A local Whisper server
2. Groq
3. OpenAI
4. Your browser's built-in Web Speech recognition, which needs no setup and listens for US English

See [Voice Providers](/docs/guides/voice-providers#voice-input) and [Local STT Setup](/docs/guides/local-stt-setup).

## Showing her photos

With a vision-capable model, she can see images you show her.

- Click the paperclip, or drag an image anywhere onto the page. A preview chip appears above the input. Add a message if you like and send.
- JPEG, PNG, GIF, and WebP work. iPhone HEIC photos do not.
- The first time, a notice tells you where photos go. With a cloud provider, the photo is sent to that provider. With Ollama or LM Studio, it stays on your machine.
- After she replies, the photo is kept on your device on the photoboard, with her impression as a note.

Photos need a vision model on OpenAI, Anthropic, Google Gemini, xAI, Ollama, or LM Studio, such as GPT-4o, Claude, Gemini, or LLaVA. Utsuwa decides from the model name. With a text-only model, DeepSeek, or the OpenAI-Compatible provider, the paperclip shows a hint instead.

## Photo mode

Click the camera button (top left). The chat hides and a **Photo Mode** panel opens with Camera, Pose, Face, Scene, and Sticker tabs. Pose her, set her expression, pick a background, filter, and frame, add stickers, then click **Snap** or **Capture**. Photos download as PNG files. Press `Esc` to leave.

See [Scene and Photo Mode](/docs/guides/scene-and-photo-mode#photo-mode) for every control.

## Touch

Tap her and she reacts with an expression and a ripple through her hair and clothes. Where you tap and how close you two are both change the reaction. Dragging orbits the camera and never counts as a tap. See [Touch reactions](/docs/guides/scene-and-photo-mode#touch-reactions).

## Scene controls

Open **Controls**, then **Camera** (video icon):

- **Camera**: Zoom, Height, Horizontal pan, and Field of view, with **Reset camera**
- **Background**: gradients, patterns, solids, or your own JPEG, PNG, or WebP image
- **Physics**: **Movement intensity**, from Subtle to Lively

All of it is saved on this device. See [Scene and Photo Mode](/docs/guides/scene-and-photo-mode).

## AR

On Chrome for Android or the Meta Quest browser, the cube button in **Controls** puts her in your room through the camera. Drag to move her and pinch to resize. On other devices the button explains what AR needs. See [AR mode](/docs/guides/scene-and-photo-mode#ar-mode).

## Reminders and timers

Ask her in chat: "Remind me in 10 minutes to stretch." She schedules it and brings it up herself when it is due.

The bell (top right) lists:

- **Open tasks**, with how long until each one. The trash button deletes one.
- **Fired or missed**, for reminders that went off, including ones that came due while the app was closed. The check button dismisses one.

Reminders survive a reload and stay in sync with the desktop overlay.

## Memory

She remembers facts about you, your conversations, and the photos you show her. Settings > Memory lets you browse, search, add, and delete memories, and shows a graph of how they connect. See [Memory](/docs/guides/memory).

## Backups

Everything lives on your device. Settings > Data > **Download Save File** exports your character, memories, and conversation history as a JSON file. **Import Save** restores it, replacing or merging with what you have. Keys, settings, avatars, animations, and photos are not in the save. See [Backups](/docs/guides/memory#backups-export-and-import).

## Keep the screen awake

Settings > Display > **Keep screen awake** stops the display from sleeping while Utsuwa is visible, where the browser supports it. It is off by default and can use more battery.

## Themes

Utsuwa has light and dark themes. The theme button in **Controls** cycles **System**, **Light**, and **Dark**. You can also set it in Settings > Display > **Color theme**. System follows your device.
