---
title: Memory
description: What she remembers and how, the Memory settings page, semantic search, correcting and deleting memories, backups, and exactly what Clear All Data removes.
---

# Memory

She remembers what you tell her. Everything is stored on your device, and nothing is kept on a server. This page explains what she keeps, how to look at it, and how to fix or remove it.

## What she remembers

**Facts.** Short sentences about you, your relationship, and things you did together. They come from two places:

- With each reply, the model may write one memory about you when you share something worth keeping, like a preference, a plan, or someone in your life. It writes it in the third person and only from what you said.
- Utsuwa also picks out up to two likely facts from your message with simple rules, or one when the model already wrote one.

Each fact has a category: **About you**, **Relationship**, or **Shared experience**. When a new fact repeats one she already has, word for word or close in meaning, Utsuwa strengthens the existing fact instead of saving a copy.

**Conversation.** Every message you send and every reply she gives is saved as part of a session. When you come back later, past sessions get a short summary.

**Photos.** Images you show her in chat are kept on the photoboard, with her impression as a note. Open it with the photoboard button (top left, "Things you've shown her"). **Forget this** removes a photo.

**Relationship state.** Her mood, energy, stage, and relationship meters. See Settings > Character > **State & activity**.

**Reminders.** Timers and reminders she set for you. See the [Web Guide](/docs/guides/web-guide#reminders-and-timers).

### How she uses it

Before each reply, Utsuwa looks up the facts that match what you just said and adds them, with your recent messages, to her instructions. Important facts come up more often. In Dating sim mode, the facts also feed [personalized event moments](/docs/guides/expressions-and-moments#personalized-event-moments).

## Semantic search

Utsuwa finds memories by meaning, not just by matching words. Asking about "outdoor activities" can bring up a memory about hiking. This runs on your device with a small multilingual embedding model.

- **First run.** The app downloads the model from Hugging Face when it starts. After it loads, facts saved earlier without it are indexed in the background.
- **Offline or blocked.** If the model cannot download, memory still works. Utsuwa falls back to keyword search plus her most important facts. The memory graph stays empty until the model loads.
- **Privacy.** The model runs locally. Your memories are not sent anywhere to be searched.

## The Memory page

Open Settings > Memory, or click the brain button (top left) to go straight to the graph. The page has four tabs.

### Graph

A map of your memories. Lines connect memories that are similar in meaning.

- Toggle categories to filter the map.
- **Reset view** re-centers it. **Expand graph** opens it full size.
- Click a node, or pick one from **Inspect a memory**, to see **Memory details**: the text, how often it was referenced, and when it was created. **Open in Facts** jumps to that fact.

If the graph says "No connected memories yet", the embedding model has not loaded yet or your memories are not similar enough to connect. Your facts are still in the Facts tab.

### Facts

**Remembered facts** lists every fact, newest first, 25 per page.

- **Search memories** filters by text. **Category** filters by type.
- **Delete** removes a fact after you confirm with **Delete memory**.
- **Add a memory** saves a fact you write yourself. Choose a **Memory category** and an **Importance** from 0 to 100. Higher importance makes it come up more often.

### Sessions

- **Current** shows the saved messages of this session, or of the latest session after a reload.
- **Saved** lists past sessions with their summaries, message counts, and topics.

### Settings

**Memory storage** links to Settings > Data for backups. **Advanced** has two read-only tools: **State**, a view of her current character state, and **Parser test**, which shows how a sample reply would be parsed.

## Correcting a memory

Facts cannot be edited in place. To fix one:

1. Open Settings > Memory > **Facts** and find the fact with **Search memories**.
2. Click **Delete**, then **Delete memory**.
3. Under **Add a memory**, write the correct version and click **Add memory**.

You can also tell her in chat, for example "Actually, I moved to Osaka last year." She may save the new fact, but the old one stays until you delete it.

## Backups: export and import

Settings > Data handles backups.

- **Download Save File** saves a JSON file with her character state (name, personality, mode, mood, and relationship), your facts, sessions, conversation history, and completed events.
- **Import Save** restores one. Choose **Replace** to clear current data first, or **Merge** to add the save's records and skip duplicates. Merge keeps your current character state. The app reloads when the import finishes.

The save file leaves out search indexes. Utsuwa rebuilds them after an import once the embedding model loads.

The save does not include:

- API keys and all settings
- Uploaded avatars, animations, and background images
- Photos on the photoboard
- Reminders

The website and the desktop app keep separate data. Use a save file to move between them or between devices.

## What Clear All Data removes

Settings > Data > **Clear All Data** asks you to confirm with **Yes, Delete Everything**, then reloads. It deletes:

- Her character state: name, personality, mode, mood, and relationship progress
- All facts
- All sessions and conversation history
- Completed events and achievements

After the reload she starts fresh and the setup wizard opens again.

It does **not** delete:

- Reminders
- Photos on the photoboard, including photo mode captures
- Uploaded avatars
- Uploaded animations and their settings
- Your background image
- API keys, provider choices, and every other setting
- MCP servers

To remove more:

- **Photos**: use **Forget this** on each photo in the photoboard.
- **Avatars**: Settings > Developer > **Clear VRM Storage** removes every uploaded avatar.
- **Reminders and everything in the memory database**: Settings > Developer > **Reset Character Data** deletes the whole local database. It does not ask for confirmation.
- **Everything on the web**: clear this site's data in your browser settings.
