---
title: OmniVoice Setup
description: Run the OmniVoice text-to-speech model locally for a fully offline, multi-language voice.
---

# OmniVoice Setup

[OmniVoice](https://github.com/k2-fsa/OmniVoice) is a local text-to-speech model that runs entirely on your own hardware. It supports a large number of languages, generates audio quickly on a modern GPU, and does not need a cloud API key. Utsuwa talks to OmniVoice through a small OpenAI-compatible proxy that ships in this repository.

## What you need

- **Docker** and Docker Compose (or a compatible container runtime) installed on your machine.
- Linux is recommended; the proxy is built and tested there.
- An NVIDIA GPU with CUDA 12 for fast inference, or a modern CPU for slower CPU inference.
- `nvidia-container-toolkit` if you want GPU acceleration inside the container.
- Internet access on first start to download the `k2-fsa/OmniVoice` model from HuggingFace.

OmniVoice can also be installed and run outside of Docker with Python 3.11 and its native dependencies. This guide focuses on the Docker path because it is the easiest way to get a reproducible environment.

## Start the proxy

The proxy code lives in `tools/omnivoice` and includes a ready-to-use Docker Compose file:

```bash
cd tools/omnivoice
docker compose up -d
```

The first start downloads the model from HuggingFace, which can take several minutes depending on your connection. Wait until the health endpoint returns `ok`:

```bash
curl http://localhost:8881/health
# {"status":"ok"}
```

If the model download is slow or you hit rate limits, give the container a HuggingFace token: add `HF_TOKEN: <your token>` under an `environment:` key for the service in the compose file, then start it again. Outside Docker, export `HF_TOKEN` in the shell that runs the proxy.

## Connect Utsuwa

1. Start the proxy.
2. Open Utsuwa and go to **Settings > TTS**.
3. Turn on **Speech (TTS)** and select **OmniVoice** as the provider.
4. Check the **OmniVoice Proxy** URL. Leave it empty to use the default `http://localhost:8881/v1/`. The dot next to the label shows **Connected** once the proxy answers.
5. Choose a language, voice, and speed, then send a message.

The compose files bind the proxy to `127.0.0.1` only. To use it from another device or from the Utsuwa dev container, see [Reaching the proxy from another machine](#reaching-the-proxy-from-another-machine).

### Browser access

The proxy allows every origin (CORS `*`), so the hosted site can reach it on `localhost` as long as your browser allows the local-network request. The desktop app needs nothing extra.

If you self-host Utsuwa and the browser still can't reach the proxy, set `ALLOW_LOCAL_PROVIDER_HOSTS=true` in the Utsuwa server's environment. Chat speech then retries through the server's `/api/tts/local` route whenever the direct request fails, so the proxy only has to be reachable from the Utsuwa server. This covers speech during chat only. The settings page still talks to the proxy directly from the browser for the status dot, cloned voices, **Test**, **Regenerate**, cloning, and profile pre-warming.

## Configure your voice

After selecting OmniVoice in **Settings > TTS**:

- **Language**: Primary language for synthesis. OmniVoice supports many languages; pick the one your companion speaks most of the time.
- **Mode**: Switch between **Synthetic** (preset voices) and **Cloned** (your own cloned voices).
- **Voice**: In Synthetic mode, one of the presets (for example `alloy`, `onyx`, or `nova`). Each preset has a fixed gender, age, pitch, and accent that Utsuwa turns into an instructions string for the model. In Cloned mode, one of your clones.
- **Regenerate**: Only available for synthetic voices. Deletes the cached persistent profile for the current preset and creates a fresh one with the same instructions. Use this to clear a corrupted profile or to get a slightly different speaker color from the same preset. Because cloned voices do not use cached profiles, the button is disabled in cloned mode.
- **Test**: Plays a short test phrase in the selected language so you can verify the voice before chatting.

### Advanced settings

The primary voice card carries its own synthesis parameters:

- **Speed**: Playback speed of the generated audio.
- **Num Step**: Diffusion steps. Higher values can improve quality at the cost of slower generation.
- **Position Temperature** / **Class Temperature**: Sampling temperatures for the audio tokenizer. Leave them at the defaults unless you want to experiment with pronunciation variation.

The **Alternative Voice** card has the same four parameters with an **Alt** prefix; unset values fall back to the primary voice's settings.

Because OmniVoice is a diffusion model, the exact speaker color can vary slightly between sentences even for the same preset. Persistent preset profiles keep the variation small; cloned voices tend to sound more stable than synthetic presets.

### Alternative language & voice

Enable **Alternative Voice** to give foreign-language words their own voice. This is built for language training: when the companion explains a foreign word, the word itself is spoken in its own language and dialect, while the surrounding explanation stays in the primary voice.

- **Switch**: The switch in the **Alternative voice** header turns the feature on. Without it, everything is spoken with the primary voice (foreign words still get the correct dialect, but no voice change).
- **Language**: The foreign language (for example `es`). The primary language is excluded here; the two must differ.
- **Mode / Voice**: Same choices as the primary voice: a synthetic preset or one of your cloned voices.
- **Alt Speed / Alt Num Step / Alt Position & Class Temperature**: Optional synthesis parameters for the alternative voice. Each falls back to the primary voice's value when unset.
- **Test Alt Voice**: Plays a short test phrase in the alternative language so you can verify the voice before chatting.
- **Profile pre-warming**: When you enable the alternative voice, Utsuwa pre-generates the persistent profile for that language in the background, so the first foreign word in a chat is not delayed by on-demand profile generation.

The switch is per word: with tool-capable models Utsuwa hands the LLM native speech tools (otherwise it uses `speak({...})` syntax), and every language change becomes its own segment. A reply like "Das spanische Wort für Auto ist **el coche**." plays the German part with the primary voice and "el coche" with the alternative voice. Regional language tags from the model (`es-ES`) still match the configured language, and languages written in non-Latin scripts (Japanese, Korean, Chinese, Russian, Arabic, Thai, ...) are detected from their script when the model omits explicit markup.

### Function Calling (tool support)

When the alternative voice is enabled, Utsuwa can optionally use **LLM function calling** to force a language code on every speech segment. This is more reliable than asking the LLM to write `speak({...})` syntax, because the language field is schema-required and cannot be forgotten. The toggle **Force language per segment** in the settings controls this:

- **On** (default): The LLM receives a `speak_segment` tool with `language` as a required enum field. Every speech segment must specify its language. Supported by OpenAI, OpenRouter, DeepSeek, and most modern providers.
- **Off**: Falls back to the text-based `speak({...})` syntax. Use this if your LLM provider does not support function calling or rejects unknown parameters.

The info icon next to it shows the tooltip *More reliable; needs LLM tool support*. Anthropic never receives the tools and always uses the inline syntax.

**Known limitation (mixed output order):** When function calling is enabled, Utsuwa streams text deltas immediately but delivers tool calls in a separate pass at the end of the response. This works correctly when a model replies *either* with tool calls *or* with text, which is the normal behaviour for OpenAI-compatible APIs (`finish_reason: "tool_calls"` vs. `"stop"`). If a model ever emits a **mixed** response that interleaves text and tool calls, the speech order may not match the intended sequence. This is an accepted edge case; if you observe out-of-order speech, disable the **Force language per segment** toggle to fall back to inline `speak({...})` syntax.

### Language detection & validation

Utsuwa validates every segment's declared language against the actual text using **ELD** (Efficient Language Detector, [nitotm/eld](https://github.com/nitotm/efficient-language-detector)). If the detected language differs from the declared one (e.g. the LLM tagged Spanish text as German), the segment falls back to the primary voice. This catches inconsistent LLM behaviour without relying on the model alone.

The validation only considers the two active languages (primary and alternative), which makes it highly accurate even for single words. Common function words (`el la un una por para` for Spanish, `der die das ein` for German) are used as a secondary heuristic when the text lacks characteristic diacritics.

### Streaming & expressive speech

OmniVoice replies start speaking while the model is still writing: complete sentences are synthesised as soon as they arrive, and long text is split at sentence boundaries. Lip-sync follows the real audio.

For expressive speech the model can insert non-verbal markers into the spoken text, for example `[laughter]`, `[sigh]`, `[question-oh]`, `[surprise-wa]`. These are rendered as audio (in both voices) and automatically removed from the visible chat bubble.

Known limitations: very short foreign words are spoken as individual segments, so there can be tiny pauses between them; `pause()`/`gesture()` markers inside a streaming reply are not executed (they are only honoured in non-streaming playback). Because the diffusion model can return empty audio for very short foreign-language inputs, Utsuwa capitalises the word and adds a closing period (`"ir"` → `"Ir."`) and disables the model's built-in silence removal. A higher guidance scale (`guidance_scale=6`) is set on foreign segments to improve pronunciation stability. Primary-language fragments are stable and stay untouched; quote marks around words never reach the synthesiser, as OmniVoice renders them as silence.

If syllables or whole words still get swallowed occasionally, the cause is the diffusion model itself, not the language switching: OmniVoice samples the audio over several steps instead of rendering it deterministically from the text, and on short or unusual inputs that sampling can degenerate: phones get dropped or the segment comes back near-silent. Utsuwa already applies the automatic mitigations above (phrase expansion like `"ir"` → `"Ir."`, raised guidance scale, silence removal off, and prompt rules that forbid the LLM from sending bare single words). The remaining levers are in the voice settings: raise **Num Step** (more diffusion steps → more stable output), lower **Position/Class Temperature** (less sampling variance), prefer a synthetic preset voice over a fresh voice clone for foreign segments (clones transfer badly to other languages), and avoid very short foreign segments. A two-word phrase survives diffusion noticeably better than a lone word.

> **Beta note:** Every language the proxy offers can be selected as the alternative language, but the multilingual feature is only fully mature for **DE, ES, EN**. Other languages work, and whole-segment detection, diacritics, and script checks still apply, but language-dependent heuristics (function-word detection, voice-clone interaction) are less mature. The toggle **Force language per segment** requires an LLM with function-calling support; disable it for models that reject unknown parameters.

### When the model forgets to tag

The language switch depends on the LLM marking foreign words with a language. With function calling enabled this is schema-enforced; otherwise Utsuwa relies on `speak({ lang: ... })` syntax. Some models still tag inconsistently, for example packing "el gato" into a German sentence instead of giving it its own call. Utsuwa corrects what can be proven deterministically via ELD validation (diacritics, scripts, and function words), but an unmarked foreign word without any distinguishing feature cannot be detected safely and stays in the primary voice.

If you hit this often, the lever is the model, not the voice settings:

- **Lower the LLM temperature** (towards 0.2–0.4). Format discipline improves noticeably at lower temperatures; creative phrasing suffers only slightly for a teaching use case.
- **Switch to a model with stronger instruction following.** Criteria that matter here: reliable adherence to structured output formats (the model should not drop or mangle the `speak({...})` syntax), explicit tool-calling or JSON-mode support, and solid multilingual training. Small distilled models tend to skip tagging exactly when a sentence gets complex (side-by-side variants, conjugation tables); if you see missing tags mostly in long teaching answers, the model is usually the bottleneck.

### Cloned voices

Switch **Mode** to **Cloned** and press **Clone New**. In the **Clone New Voice** dialog, upload a 3 to 10 second audio sample, give it a **Voice Name**, and type the **Reference Text** spoken in the recording. The proxy creates the clone, and it appears in the **Voice** list. Delete a clone with the **Delete** button next to the selected voice.

## Reaching the proxy from another machine

The proxy has no authentication by default and now accepts voice uploads and deletions, so the compose file binds it to loopback. To reach it from the Utsuwa development container or another device, change the port mapping in `tools/omnivoice/docker-compose.yaml`:

```yaml
ports:
  - "8881:8881" # all interfaces
```

Only expose the proxy on a network you trust. Anyone who can reach an unauthenticated port can use your GPU, upload reference audio, and delete cloned voices. The same applies when running outside Docker with `--host 0.0.0.0`; the default there is `127.0.0.1`.

The proxy can require a bearer token (`OMNIVOICE_AUTH_TOKEN`, or `--auth-token`) on every endpoint except `/health`. Utsuwa's OmniVoice settings have no token field yet, so with a token set the proxy rejects Utsuwa's requests. Until that changes, limit an exposed port to trusted devices with a firewall rather than a token.

Once exposed, use `http://<your-machine-ip>:8881/v1/` as the base URL (for example `http://192.168.1.42:8881/v1/`).

### Updating the proxy after code changes

When the proxy source changes (for example after a `git pull`), rebuild and restart the container so the new code is copied into the image:

```bash
cd tools/omnivoice
docker compose down
docker compose up -d --build
```

## CPU-only mode

If you do not have an NVIDIA GPU or `nvidia-container-toolkit`, use the CPU compose file:

```bash
cd tools/omnivoice
docker compose -f docker-compose.cpu.yaml up -d
```

CPU synthesis is slower, especially on first load, but it does not require a GPU.

## Run without Docker

You can also run the proxy directly with Python 3.11:

```bash
pip install -r tools/omnivoice/requirements.txt
python tools/omnivoice/omnivoice-proxy.py --device cpu
```

See the [OmniVoice repository](https://github.com/k2-fsa/OmniVoice) for the underlying model setup and non-Docker requirements.

## Test the proxy

Start the proxy, then run the integration test:

```bash
python tools/omnivoice/test-omnivoice.py
```

It checks `/health`, `/v1/models`, and `/v1/voices`, synthesises a few short clips without playing them, and creates and deletes a test profile and a test clone.

## Troubleshooting

### Container restarts or `CONNECTION_REFUSED`

Check the logs:

```bash
docker logs omnivoice-proxy --tail 50
```

Common causes are a port conflict, a missing GPU runtime (use the CPU compose file), or the model still downloading. Wait for the health endpoint to return `ok` before testing from Utsuwa.

### `RuntimeError: CUDA out of memory`

Close other GPU applications, keep `--max-concurrent` at `1` (the default), or run with `--device cpu`.

### Proxy is healthy but Utsuwa cannot reach it

- Confirm you are using `localhost` or `127.0.0.1`. The proxy is bound to loopback by default, so a network IP will not reach it until you change the port mapping. See [Reaching the proxy from another machine](#reaching-the-proxy-from-another-machine).
- If you use the hosted web app, the browser may ask for permission to access local-network devices; allow it.
- If you self-host Utsuwa, see [Browser access](#browser-access) for the server proxy.
- If you run Utsuwa in the development Docker container, remember that `localhost` inside the container is not the host machine. You need the host IP, which means exposing the port as described above.

## See also

- [Local TTS Setup](/docs/guides/local-tts-setup) for Kokoro-FastAPI and openedai-speech.
- [OmniVoice repository](https://github.com/k2-fsa/OmniVoice)
