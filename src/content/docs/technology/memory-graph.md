---
title: Memory Graph
description: Interactive visualization of semantic memory connections
---

# Memory Graph

The Memory Graph is an interactive network visualization that shows how your companion's memories are semantically connected.

## Accessing the Memory Graph

Open **Settings > Memory > Graph**, or click the brain icon on the main screen to go there directly. Choose **Expand graph** for more room. Escape or **Collapse graph** returns to the Memory page.

The same page has **Facts** for adding and deleting memories, **Sessions** for current turns and saved summaries, and **Settings > Advanced** for character state and parser testing.

## Understanding the Visualization

### Nodes (Memories)

Each node represents a stored memory (fact) about you, your relationship, or shared experiences.

**Node Colors:**
- **Blue** — User facts (your preferences, background, attributes)
- **Pink** — Relationship facts (dynamics between you and the companion)
- **Green** — Shared experiences (events you've discussed together)

### Connections

Lines between nodes indicate **semantic similarity** — memories that are related in meaning are connected. Animated particles flow along connections to visualize these relationships.

### Statistics

The count below the graph shows the memories and connections in the current view.

## Interactions

### Selecting a Memory

Click a node or choose it from **Inspect a memory**:
- The selected memory and its connections are highlighted
- Unrelated memories fade
- Details appear beside the graph on wide screens and below it on smaller screens
- **Open in Facts** opens that exact saved memory in the inspector, where deletion requires confirmation

### Filtering Categories

Use the category buttons above the graph to show or hide specific memory types. This helps focus on particular aspects of what your companion knows.

### Reset View

Click "Reset view" to zoom out and see the full graph, clearing any selection.

## Technical Details

The Memory Graph uses **384-dimensional embeddings** (via Transformers.js with the multilingual paraphrase-multilingual-MiniLM-L12-v2 model) to compute semantic relationships between memories. Memories with a **cosine similarity >= 0.5** are connected.

**Reference Count** tracks how many times a memory has been retrieved during conversations — higher counts indicate memories that frequently inform responses.

**Importance Score** (0-100) reflects how significant the memory is based on emotional content, personal details, and other heuristics.

### Requirements

- Memories must have embeddings to appear in the graph
- The embedding model is loaded automatically on app startup
- Existing memories without embeddings are backfilled automatically when the embedding model finishes loading

## Related

- [Companion System](/docs/technology/companion-system) — Full architecture including the three-tier memory system
- [Architecture Overview](/docs/technology/architecture) — System design and component interactions
