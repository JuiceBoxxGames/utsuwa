---
title: Local STT Setup
description: Run speech-to-text entirely on your machine with an OpenAI-compatible Whisper server (Speaches, faster-whisper-server, whisper.cpp).
---

# Local STT Setup

If you already run local LLMs with Ollama or LM Studio and a local voice with Local TTS, you can transcribe your voice locally too. The audio is processed on your machine, so nothing leaves the device and there are no API keys or per-minute costs.

Utsuwa talks to any server that exposes the OpenAI `/v1/audio/transcriptions` endpoint. It records from your microphone, sends the clip to that endpoint, and uses the returned text as your message.

## Speaches (recommended)

[Speaches](https://github.com/speaches-ai/speaches) (formerly faster-whisper-server) serves Whisper transcription through the OpenAI API and runs well on CPU.

### Installation

The quickest path is Docker:

```bash
docker run -p 8000:8000 ghcr.io/speaches-ai/speaches:latest-cpu
```

If you have an NVIDIA GPU, use the CUDA image instead. See the project README for non-Docker installs.

This serves the API at `http://localhost:8000/v1`.

### Connecting to Utsuwa

1. Open **Settings** (gear icon)
2. Open the **STT** page
3. Under **Local server**, enter the base URL. Leave it as `http://localhost:8000/v1/` unless you changed the port
4. Set the **Model** field to a model your server exposes (e.g. `Systran/faster-whisper-large-v3`)
5. Click the microphone button in the chat bar and speak

A configured local server takes priority over Groq, OpenAI, and the browser's Web Speech API automatically — there's no separate toggle.

### Models

Speaches uses Hugging Face model IDs such as `Systran/faster-whisper-large-v3` (best quality) or `Systran/faster-whisper-medium` (faster). The server downloads the model on first use. Check the models your server has with `curl http://localhost:8000/v1/models`.

## faster-whisper-server and whisper.cpp

Any OpenAI-compatible transcription server works. [whisper.cpp](https://github.com/ggerganov/whisper.cpp) ships a server (`whisper-server`) that exposes the same endpoint — point Utsuwa's Local STT base URL at it and use the model name it serves. Older [faster-whisper-server](https://github.com/fedirz/faster-whisper-server) installs behave like Speaches.

## Custom Base URL

Running the server on a different machine or port? Enter the full URL in the Local STT base URL field. Utsuwa normalizes it to end in `/v1`, so `http://localhost:8000`, `http://localhost:8000/v1`, and `http://localhost:8000/v1/` all work. Examples:

- Custom port: `http://localhost:9000/v1/`
- Remote machine: `http://192.168.1.50:8000/v1/` (desktop app only, see below)

## Desktop app vs hosted website

Local STT works best in the **desktop app**, where it needs no extra setup. The desktop app talks to your local server directly, with no browser origin, mixed-content, or local-network restrictions.

On the **hosted website** (`https://app.utsuwa.ai`) it can still work, but because a public HTTPS page is reaching a server on your own machine, the browser adds a few rules:

- **Same machine only.** The server has to be on `localhost` / `127.0.0.1`. A server on another machine over plain `http://` is blocked by the browser as mixed content. (`localhost` is exempt, which is the only reason the local case works.) The remote-machine base URL above therefore works in the desktop app but not on the hosted site.
- **The server must allow the site's origin.** Your STT server needs to send CORS headers permitting `https://app.utsuwa.ai`. A hardened or proxied server may need the origin added explicitly. (In that case the desktop app's origin is `tauri://localhost` on macOS and `http://tauri.localhost` on Windows and Linux.)
- **Your browser may ask permission.** Recent versions of Chrome treat a public site reaching `localhost` as a local-network request and may prompt you to allow it. Allow it if asked.

With a default server, none of this applies to the desktop app. The only case that needs attention is a server you've hardened to restrict origins, which would need the desktop origin above allowed. This is the same set of rules local LLMs and Local TTS follow on the hosted site.

## Troubleshooting

### "Could not reach a local STT server"

The server isn't running or isn't reachable at the base URL. Confirm it's up:

```bash
curl http://localhost:8000/v1/models
```

If that returns data but Utsuwa still can't reach it from a browser, it's almost certainly an origin or local-network block. On the hosted site the server has to allow the `https://app.utsuwa.ai` origin, and your browser may prompt to allow access to local-network devices. See [Desktop app vs hosted website](#desktop-app-vs-hosted-website). None of this applies to the **desktop app**, which is the smoothest way to run local STT.

### 400 or 404 from the server

The model name isn't valid for that server. Check the available models with `curl http://localhost:8000/v1/models` and set the Model field to one of them.

### No transcription after speaking

Make sure your microphone is allowed for the site (browser permission prompt), and that the Model field is set. Watch the microphone button — it shows a transcribing state after you stop speaking while the server processes the clip.
