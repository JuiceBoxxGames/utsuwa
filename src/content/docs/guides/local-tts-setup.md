---
title: Local TTS Setup
description: Give your companion a voice that runs entirely on your machine using Kokoro-FastAPI or openedai-speech.
---

# Local TTS Setup

If you already run local LLMs with Ollama or LM Studio, you can give your companion a local voice too. The audio is generated on your machine, so nothing leaves the device and there are no API keys or per-character costs.

Utsuwa talks to any TTS server that exposes the OpenAI `/v1/audio/speech` endpoint. The two we recommend are **Kokoro-FastAPI** and **openedai-speech**. Lip-sync works automatically because Utsuwa animates the mouth from the audio itself, no extra data needed.

For a fully local, multi-language voice that needs no external API, see the [OmniVoice Setup](/docs/guides/omnivoice) guide. The rest of this page covers generic OpenAI-compatible local TTS servers.

## Kokoro-FastAPI (recommended)

[Kokoro-FastAPI](https://github.com/remsky/Kokoro-FastAPI) wraps the Kokoro voice model and serves the OpenAI speech API directly. It is fast on CPU and sounds great for its size.

### Installation

The quickest path is Docker:

```bash
docker run -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

If you have an NVIDIA GPU, use the `kokoro-fastapi-gpu` image instead. See the project README for non-Docker installs.

This serves the API at `http://localhost:8880/v1`.

### Connecting to Utsuwa

1. Open the **Controls** panel (sliders icon, top right) and click **Settings** (gear)
2. Navigate to the **Character** tab and open the **AI Services** section
3. Enable the **Speech (TTS)** toggle, then select **Local TTS** from the provider dropdown
4. Leave the base URL as `http://localhost:8880/v1/` unless you changed the port
5. Pick a **voice** (start typing in the voice field to see suggestions like `af_bella`)
6. Leave **Model** blank to use the default, or set it to `kokoro`
7. Send a message and your companion speaks

### Voices

Kokoro voice names encode region and gender, for example `af_bella` (American female) or `bm_george` (British male). Utsuwa seeds a few common ones in the voice field, and you can type any voice your server supports.

## openedai-speech

[openedai-speech](https://github.com/matatonic/openedai-speech) is another OpenAI-compatible server that can run Piper and other engines. Set up its server, then point Utsuwa's Local TTS base URL at it (default `http://localhost:8000/v1/`). Use the voice names that server exposes.

## Custom Base URL

Running the server on a different machine or port? Enter the full URL in the Local TTS base URL field. Utsuwa normalizes it to end in `/v1/`, so `http://localhost:8880`, `http://localhost:8880/v1`, and `http://localhost:8880/v1/` all work. Examples:

- Custom port: `http://localhost:9000/v1/`
- Remote machine: `http://192.168.1.50:8880/v1/` (desktop app only, see below)

## Desktop app vs hosted website

Local TTS works best in the **desktop app**, where it needs no extra setup. The desktop app talks to your local server directly, with no browser origin, mixed-content, or local-network restrictions. If you want the smoothest experience, use the desktop app.

On the **hosted website** (`https://app.utsuwa.ai`) it can still work, but because a public HTTPS page is reaching a server on your own machine, the browser adds a few rules:

- **Same machine only.** The server has to be on `localhost` / `127.0.0.1`. A TTS server on another machine over plain `http://` is blocked by the browser as mixed content. (`localhost` is exempt from that block, which is the only reason the local case works at all.) The remote-machine base URL above therefore works in the desktop app but not on the hosted site.
- **The server must allow the site's origin.** Your TTS server needs to send CORS headers permitting `https://app.utsuwa.ai`. Kokoro-FastAPI and openedai-speech allow all origins by default, so this usually just works; a hardened or proxied server may need the origin added explicitly. (In that case the desktop app's origin is `tauri://localhost` on macOS and `http://tauri.localhost` on Windows and Linux.) If you self-host Utsuwa, you can skip the CORS change instead: set `ALLOW_LOCAL_PROVIDER_HOSTS=true` on the Utsuwa server and the app sends speech through the server whenever the browser's direct request is blocked. The TTS server then only has to be reachable from the Utsuwa server.
- **Your browser may ask permission.** Recent versions of Chrome treat a public site reaching `localhost` as a local-network request and may prompt you to allow it (or require the server to opt in). Allow it if asked.

With the default servers, none of this applies to the desktop app. The only case that needs attention is a server you've hardened to restrict origins, which would need the desktop origin above allowed. This is the same set of rules local LLMs (Ollama, LM Studio) follow on the hosted site.

## Troubleshooting

### No sound and no error

Make sure the **Speech (TTS)** module is enabled and a voice is set. If the voice field is empty, type a valid voice for your server (e.g. `af_bella` for Kokoro).

### "Could not reach a local TTS server"

The server isn't running or isn't reachable at the base URL. Confirm it's up:

```bash
curl http://localhost:8880/v1/audio/voices
```

If that returns data but Utsuwa still can't reach it from a browser, it's almost certainly an origin or local-network block. On the hosted site the server has to allow the `https://app.utsuwa.ai` origin (Kokoro-FastAPI allows all origins by default; a proxied or hardened server may need it added), and your browser may prompt to allow access to local-network devices. See [Desktop app vs hosted website](#desktop-app-vs-hosted-website) for the full list. None of this applies to the **desktop app**, which is the smoothest way to run local TTS.

### "Local TTS server returned 400/404"

The model or voice isn't valid for that server. Leave the model blank (Utsuwa sends `tts-1`, which most servers accept), and double-check the voice name against your server's voice list.

### Choppy or delayed speech

Local TTS generates the full clip before playback. On slower hardware, try a CPU-optimized build or a GPU image, and keep responses shorter.
