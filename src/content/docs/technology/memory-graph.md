---
title: Memory Graph
description: How the memory graph in Settings > Memory is built and what it shows.
---

# Memory Graph

The memory graph is an interactive network of your companion's memories. Memories that mean similar things are linked, so clusters show what she knows about a topic.

## Opening the Graph

Open **Settings > Memory**. The **Graph** tab is the default view. The brain button at the top left of the main screen ("Open memory graph") goes straight there.

Choose **Expand graph** for a larger dialog. Press Escape or the close button ("Collapse graph") to return to the page.

The other tabs on the Memory page:

- **Facts**: search, filter by category, add a memory, or delete one after confirming
- **Sessions**: the current session's turns and saved session summaries
- **Settings**: a link to Settings > Data, and an **Advanced** section with a read-only character state view and a parser test

## Reading the Graph

### Nodes

Each node is one saved memory (a fact). The color shows its category:

| Color | Category | Filter button |
|-------|----------|---------------|
| Blue | Facts about you: preferences, background, plans | About you |
| Pink | The relationship between you and the companion | Relationship |
| Green | Things you did or talked about together | Shared |

### Links

A line joins two memories whose embeddings have a cosine similarity of 0.5 or more. Small particles move along the lines. With reduced motion turned on in your system settings, the particles stop and the layout settles without animation.

### Count

The line under the graph shows how many memories and connections are in the current view.

## Interacting

### Selecting a Memory

Click a node, or pick it from the **Inspect a memory** list (the keyboard-friendly way).

- The selected memory and its direct connections stay colored. Everything else fades.
- **Memory details** appears beside the graph on wide screens and below it on narrow ones. It shows the text, category, importance, confidence, how many times it was referenced, and when it was created.
- **Open in Facts** opens that exact memory in the Facts tab, where you can delete it.

### Filtering

The category buttons above the graph show or hide each category. If a filter hides everything, **Show all categories** brings them back.

### Reset View

**Reset view** clears the selection and zooms to fit the whole graph. You can also drag nodes and zoom with the mouse or trackpad.

## How It Is Built

`src/lib/services/memory-graph.ts` loads every fact that has an embedding from the current model, then compares each pair. Pairs at 0.5 similarity or above become links. `src/lib/components/memory/MemoryGraph.svelte` draws the result with the `force-graph` library on a canvas.

Embeddings come from `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, run locally through Transformers.js. Each is a 384-dimension vector, and the model handles many languages.

- **Reference count:** how many times retrieval has pulled the memory into a prompt. A high count means it often shapes her replies.
- **Importance (0 to 100):** set when the memory is saved, from its length, emotional words, personal details, and sentiment. Retrieval uses it alongside similarity.
- **Confidence (0 to 1):** how sure the app is that the memory is accurate. New memories default to 0.8.

### Requirements

- Only memories with an embedding from the current model appear. Facts still waiting for one are listed in the Facts tab.
- The embedding model loads when the app opens. After it loads, facts without an embedding, or with one from an older model, are embedded in the background.
- If no memory has a current embedding yet, the graph shows "No connected memories yet" with a **View facts** button.

## Related

- [Companion System](/docs/technology/companion-system#memory-system): retrieval, dedup, and the memory budget
- [Architecture Overview](/docs/technology/architecture#memory-system): where the memory code lives
