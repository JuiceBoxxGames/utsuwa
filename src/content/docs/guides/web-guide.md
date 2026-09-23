---
title: Web Guide
description: How to set up and use Utsuwa on the web.
---

# Web Guide

This guide walks you through using Utsuwa, whether on the hosted version at [utsuwa.ai](https://utsuwa.ai) or a self-hosted instance.

## Self-Hosting Setup

### Prerequisites

- Node.js 22 or higher
- pnpm
- A modern browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
git clone https://github.com/JuiceBoxxGames/utsuwa.git
cd utsuwa
pnpm install
pnpm dev
```

The app will be available at `http://localhost:5173`.

## Initial Configuration

### 1. Configure an LLM Provider

Your companion needs an LLM to generate responses.

1. Open the **Controls** panel (sliders icon, top right) and click the **Settings** (gear) button
2. Navigate to the **Character** tab and open the **AI Services** section
3. Enable the Chat (LLM) toggle, then select a provider from the dropdown and enter your API key
4. Alternatively, use a local server like Ollama or LM Studio (no API key needed)

All API keys are stored locally on your device and never sent anywhere except the respective provider's API.

### 2. Load a VRM Model

Utsuwa comes with a default avatar, but you can load your own:

1. Go to **Settings > Character**
2. Click **Add Custom** in the Avatar section and select a local `.vrm` file (drag-and-drop works too)

### 3. Configure Text-to-Speech (Optional)

To have your companion speak responses aloud:

1. Go to **Settings > Character** and open the **AI Services** section
2. Enable the Speech (TTS) toggle, then select a provider (ElevenLabs, OpenAI TTS, Fish Audio, or Local TTS)
3. Enter your API key (cloud providers) and configure voice settings

## Using the Chat

Type a message in the bottom chat bar and press Enter. Your companion's response will appear as a 3D speech bubble tracking the avatar's head.

If TTS is enabled, the avatar will speak the response with lip-synced animation.

## Voice Input

Click the microphone button in the chat bar to use speech-to-text. Three options are available:

- **Local Whisper server** — Self-hosted, OpenAI-compatible transcription (Speaches, faster-whisper-server, whisper.cpp) via the `/v1/audio/transcriptions` endpoint. Audio never leaves your machine. Configure it in **Settings > Character** under Voice Input (STT) with a base URL (default `http://localhost:8000/v1/`) and a model name.
- **Groq or OpenAI Whisper** — Higher-quality cloud transcription via Groq's or OpenAI's Whisper API. Requires the respective API key, added in the same Voice Input (STT) section.
- **Web Speech API** — Built into your browser (Chrome, Edge, Safari). No API key required. The default in the browser when nothing else is configured.

Selection is automatic by priority: a configured local server wins, then Groq, then OpenAI, then Web Speech. On the desktop app the Web Speech API is unavailable, so configure either a local Whisper server or a Groq key for voice input.

See [Local STT Setup](/docs/guides/local-stt-setup) for running a local Whisper server.

## Photo Mode

Click the **camera button** (top left) to open Photo Mode. A compact tabbed panel appears in the corner:

- **Camera** — lens (field of view) slider, a head-tracking toggle so she looks at your camera, a rule-of-thirds grid, and framing reset. Orbit, pan, and zoom freely while posing
- **Pose** — hold a pose from the pose library, or Natural for her regular stance
- **Face** — pick from the expressions your model actually ships
- **Scene** — background presets (including transparent for stickers), color filters, a vignette, and polaroid or film frames
- **Sticker** — drop stickers on the shot, drag to move, scroll to resize, double-click or use the list to remove

Capture at high resolution, take a quick snap, or use the 3 second self-timer. What you see in the preview is exactly what the file contains. Captures land in your Downloads folder on both the web and desktop apps; they are kept out of the photoboard, which stays reserved for images you have shown her. Press Escape or the X to exit.

## Reminders and Timers

Ask her in chat: "remind me in 10 minutes to stretch." She schedules it, brings it up herself when it fires, and notices timers that came due while the app was closed. The alarm bell (top right) shows pending tasks and fired or missed reminders; dismissals persist. Reminders stay in sync between the main app and the desktop overlay.

## Touch

Tap her and she reacts: an expression and a small ripple through her hair and clothes. Where you tap matters, and so does your relationship stage; early on she is easily flustered, and warmer reactions come with closeness. A quick tap reacts; dragging orbits the camera and never triggers her.

## Scene Controls

The **Controls** panel (sliders icon, top right, then the camera icon) holds the scene:

- **Camera** — zoom, height, and field of view sliders with a reset
- **Background** — persistent scene backdrops: solids, pastel gradients (Sakura, Peach, Lavender, and more), and patterns (dots, hearts, sparkles, candy stripes, gingham)
- **Physics** — a Movement intensity slider from Subtle to Lively that scales spring-bone motion (hair, skirts, ribbons) while respecting each model's own tuning

## AR Mode

On WebXR-capable devices (Android Chrome, headset browsers), the cube icon in the Controls cluster places your companion in your real space: put her on your floor, drag her around, and pinch to resize. Entering Photo Mode ends an AR session first; photos always compose against the regular scene.

## Data Management

All data is stored locally on your device.

- **Export** — Go to Settings > Data > Export Save to download a JSON backup
- **Import** — Go to Settings > Data > Import Save to restore from a backup
- **Merge or Replace** — Choose whether to add imported data to existing data or replace it entirely

## Themes

Utsuwa supports light and dark modes with automatic system preference detection. Open the **Controls** panel (sliders icon, top right) and click the theme button to cycle System, Light, and Dark.
