---
title: Troubleshooting
description: Fixes for common problems with setup, API keys, avatars, voice, animations, expressions, the desktop app, and memory.
---

# Troubleshooting

Find your symptom below. Quoted messages are the exact text the app shows, with the parts that change written in angle brackets.

## Node.js Version Issues

### pnpm refuses to install

Self-hosting needs Node.js 22 or newer. With an older version, `pnpm install` stops with an unsupported engine error.

With nvm, install and switch to Node 22. The repository's `.nvmrc` pins it, so `nvm use` inside the project picks the right version:

```bash
nvm install 22
nvm use
```

### Checking your Node version

```bash
node --version
```

It should print `v22` or higher.

### Local dev page loads but the scene or controls are stuck

If the `/app` page renders in development but the model never appears, controls do not respond, or the browser console shows Vite's `Outdated Optimize Dep` error or failed dynamic imports, clear Vite's caches and restart:

```bash
rm -rf node_modules/.vite .svelte-kit
pnpm exec svelte-kit sync
pnpm exec vite dev --force --host localhost --port 5173
```

The first-run setup wizard sits above the scene until you finish it. Complete it before testing other controls.

## API Key Configuration

### The provider rejects my key

The error you see comes from the provider itself. Check that:

1. The key has no extra spaces
2. The key has not been revoked or run out of credit
3. The key belongs to that provider. Each settings page has its own key fields: the chat key in Settings > LLM Model does not cover TTS or voice input.

### "Enter API key first"

The model dropdown stays disabled until the provider has a key. Paste the key, click outside the field, and the model list loads.

### "API key required"

Chat was sent to a cloud provider with no key saved. Add the key in Settings > LLM Model.

### API key not being saved

Keys are stored in this browser on this device.

1. **Private windows** can clear storage when they close. Use a normal window.
2. **Another browser or device** has its own storage. Enter the key there too.
3. **The desktop app** keeps its own storage, separate from the website.

### Rate limiting

Rate limit errors come from the provider. Wait a few minutes, check the provider's usage dashboard, or raise your plan's limits.

## VRM Model Issues

### Uploading a model does nothing

The uploader only accepts files whose name ends in lowercase `.vrm`. A file named `Model.VRM` is ignored without a message. Rename it to end in `.vrm` and upload again.

### Model not loading

If you see "Failed to load VRM model":

1. **Check the file.** It must be a valid VRM model, not a plain glTF or FBX.
2. **Give it time.** Large models take longer to load.
3. **Try another model** to see whether the problem follows the file.
4. **Check the console.** Open the developer tools (F12) and look for errors.

### "WebGL is unavailable on this device or browser."

Utsuwa needs WebGL to draw your companion. Turn on hardware acceleration in your browser settings, update your graphics drivers, or try another browser. The info button (top right) shows whether 3D graphics are supported.

### Model displays incorrectly

1. **Shaders.** Materials made for a specific engine's custom shaders may not look the same in Utsuwa.
2. **Bones.** Animations need the standard VRM humanoid bones. A model with missing bones can move oddly.
3. **Compare.** Load the model with **Upload VRM** in Settings > Developer to test it without saving it.

### Removing uploaded models

The avatar gallery has no delete button. Settings > Developer > **Clear VRM Storage** removes every uploaded model at once, without asking.

## Expressions and Animations

### Mood expressions not showing

Her face may stay neutral for several reasons:

1. **The switch is off.** Check Settings > Display > **Mood expressions**.
2. **Her mood is neutral, or mild.** Neutral has no expression, and a low-intensity mood shows only a faint one.
3. **Your model lacks the expression names.** Mood faces look for standard names such as `happy`, `relaxed`, `sad`, `angry`, and `surprised`, or the older `joy`, `fun`, and `sorrow`. Open Settings > Developer and check **Available Expressions**. See [what your model needs](/docs/guides/expressions-and-moments#what-your-model-needs).
4. **Something else owns her face.** Photo mode and a playing emote both pause the mood face.

Brief reactions follow the same switch and the same names. They also depend on the model choosing to react, which it does rarely by design.

### Animation upload rejected

The reason shows under **Your animations** in Settings > Animations.

| Message | Fix |
|---|---|
| "That file is not a .vrma animation." | Pick a `.vrma` file. |
| "That file is empty." | Export the animation again. |
| "That animation is over 25 MB." | Shorten or re-export the clip. |
| "That file couldn't be read as a VRM animation." | The file is not a valid VRM animation. Re-export it as VRMA. |
| "Animations can run up to 60 seconds. Trim it and try again." | Trim the clip to 60 seconds or less. |
| "Couldn't save that animation. Your browser storage may be full." | Free up space, or delete uploads you no longer use. |

### She never uses my animation

1. **Companion can use** starts off for uploads. Turn it on for the row.
2. **Write a description.** She picks motions by their description. A bare file name tells her little.
3. **Cooldowns.** She will not repeat a motion within 20 seconds, or start any emote within 8 seconds of the last one.
4. **One at a time.** A new emote is skipped while another plays, and every emote is skipped in photo mode.
5. **Her choice.** She picks at most one per reply, and only when it fits. Use **Play** to check that the motion itself works.

See [Animations](/docs/guides/animations).

## Event Moments

### Scenes play the built-in text

With **Personalized moments** on, she writes each event scene herself. The built-in scene plays instead when:

1. **The switch is off.** Check Settings > Display > **Personalized moments**.
2. **Chat is not ready.** Chat must be on, with a provider, a model, and a key if the provider needs one.
3. **The model is too slow.** She gets 15 seconds. Slow local models often run past it.
4. **The reply is unusable.** Her answer must keep the scene's shape: every part the scene has, reasonable lengths, and the same number of choices. Small models often miss this.

Nothing is lost when this happens. What you choose and how it affects your relationship always come from the built-in scene.

### A moment is in the wrong language

She writes in the language of your most recent messages, or English when there are none yet. Send a message in your language and the next moment follows it.

## Text-to-Speech Issues

### No audio output

1. **Speech (TTS)** must be on in Settings > TTS, with a provider and, for cloud providers, a key.
2. **Check the tab and system volume.** Make sure the browser tab is not muted.
3. **Send a message by tapping.** Browsers only start audio after you interact. Utsuwa unlocks audio when you tap Send or the mic.
4. **iPhone and iPad.** The ring/silent switch mutes her voice even when other media plays. Flip it to ring.
5. **Settings are per device.** A phone where you never set up a TTS provider stays silent.

### An error appears above the chat bar

TTS errors show above the chat bar for a few seconds, in the form "`<Provider>` error `<status>`" followed by the provider's own explanation. For example, a 401 means the key was rejected, and ElevenLabs reports problems like an unknown voice in its own words.

### Fish Audio error 402

Fish Audio returns 402 when your account has no API credits for the chosen model. Pick **S2.1 Pro Free** in the model list, which works without credits, or add credits to your Fish Audio account.

### Lip sync not working

1. **Audio is required.** Her mouth only moves while TTS audio plays. With TTS off, she plays her talking motion without mouth movement.
2. **Mouth shapes.** Your model needs mouth expressions such as `aa`, `ih`, `ou`, `ee`, and `oh`, or the older `a`, `i`, `u`, `e`, and `o`.
3. **Very quiet audio** can fall below the level that moves her mouth.

### Voice sounds wrong

1. **Voice IDs belong to one provider.** Switching providers resets the voice to that provider's first voice.
2. **ElevenLabs and Fish Audio** take a voice id in **Voice ID**. For Fish Audio you can paste the voice's fish.audio link.
3. **OpenAI TTS** always uses the Alloy voice.
4. **Speed** is set in the OmniVoice panel and carries over to other providers. Set it back to 1 if another voice sounds too fast or slow.

### Local TTS not speaking

If you picked **Local TTS** and hear nothing:

1. **Is the server running?** For example: `curl http://localhost:8880/v1/audio/voices`
2. **Is the voice valid?** The **Voice** field must hold a name your server knows, such as `af_bella` for Kokoro.
3. **Is the base URL right?** It should point at the server's `/v1`. Utsuwa fixes a missing or extra trailing slash.

The messages tell you which case you are in:

- "Could not reach a local TTS server at `<url>`..." means the request never got through: the server is off, the address is wrong, or the server blocked this site's origin.
- "Local TTS server returned `<status>` at `<url>`. Check the model and voice are valid for this server." means the server answered but rejected the request.

On the hosted website, the server must run on `localhost` (one on another machine is blocked as mixed content) and must allow the `https://app.utsuwa.ai` origin. Your browser may ask to allow access to your local network. Allow it. See [Local TTS Setup](/docs/guides/local-tts-setup).

### Local TTS blocked on a self-hosted web build

If your own Utsuwa server runs next to your TTS engine and the browser still cannot reach the engine, let the server relay speech. Set this on the Utsuwa server and restart it:

```bash
ALLOW_LOCAL_PROVIDER_HOSTS=true
```

When the browser's direct request fails, the app then retries once through the server. This works for Local TTS and OmniVoice. The engine only has to be reachable from the Utsuwa server.

If the relay also fails, you see "The Utsuwa server could not reach the local TTS server at `<url>` (could not connect)." or "(timed out)". Check that the engine is running and reachable from the machine that runs Utsuwa. Without the variable, you keep seeing the "Could not reach a local TTS server" message.

## Voice Input Issues

### Mic button does nothing on desktop

The desktop app has no built-in speech recognition. The mic shows "Add a Groq key or a local STT server in Settings > STT for voice input on desktop."

1. Open Settings > STT.
2. Enter a **Server URL** for a local Whisper server, a **Groq API key**, or an **OpenAI API key (Whisper)**.

### Mic button shows an error in the browser

"Voice input is not supported in this browser. Add a Groq key or a local STT server in Settings > STT, or try Chrome/Edge." means your browser has no Web Speech API. Firefox is a common case. Use Chrome, Edge, or Safari, or set up a local server, Groq, or OpenAI in Settings > STT.

Web Speech only listens for US English. For other languages, use a local server, Groq, or OpenAI.

### "Microphone access denied"

Your browser or system is blocking the microphone. You may also see "Microphone access denied. Check system permissions."

1. **Browser**: click the site controls in the address bar and allow the microphone.
2. **macOS**: open System Settings > Privacy & Security > Microphone and turn it on for your browser or Utsuwa.

Related messages: "No microphone found. Please connect a microphone." and "Microphone is busy or in use by another app."

### Transcription times out

A local server that takes too long shows "The local STT server did not respond within `<seconds>` seconds. Raise the transcription timeout in Settings > STT if your server is slow."

Open Settings > STT and raise **Transcription timeout (seconds)**, up to 600. CPU-only machines and large models need more time. The setting only applies to the local server; Groq and OpenAI always wait 30 seconds.

### "Could not reach a local STT server"

The full message names the address and the `/v1/audio/transcriptions` endpoint it tried. Check that the server is running, that **Server URL** is right, and that the server allows this site's origin. See [Local STT Setup](/docs/guides/local-stt-setup).

## Desktop App

### App won't open

The desktop builds are unsigned during the beta, so your system warns you the first time. This is expected.

1. **macOS**: right-click the app, choose **Open**, then **Open**. If macOS only offers the Trash, use System Settings > Privacy & Security > **Open Anyway**. Or run `xattr -dr com.apple.quarantine /Applications/Utsuwa.app` once.
2. **Windows**: on the SmartScreen prompt, click **More info**, then **Run anyway**.
3. **Linux**: make the AppImage executable with `chmod +x Utsuwa.AppImage`.

If you built from source and it will not start, check that Rust is installed with `rustc --version`. See the [Desktop Guide](/docs/guides/desktop-guide).

### Local LLM or TTS will not connect on desktop

The desktop app calls local servers directly, so the server only needs to be running and allow the app's origin.

1. **Ollama**: start it with `ollama serve` and pull a model. If Ollama rejects the app, the error reads "Could not reach Ollama at `<url>`. Make sure it's running with "ollama serve" and allow this origin: `OLLAMA_ORIGINS="<origin>" ollama serve`." Use the origin it shows. Full steps: [Local LLM Setup](/docs/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama).
2. **LM Studio**: load a model and click Start Server. The error reads "Could not reach LM Studio at `<url>`. Open it, load a model, and click Start Server."
3. **Local TTS**: start your TTS server, for example Kokoro-FastAPI on `http://localhost:8880`.
4. **Ports**: the port in Settings > LLM Model or Settings > TTS must match the port your server uses.

### No sound on desktop

1. **System audio**: check your volume, and that Utsuwa is not muted in the system mixer.
2. **TTS**: a provider must be set up with a voice. See [Text-to-Speech Issues](#text-to-speech-issues).

### The overlay disappeared

`Ctrl+Shift+U` shows or hides the overlay. Press it to bring the overlay back, then use **Back to app** (top right of the overlay) to return to the main window.

If the overlay shows "The main window is unavailable. Your companion is still here.", the main window was closed. Quit and reopen the app.

### Updates not installing

In-app updates work for the macOS `.dmg`, the Windows `.exe`, and the Linux `.AppImage`. With a `.deb` or `.rpm`, install the newer package with your package manager. The app checks on each launch. To check by hand, use **Check for updates** in the info dialog.

## Memory & Performance

### Memory search or the graph seems empty

Semantic search and the memory graph need a small embedding model that the app downloads from Hugging Face on first start. Until it loads, memory falls back to keyword search and the graph shows "No connected memories yet". Check your connection, then reload. Your facts are still listed in Settings > Memory > **Facts**. See [Memory](/docs/guides/memory#semantic-search).

### App running slowly

1. **The avatar.** Complex models with many materials and spring bones use more graphics power. Try a simpler model.
2. **First start.** The embedding model loads in the background and indexes existing memories.
3. **Other apps.** Close other programs that use the GPU.

### Storage errors

1. **Free up space.** Your device may be low on storage.
2. **Leave private browsing.** Some storage does not work in private windows.
3. **Remove large uploads.** Uploaded avatars and animations take the most space.

### Memory usage is high

Rendering, the avatar's textures, and the embedding model all use memory. Reloading the page releases what a long session built up. Your data is kept.

## Common Errors

### Network errors

A "Failed to fetch" message comes from the browser and points to a network problem:

1. **Check your internet connection.**
2. **Check the provider.** It may be down.
3. **Check firewalls and proxies.** Company networks can block API calls.

For local models on the web, the browser connects straight to your local server:

1. **Ollama**: start it with `ollama serve`.
2. **LM Studio**: load a model and click Start Server.
3. **Base URL**: `http://localhost:11434` for Ollama, `http://localhost:1234/v1` for LM Studio.
4. **Ollama origin**: Ollama rejects origins it does not allow. On the hosted website, run `OLLAMA_ORIGINS=https://app.utsuwa.ai ollama serve`. For any other address, use the origin the error message shows. See [Local LLM Setup](/docs/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama) and Ollama's [FAQ on web origins](https://docs.ollama.com/faq#how-can-i-allow-additional-web-origins-to-access-ollama).
5. **Installed model**: if Ollama says the model is not found, run `ollama list`, pull a model, refresh the dropdown, and pick an installed one.

### The endpoint returned a web page

The message reads "The endpoint at `<url>` returned a web page instead of an API response. Double-check the base URL (for OpenAI it's `https://api.openai.com/v1/`)." The address points at a website, not an API. Check **Base URL** in Settings > LLM Model. OpenAI-style APIs usually end in `/v1/`.

### "Request timed out"

The model list took too long to load. Check the provider and your connection, then use the refresh button next to the model dropdown.

## Getting More Help

If your issue is not covered here:

1. Search [GitHub Issues](https://github.com/JuiceBoxxGames/utsuwa/issues) for similar problems.
2. Open a new issue with:
   - Web or desktop, and your browser or OS
   - The app version from the info button
   - Steps to reproduce
   - Any console errors
   - Screenshots if they help
