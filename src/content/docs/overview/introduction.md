---
title: Introduction
description: What Utsuwa is and where to start.
---

# Introduction

## TL;DR

- An open-source AI companion with a 3D VRM avatar
- Connect any LLM provider, give her a voice, and talk to her by text or microphone
- Memory, moods, and an optional dating sim relationship system built in
- Local-first: your data stays on your device
- Runs in the browser, or as a desktop app for macOS, Windows, and Linux with a transparent overlay mode

## What is Utsuwa?

Most AI companions are text-only chats or closed platforms. You don't own the character, and you don't own the data.

Utsuwa gives you a 3D avatar that speaks, remembers your conversations, and reacts to how you treat her. There are no accounts and no subscriptions. Everything is stored on your device.

"Utsuwa" means "vessel" in Japanese: a container for an AI to inhabit visually. The app is the vessel. You choose what goes inside.

## What She Can Do

- **Chat with any model.** OpenAI, Anthropic, Google, DeepSeek, xAI, any OpenAI-compatible endpoint (OpenRouter, Together, vLLM), or a local model through Ollama or LM Studio.
- **Speak.** ElevenLabs, OpenAI TTS, Fish Audio, a local OpenAI-compatible server such as Kokoro-FastAPI, or OmniVoice, which can switch voices for foreign words. Her mouth follows the audio. See [Voice Providers](/docs/guides/voice-providers).
- **Listen.** A local Whisper server, Groq, OpenAI, or the browser's built-in speech recognition.
- **Remember.** She saves what you tell her and finds it again by meaning, on your device. Browse it in Settings > Memory. See [Memory](/docs/guides/memory).
- **Show how she feels.** Her face follows her mood, and she can flash a quick reaction or play a gesture from her animation library, including `.vrma` files you upload. See [Animations](/docs/guides/animations) and [Expressions and Moments](/docs/guides/expressions-and-moments).
- **Grow closer.** In Dating Sim Mode, five relationship stats move with each conversation and unlock story events, which she can rewrite from your shared memories. Companion Mode turns this off.
- **See what you show her.** Vision models can look at photos you drop into the chat.
- **Pose for photos.** Photo mode adds poses, backgrounds, filters, frames, and stickers. See [Scene and Photo Mode](/docs/guides/scene-and-photo-mode).
- **Use tools.** MCP servers such as Home Assistant give her tools she can call during chat. See [MCP Servers](/docs/guides/mcp).
- **Run fully offline.** Pair a [local LLM](/docs/guides/local-llm-setup) with [local TTS](/docs/guides/local-tts-setup) or [OmniVoice](/docs/guides/omnivoice) and [local STT](/docs/guides/local-stt-setup).

Every option is covered in the [Settings Reference](/docs/guides/settings-reference).

## Getting Started

<script>
import DocsGetStartedCards from '$lib/components/docs/DocsGetStartedCards.svelte';
</script>

<DocsGetStartedCards />

## Under the Hood

The [Architecture Overview](/docs/technology/architecture) and [Companion System](/docs/technology/companion-system) pages explain how the pieces fit together.

## Contributing

Utsuwa is open source and welcomes contributions. See [Contributing](/docs/community/contributing).
