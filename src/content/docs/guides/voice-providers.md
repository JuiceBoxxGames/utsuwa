---
title: Voice Providers
description: Set up her voice with ElevenLabs, OpenAI TTS, Fish Audio, or a local engine, and set up voice input with a local server, Groq, OpenAI, or the browser.
---

# Voice Providers

Utsuwa has two voice features. **TTS** (text-to-speech) gives her a spoken voice. **STT** (speech-to-text) lets you talk instead of type. Each has its own settings page and works on its own.

## Her voice (TTS)

Open Settings > TTS and turn on **Speech (TTS)**. Pick a provider, then fill in the fields it shows.

| Provider | Needs | Runs |
|---|---|---|
| ElevenLabs | API key | Cloud |
| OpenAI TTS | API key | Cloud |
| Fish Audio | API key | Cloud |
| Local TTS | A local OpenAI-compatible speech server | Your machine |
| OmniVoice | The local OmniVoice proxy | Your machine |

API keys stay on your device. The **Model** dropdown stays disabled until you enter a key.

### ElevenLabs

1. Paste your ElevenLabs API key.
2. Pick a model. The list loads from your ElevenLabs account.
3. Set **Voice ID**. Type any voice id from your ElevenLabs voice library, or pick a suggestion: Rachel, Bella, Adam, Gigi, Daniel, or Charlotte. Rachel is selected when you switch to ElevenLabs.

### OpenAI TTS

1. Paste your OpenAI API key.
2. Pick a model. The list loads from your OpenAI account.

The settings page has no voice picker for OpenAI TTS. It uses the Alloy voice.

### Fish Audio

1. Paste your Fish Audio API key.
2. Pick a model: **S2.1 Pro**, **S2.1 Pro Free**, **S2 Pro**, or **S1**. S2.1 Pro is selected first.
3. Set **Voice ID**. Pick a suggestion from Fish Audio's official library (Sarah, Sadie, Mila, Selene, Kai, Jonah, Adrian, Shiori (Japanese), Satoru (Japanese)), type a voice id, or paste the voice's fish.audio link. Utsuwa pulls the id out of the link for you.

**The free model.** S2.1 Pro Free works on any key, even one without credits. The other models need credits on your Fish Audio account. Without them, Fish Audio answers with an error 402. Switch to S2.1 Pro Free or add credits.

**Why web goes through a proxy.** Fish Audio's speech API does not allow calls from a browser. On the web, Utsuwa sends each request through its own server, which passes it to Fish Audio unchanged and stores nothing. The desktop app calls Fish Audio directly.

### Local TTS and OmniVoice

**Local TTS** talks to any OpenAI-compatible speech server on your machine, such as Kokoro-FastAPI or openedai-speech. It has three fields: **Voice** (default `af_bella`), **Model (optional)** (default `kokoro`), and **Base URL** (default `http://localhost:8880/v1/`). Setup steps are in [Local TTS Setup](/docs/guides/local-tts-setup).

**OmniVoice** is a local engine with voice design, voice cloning, and a second voice for foreign words. Its proxy runs on `http://localhost:8881/v1/` by default. Setup and every setting are in [OmniVoice Setup](/docs/guides/omnivoice).

On a self-hosted web build, a local engine that blocks the browser can still work. Set `ALLOW_LOCAL_PROVIDER_HOSTS=true` on the Utsuwa server. When the browser's direct request fails, the app retries once through the server. The engine then only needs to be reachable from the Utsuwa server. The desktop app never needs this.

### Speed and voice settings

Speed is only adjustable in the OmniVoice panel, from 0.5 to 2.0, with 1 as the default. The value is shared, so a speed you set there still applies after you switch to another provider. ElevenLabs uses fixed stability and similarity settings.

When you switch providers, the voice resets to that provider's first voice. Voice ids do not carry across providers.

### When she starts speaking

- **OmniVoice** streams. She starts speaking while the model is still writing her reply.
- **Every other provider** waits for the full reply. Utsuwa then splits it into sentences and requests them in order, staying one sentence ahead of playback. She starts speaking once the first sentence is ready.

A TTS error shows above the chat bar for a few seconds. The text reply still appears.

### Lip sync

While she speaks, Utsuwa analyzes the audio and drives her mouth. It sets the VRM 1.0 mouth expressions `aa`, `ee`, `ih`, `oh`, and `ou`, the VRM 0.x names `a`, `i`, `u`, `e`, and `o`, and `jawOpen` when a model has it. A model without any of these keeps her mouth still.

With TTS off, she plays her talking motion for about as long as it would take to read the reply, but her mouth does not move.

## Voice input

Click the microphone in the chat bar to start recording. Click the stop button when you finish. Utsuwa transcribes what you said and sends it as a message.

Open Settings > STT (the page header reads **Voice Input**) to choose how it transcribes.

### Which provider it uses

Utsuwa picks the first one that is set up, in this order:

1. **Local server**, when **Server URL** has a value
2. **Groq**, when **Groq API key** has a value
3. **OpenAI**, when **OpenAI API key (Whisper)** has a value
4. **Web Speech**, your browser's built-in recognition

There is no picker. To switch, clear the fields above the one you want.

### Local server

Any OpenAI-compatible transcription server works: Speaches, faster-whisper-server, or whisper.cpp. Audio never leaves your machine.

- **Server URL**: for example `http://localhost:8000/v1/`. The placeholder is not a value. Type the address to turn the local server on.
- **Model**: empty uses `Systran/faster-whisper-large-v3`.
- **Transcription timeout (seconds)**: how long to wait for the server, from 5 to 600. The default is 30. Raise it on slow or CPU-only machines. When the server runs past the limit, you see a message naming the timeout and pointing to this setting.

Setup steps are in [Local STT Setup](/docs/guides/local-stt-setup).

### Groq and OpenAI

Paste a key and voice input switches to that service. Groq uses `whisper-large-v3-turbo`. OpenAI uses `whisper-1`. Both wait up to 30 seconds for a transcript.

### Web Speech

Web Speech needs no setup. It works in browsers that support the Web Speech API, such as Chrome, Edge, and Safari. It listens for US English only. For other languages, use a local server, Groq, or OpenAI.

The desktop app has no Web Speech. On desktop, voice input needs a local server, a Groq key, or an OpenAI key.

### Desktop push-to-talk

On desktop, hold `Ctrl+Shift+Space` to record and release it to send. See the [Desktop Guide](/docs/guides/desktop-guide#global-hotkeys).
