---
title: Troubleshooting
description: Common issues and solutions for Utsuwa.
---

# Troubleshooting

This guide covers common issues you might encounter when using Utsuwa and how to resolve them.

## Node.js Version Issues

### "Unsupported engine" error

Utsuwa requires Node.js 22 or higher. If you see an error like:

```bash
npm error engine Unsupported engine
npm error notsup Required: {"node":">=22.0.0"}
```

You need to update your Node.js version. If you're using nvm:

```bash
nvm install 22
nvm use 22
```

Or with the project's `.nvmrc`:

```bash
nvm use
```

### Checking your Node version

```bash
node --version
```

Should output `v22.0.0` or higher.

## API Key Configuration

### "Invalid API key" error

This usually means your API key is incorrect or expired. Double-check:

1. The key is entered correctly (no extra spaces)
2. The key hasn't been revoked
3. You're using the right key for the provider (OpenAI key for OpenAI, etc.)

### API key not being saved

All API keys are stored locally on your device. If keys aren't persisting:

1. Check if you're in private/incognito mode (web only — incognito can clear storage on close)
2. Clear site data and re-enter the key
3. On the desktop app, try restarting the application

### Rate limiting

If you're getting rate limit errors, you may need to:

1. Wait a few minutes before retrying
2. Check your API provider's usage dashboard
3. Upgrade your API plan if needed

## VRM Model Issues

### Model not loading

If your VRM model won't load:

1. **Check file size** - Large models (>50MB) may take longer to load
2. **Verify the format** - Ensure it's a valid `.vrm` file
3. **Try another model** - Test with a different VRM to isolate the issue
4. **Check the console** - Open DevTools (F12 in browser or desktop app) and look for errors

### Model displays incorrectly

If the model appears distorted or wrong:

1. **VRM version** - Some older VRM 0.x models may have compatibility issues
2. **Bone structure** - Models need standard VRM bone configurations
3. **Materials** - Some custom shaders may not render correctly

### Animations not playing

If the idle animation or expressions aren't working:

1. **Wait for load** - Animations load after the model
2. **Check VRMA support** - Ensure your model supports VRM animations
3. **Refresh the page** - Sometimes a reload fixes animation issues

### Local dev page loads but the scene or controls are stuck

If you are developing locally and the `/app` page renders but the model never appears, controls do not respond, or the console shows `Outdated Optimize Dep` or failed dynamic imports, clear Vite's local caches and restart the dev server:

```bash
rm -rf node_modules/.vite .svelte-kit
pnpm exec svelte-kit sync
pnpm exec vite dev --force --host localhost --port 5173
```

After the page reloads, complete or dismiss the first-run onboarding modal before testing the Settings, Info, or stats controls. The onboarding modal intentionally sits above the scene until setup is finished.

## Text-to-Speech Issues

### No audio output

If TTS isn't producing sound:

1. **Check audio** - Make sure the tab isn't muted (web) or system audio is enabled (desktop)
2. **Verify permissions** - Your browser or OS may need to grant audio autoplay permission
3. **Check API key** - Verify your ElevenLabs, OpenAI TTS, or Fish Audio API key is valid
4. **Check provider status** - The TTS provider may be experiencing issues

### Lip-sync not working

If the avatar's mouth isn't moving:

1. **Audio is required** - Lip-sync only works when TTS audio plays
2. **Volume level** - Very quiet audio may not trigger lip-sync
3. **Browser support** - Web Audio API must be supported

### Voice sounds wrong

1. **Check voice settings** - ElevenLabs, OpenAI TTS, and Fish Audio have different available voices
2. **Custom voice ID** - If using an ElevenLabs or Fish Audio custom voice, verify the voice ID is correct. For Fish Audio you can also paste the voice's fish.audio link

### Fish Audio error 402

Fish Audio returns 402 when the account has no API credits for the selected model. Pick **S2.1 Pro Free** in the model list, or add credits in your Fish Audio account.

### Local TTS not speaking

If you selected **Local TTS** but hear nothing:

1. **Server running** - Confirm your TTS server is up, e.g. `curl http://localhost:8880/v1/audio/voices`
2. **Voice is set** - The voice field must hold a name your server knows (e.g. `af_bella` for Kokoro)
3. **Base URL** - It should point at the server's `/v1`; Utsuwa normalizes the trailing slash for you
4. **Desktop app** - Just needs the server running on `localhost`; no origin or CORS setup is required
5. **Hosted site** (`https://app.utsuwa.ai`) - The server must be on `localhost` (one on another machine is blocked as mixed content), must allow the `app.utsuwa.ai` origin (Kokoro-FastAPI does by default), and your browser may prompt to allow local-network access. Allow it if asked

See [Local TTS Setup](/docs/guides/local-tts-setup#desktop-app-vs-hosted-website) for the hosted vs desktop details.

## Voice Input Issues

### Mic button not responding (desktop)

The desktop app uses Tauri's webview, which does not support the browser's Web Speech API. Configure a local Whisper server or Groq for voice input on desktop:

1. Go to **Settings > STT**
2. Either point **Local server** at your Whisper server's base URL (default `http://localhost:8000/v1/`) or enter your Groq API key

### Mic button not responding (web)

If the mic button shows an error in the browser:

1. **Check browser support** - Web Speech API works in Chrome, Edge, and Safari. Firefox has limited support.
2. **Allow microphone access** - Your browser may be blocking the microphone permission.
3. **Use a local Whisper server or Groq** - For better quality or broader browser support, configure Local STT (a self-hosted OpenAI-compatible Whisper server) or add a Groq API key in **Settings > STT**. A configured local server takes top priority, then Groq, then OpenAI, then Web Speech API.

### "Microphone access denied"

Your browser or OS is blocking microphone access:

1. **Browser permissions** - Click the lock icon in the address bar and allow microphone access
2. **System permissions** - On macOS, go to System Settings > Privacy & Security > Microphone and enable access for your browser or Utsuwa

## Desktop App

### App won't open

The desktop app is in beta and currently **unsigned**, so your OS warns you the first time you open it. This is expected, not a broken download.

1. **macOS** - Right-click the app → **Open** → **Open**, or run `xattr -dr com.apple.quarantine /Applications/Utsuwa.app` once
2. **Windows** - On the SmartScreen prompt, click **More info** → **Run anyway**
3. **Linux** - Give the AppImage the executable bit: `chmod +x Utsuwa.AppImage`

See the [Desktop Guide](/docs/guides/desktop-guide) for the full install walkthrough.

### Local LLM or TTS won't connect (desktop)

On the desktop app, most local providers need only that the server is running. The one exception is **Ollama on Windows and Linux**: the desktop app's origin is `http://tauri.localhost`, which Ollama does not allow by default, so it rejects every request with a `403`. macOS is fine out of the box, and LM Studio and the common local TTS/STT servers (Kokoro-FastAPI, openedai-speech) allow all origins by default.

1. **Ollama (macOS)** - Start it with `ollama serve` and pull a model (`ollama pull <model>`)
2. **Ollama (Windows/Linux)** - Same, plus allow the app's origin: `setx OLLAMA_ORIGINS "http://tauri.localhost"` on Windows (then restart Ollama from the tray), or `OLLAMA_ORIGINS=http://tauri.localhost ollama serve` on Linux. Full steps: [Local LLM Setup](/docs/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama)
3. **LM Studio** - Load a model and click Start Server
4. **Local TTS** - Start your TTS server (e.g. Kokoro-FastAPI on `http://localhost:8880`)
5. **Base URL** - Confirm the port in **Settings > LLM Model** or **Settings > TTS** matches the port your server is using

### No sound (desktop)

1. **System audio** - Check your OS volume and that Utsuwa isn't muted in the system mixer
2. **TTS configured** - Confirm a TTS provider is set up and a voice is selected (see Text-to-Speech Issues above)
3. **Microphone/voice input** - The desktop webview has no Web Speech API, so the mic needs a Groq or OpenAI key; see [Mic button not responding (desktop)](#mic-button-not-responding-desktop)

### Updates not installing

Auto-updates work for the macOS `.dmg`, Windows `.exe`, and Linux `.AppImage`. If you installed via `.deb` or `.rpm`, update through your package manager instead. Restarting the app re-checks for an update.

## Memory & Performance

### App running slowly

Performance issues can stem from:

1. **Semantic memory model** - The embedding model (~23MB) loads on first use
2. **Large conversation history** - Long sessions accumulate data
3. **VRM model size** - Complex models use more GPU resources

Solutions:

1. Give the embedding model time to load initially
2. Clear old sessions in Settings > Data
3. Use simpler VRM models if performance is an issue

### Storage errors

If you see IndexedDB or storage errors:

1. **Check available space** - Storage on your device may be full
2. **Clear site data** - Reset the app's storage (web: clear site data, desktop: reinstall)
3. **Disable private mode** - Some storage features don't work in incognito (web only)

### Memory usage is high

The app uses memory for:

1. Three.js 3D rendering
2. VRM model geometry and textures
3. Conversation history
4. Embedding model for semantic search

If memory is a concern, refresh the page periodically to clear accumulated data.

## Common Errors

### "Failed to fetch" errors

These usually indicate network problems:

1. **Check internet connection**
2. **Verify API endpoint** - Some providers may be down
3. **CORS issues** - If self-hosting, check CORS configuration
4. **Firewall/proxy** - Corporate networks may block API calls

For local LLMs, the browser connects directly to your local server:

1. **Ollama running** - Start it with `ollama serve`
2. **LM Studio running** - Load a model and click Start Server
3. **Correct base URL** - Use `http://localhost:11434` for Ollama or `http://localhost:1234/v1` for LM Studio
4. **Ollama origin (CORS)** - Ollama rejects origins it doesn't allow with a `403` on `/api/tags`. On the **hosted website** (the app runs at `app.utsuwa.ai`) allow that origin: `OLLAMA_ORIGINS=https://app.utsuwa.ai ollama serve` (for a Vercel preview use the exact origin from the address bar). On the **Windows or Linux desktop app** allow `OLLAMA_ORIGINS=http://tauri.localhost`; the macOS desktop app needs nothing. Full per-platform steps: [Local LLM Setup](/docs/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama). Background: Ollama's [additional web origins FAQ](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).
5. **Installed model** - If you see `model not found`, run `ollama list`, pull or load a model, refresh the dropdown, and select an installed model

### "Page not found" after deployment

If routes work locally but not in production:

1. **Check adapter settings** - Ensure the SvelteKit adapter is configured correctly
2. **Verify build output** - Check the deployment logs
3. **Case sensitivity** - Some hosts are case-sensitive for file paths

### Console shows "Cannot read property of undefined"

This often means something loaded out of order:

1. **Refresh the page**
2. **Clear cache** - Hard refresh (Ctrl+Shift+R) on web, or restart the desktop app
3. **Check for updates** - Pull latest code if self-hosting, or restart the desktop app

## Getting More Help

If your issue isn't covered here:

1. Check the [GitHub Issues](https://github.com/JuiceBoxxGames/utsuwa/issues) for similar problems
2. Open a new issue with:
   - App version (web or desktop) and browser if web
   - Steps to reproduce
   - Any console errors
   - Screenshots if relevant
