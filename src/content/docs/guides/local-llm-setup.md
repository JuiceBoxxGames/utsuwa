---
title: Local LLM Setup
description: How to set up and connect local LLMs to Utsuwa using Ollama or LM Studio.
---

# Local LLM Setup

Running a local LLM means your conversations never leave your machine. No API keys, no usage costs, and full offline support.

## Ollama

[Ollama](https://ollama.ai) is a lightweight tool for running open-source LLMs locally. Available on macOS, Linux, and Windows.

### Installation

**macOS**

```bash
brew install ollama
```

**Linux**

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows**

Download the installer from [ollama.ai](https://ollama.ai) and run it.

### Pulling a Model

Download a model before you can use it:

```bash
ollama pull llama3.2
```

Other options worth trying: `mistral`, `phi3`, `codellama`.

### Starting the Server

```bash
ollama serve
```

This starts the Ollama API on `http://localhost:11434`.

### Connecting to Utsuwa

1. Open the **Controls** panel (sliders icon, top right) and click **Settings** (gear)
2. Open the **LLM Model** page
3. Enable the Chat (LLM) toggle, then select **Ollama** from the provider dropdown
4. Leave the base URL as `http://localhost:11434` unless you changed Ollama's port
5. Utsuwa will fetch models installed on your machine. Click the refresh icon if you just pulled a new model.
6. Select an installed model from the dropdown
7. Start chatting

If the dropdown is empty, check your installed Ollama models with:

```bash
ollama list
```

### Allowing Utsuwa to reach Ollama

Ollama only answers requests from origins on its allowlist. If it isn't allowing Utsuwa, you'll see the model list stay empty and Ollama's own log will show `403` responses on `/api/tags`. Which origin you need to allow depends on how you run Utsuwa.

**Desktop app**

| Your OS | Setup needed | What to do |
|---------|--------------|------------|
| macOS | None | Ollama already allows the macOS app's `tauri://localhost` origin. Just run `ollama serve`. |
| Windows | Yes | Allow `http://tauri.localhost` (see below). |
| Linux | Yes | Allow `http://tauri.localhost` (see below). |

The desktop app on Windows and Linux reports its origin to Ollama as `http://tauri.localhost`, which is not on Ollama's default allowlist, so you have to add it once.

On **Windows**, set it and then fully restart Ollama:

```
setx OLLAMA_ORIGINS "http://tauri.localhost"
```

`setx` only applies to programs started afterward, so quit Ollama from the system tray (right-click the tray icon, Quit) and start it again. If you run `ollama serve` in a terminal instead, use `set OLLAMA_ORIGINS=http://tauri.localhost` in that same window before running it.

On **Linux**, start Ollama with the origin in its environment:

```bash
OLLAMA_ORIGINS=http://tauri.localhost ollama serve
```

If Ollama runs as a systemd service, run `systemctl edit ollama`, add `Environment="OLLAMA_ORIGINS=http://tauri.localhost"` under `[Service]`, then `sudo systemctl restart ollama`.

**Hosted website (app.utsuwa.ai)**

The web app runs at `app.utsuwa.ai`, and your browser connects directly to Ollama on your machine, so allow that origin:

```bash
OLLAMA_ORIGINS=https://app.utsuwa.ai ollama serve
```

Match whatever is in your browser's address bar. For local development use `http://localhost:5173`. For a Vercel preview, use the exact origin shown in the address bar (no trailing slash), such as `https://your-preview.vercel.app`. Comma-separate multiple origins, or use `OLLAMA_ORIGINS=*` to allow any origin on your machine.

## LM Studio

[LM Studio](https://lmstudio.ai) provides a GUI for downloading and running local models. Good option if you prefer not to use the terminal.

### Installation

Download from [lmstudio.ai](https://lmstudio.ai) and install it.

### Downloading Models

Open LM Studio and browse the built-in model catalog. Search for a model, click download, and wait for it to finish.

### Starting the Server

1. Go to the **Server** tab in LM Studio
2. Click **Start Server**

This starts an OpenAI-compatible API on `http://localhost:1234`.

### Connecting to Utsuwa

1. Open the **Controls** panel (sliders icon, top right) and click **Settings** (gear)
2. Open the **LLM Model** page
3. Enable the Chat (LLM) toggle, then select **LM Studio** from the provider dropdown
4. Leave the base URL as `http://localhost:1234/v1` unless you changed LM Studio's port
5. Utsuwa will fetch models from the running LM Studio server. Click the refresh icon if you load a different model.
6. Select the loaded model from the dropdown
7. Start chatting

## Recommended Models

| Model | Size | Best For | RAM Required |
|-------|------|----------|--------------|
| Llama 3.2 (3B) | ~2GB | General chat, fast responses | 8GB |
| Llama 3.1 (8B) | ~4.7GB | Better quality responses | 16GB |
| Mistral (7B) | ~4.1GB | Good balance of speed and quality | 16GB |
| Phi-3 (3.8B) | ~2.3GB | Lightweight, efficient | 8GB |

Start with **Llama 3.2 (3B)** if you're unsure. It runs well on most hardware and gives solid results for conversational use.

## Custom Base URL

If you're running the LLM server on a different machine or non-default port, enter the full URL in the provider settings. For example:

- Remote machine: `http://192.168.1.50:11434`
- Custom port: `http://localhost:8080`

For Ollama, either `http://localhost:11434` or `http://localhost:11434/v1` works. Utsuwa uses `/api/tags` for model discovery and `/v1/chat/completions` for chat.

## Troubleshooting

### "Failed to fetch models"

The LLM server may not be running, or it may not be allowing Utsuwa's origin. Start the server:

- Ollama: `ollama serve`
- LM Studio: Go to the Server tab and click Start Server

If the server is running but the list is still empty, it's almost always an origin problem. Ollama's log will show `403` on `/api/tags`. Allow Utsuwa's origin as described in [Allowing Utsuwa to reach Ollama](#allowing-utsuwa-to-reach-ollama): on the **Windows or Linux desktop app** that means `OLLAMA_ORIGINS=http://tauri.localhost`; on the **hosted website** it's `OLLAMA_ORIGINS=https://app.utsuwa.ai`. The macOS desktop app needs nothing. Restart Ollama after changing it, then click the refresh icon in Utsuwa's model dropdown.

### "model not found"

The selected model is no longer installed locally, or the local server returned a stale model list.

For Ollama:

```bash
ollama list
ollama pull llama3.2
```

Then select the installed model from Utsuwa's model dropdown.

### "Connection refused"

The port doesn't match. Default ports:

| Provider | Port |
|----------|------|
| Ollama | 11434 |
| LM Studio | 1234 |

Make sure the URL in Utsuwa matches the port your server is using.

### Models still won't load (try 127.0.0.1)

If Ollama is running and you've allowed the origin but the model list is still empty, change the base URL in Utsuwa from `http://localhost:11434` to `http://127.0.0.1:11434`. On some systems (most often Windows) `localhost` resolves to the IPv6 address `::1` first, while Ollama listens on the IPv4 address `127.0.0.1`, so the connection never reaches it. Pointing Utsuwa straight at `127.0.0.1` avoids the mismatch. This is machine-dependent, so it won't affect everyone.

### Slow responses

- Try a smaller model (3B parameters instead of 7B+)
- Check that GPU acceleration is enabled in your LLM tool's settings
- Close other memory-heavy applications

### CORS errors in browser

If you're running Utsuwa in a browser and getting CORS errors with Ollama, set the origins environment variable before starting the server:

```bash
OLLAMA_ORIGINS=https://app.utsuwa.ai ollama serve
```

Ollama documents this under [allowing additional web origins](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).

For Vercel previews, replace the value with the exact preview origin from the browser address bar:

```bash
OLLAMA_ORIGINS=https://your-preview.vercel.app ollama serve
```

If you use multiple Utsuwa origins, comma-separate them. Use `OLLAMA_ORIGINS=http://localhost:5173` for local development, or `OLLAMA_ORIGINS=*` only if you intentionally want to allow any browser origin on your machine.

The **desktop app** hits the same Ollama allowlist. macOS works with no setup, but the Windows and Linux desktop apps need `OLLAMA_ORIGINS=http://tauri.localhost`. See [Allowing Utsuwa to reach Ollama](#allowing-utsuwa-to-reach-ollama).
