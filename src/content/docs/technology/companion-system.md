---
title: Companion System
description: How Utsuwa tracks relationship state, mood, memory, events, and the model's output.
---

# Companion System Architecture

## Overview

The companion system manages relationship state, mood, memory, and event progression. The core rule: **the app is the game master.** The app owns every number. The LLM writes dialogue and can suggest state changes in a JSON block, which the app bounds before applying.

The pure logic lives in `src/lib/engine/`. The turn pipeline that calls it lives in `src/lib/services/chat/companion-chat.ts` and `companion-turn.ts`.

## Design Principles

1. **App-controlled state.** All character state lives in the app. The LLM holds none.
2. **Hybrid updates.** Heuristics compute a baseline. The LLM can override mood and nudge the stats within limits.
3. **Graceful degradation.** If the model skips the JSON block, a second extraction call fills it in. If that fails too, heuristics carry the turn.
4. **Multi-axis relationships.** Five stats instead of one affection score.
5. **Event-driven progression.** Milestone events fire at thresholds and gate the later stages.
6. **Single companion.** One record holds persona metadata and stats.
7. **Two modes.** Companion Mode is a plain assistant. Dating Sim Mode runs the full relationship mechanics.

## App Modes

The mode is set on the Settings > Character page.

### Companion Mode

- No relationship mechanics. The stage is locked to `companion`.
- Mood and energy still change. Affection, trust, intimacy, comfort, and respect stay where they are.
- Memories are still saved.
- Events never fire.

### Dating Sim Mode (default)

- Eight stages from Stranger to Soulmate.
- All five stats move with conversation.
- Events fire at milestones.

Switching to Companion Mode saves the current stage in `savedDatingSimStage`. Switching back restores the higher of that saved stage and the stage the stats support now, so time spent in Companion Mode cannot drop a stage.

## Data Models

### Character State

One record combines the persona and the stats (`src/lib/types/character.ts`).

```typescript
interface CharacterState {
  id?: number;
  name: string;
  systemPrompt: string;
  extensions: PersonaExtensions;
  mood: MoodState;
  energy: number;              // 0-100
  affection: number;           // 0-1000
  trust: number;               // 0-100
  intimacy: number;            // 0-100
  comfort: number;             // 0-100
  respect: number;             // 0-100
  appMode: AppMode;            // 'companion' | 'dating_sim'
  relationshipStage: RelationshipStage;
  savedDatingSimStage?: RelationshipStage;
  personality: PersonalityProfile;
  lastInteraction: Date | null;
  lastDecayAt?: Date | null;   // decay applies once per absence
  firstMet: Date;
  daysKnown: number;
  totalInteractions: number;
  currentStreak: number;
  longestStreak: number;
  streakLastDate: string | null;
  completedEvents: string[];   // event ids plus choice outcome markers
  createdAt: Date;
  updatedAt: Date;
}
```

### Mood State

Mood tracks why she feels the way she does, not only what she feels.

```typescript
interface MoodState {
  primary: Emotion;
  intensity: number;     // 0-100
  secondary?: Emotion;
  causes: string[];      // last 5 causes
}

type Emotion =
  | 'happy' | 'sad' | 'excited' | 'anxious'
  | 'content' | 'frustrated' | 'curious'
  | 'affectionate' | 'playful' | 'melancholy'
  | 'flustered' | 'neutral';
```

The avatar's resting face follows the mood. `moodExpressionTarget()` in `src/lib/engine/mood-expression.ts` picks the first VRM expression the model has from a candidate list, then scales it by intensity:

| Emotion | Candidates (first match wins) | Weight at intensity 100 |
|---------|-------------------------------|-------------------------|
| excited | happy, joy | 0.8 |
| happy | happy, joy | 0.6 |
| sad | sad, sorrow | 0.6 |
| playful | happy, fun, joy | 0.5 |
| affectionate | happy, relaxed, joy | 0.5 |
| content | relaxed, fun | 0.5 |
| frustrated | angry | 0.5 |
| melancholy | sad, sorrow | 0.45 |
| flustered | surprised | 0.4 |
| anxious | sad, sorrow | 0.3 |
| curious | surprised | 0.3 |
| neutral | none | 0 |

VRM 1.0 preset names come first and VRM 0.x names such as `joy` and `sorrow` are fallbacks. `VrmModel.svelte` fades toward the target each frame and fully fades the old expression before a new one starts.

The model can also set `expression` in its JSON block, using the same emotion names. `flashExpressionTarget()` turns that into a stronger weight: 1.4 times the table value, capped at 0.9. The flash holds 2.5 seconds, or up to 8 seconds while she is speaking, then fades. `neutral` never flashes. The flash sits above the resting face and below tap reactions, emotes, and photo mode. Settings > Display > Mood expressions turns off both the resting face and the flash.

### Relationship Stages

Nine stages: the Companion Mode stage plus eight Dating Sim stages.

```typescript
type RelationshipStage =
  | 'companion'
  | 'stranger'
  | 'acquaintance'
  | 'friend'
  | 'close_friend'
  | 'romantic_interest'
  | 'dating'
  | 'committed'
  | 'soulmate';
```

### Stage Requirements (Dating Sim Mode)

From `src/lib/engine/stages.ts`. A dash means no requirement.

| Stage | Affection | Trust | Intimacy | Comfort | Respect | Days Known | Interactions | Required Markers |
|-------|-----------|-------|----------|---------|---------|------------|--------------|------------------|
| Stranger | 0 | 0 | - | - | - | - | - | - |
| Acquaintance | 50 | 20 | - | - | - | - | 3 | - |
| Friend | 150 | 50 | - | - | - | 3 | 10 | - |
| Close Friend | 300 | 70 | - | 50 | - | 7 | 25 | - |
| Romantic Interest | 450 | 75 | 30 | - | - | 10 | - | first_deep_conversation, shared_vulnerability |
| Dating | 600 | 85 | 50 | - | - | 14 | - | confession_accepted |
| Committed | 800 | 95 | 75 | 80 | - | 30 | - | commitment_accepted |
| Soulmate | 950 | 100 | 90 | 95 | 90 | 60 | - | deep_bond_moment |

`confession_accepted` and `commitment_accepted` are choice outcome markers, not event ids. Only the accept choice of the confession or commitment talk grants them. Deferring either talk leaves the stage locked, and a repeatable follow-up (`confession_revisit` or `commitment_revisit`) brings the question back later.

**Promotion and demotion.** Promotion happens as soon as the stats qualify. Demotion is damped: a stage holds until a stat falls below 85% of that stage's floor (`DEMOTION_HYSTERESIS`). Days known, interactions, and markers only grow, so they are not scaled. Without the band, one bad turn at a threshold would demote and the next good turn would re-promote. A real demotion fires the relationship strain event so she can acknowledge it.

**Streaks.** `src/lib/engine/streak.ts` counts consecutive local calendar days. A clock set backwards never resets a streak.

## Memory System

### Three Tiers

1. **Working memory** (in memory): the last 20 turns. On page load it is refilled from the 20 most recent saved turns.
2. **Facts** (IndexedDB): things she knows about the user, with 384-dimension embeddings.
3. **Sessions** (IndexedDB): one record per app run. On the next load, sessions without a summary get one built from the most frequent topic words (`src/lib/engine/session-summary.ts`). No LLM call is involved.

### Semantic Search

Retrieval runs in `retrieveRelevantContext()` in `src/lib/engine/memory.ts`.

- The model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, run locally through Transformers.js. It works across languages.
- The user's message is embedded and compared by cosine similarity against up to 500 of the most important facts.
- Relevant facts rank by 70% similarity and 30% importance, minimum similarity 0.3, up to 10 facts.
- Triggered memories come from phrases like "remember when..." and capitalized names. They rank by 60% similarity and 40% importance, minimum similarity 0.5, up to 5, and the prompt includes at most 3.
- If the model is not loaded or finds nothing, keyword search takes over, with the 5 most important facts always included.
- Every retrieved fact gets its reference count bumped.

Each vector records which model produced it (`src/lib/engine/embedding-version.ts`). Facts from an older model count as unembedded. After the model loads, the app re-embeds them in the background.

### Fact Structure

```typescript
interface Fact {
  id?: number;
  content: string;
  category: FactCategory;   // 'user' | 'relationship' | 'shared_experience'
  importance: number;       // 0-100
  confidence: number;       // 0-1
  source?: string;
  referenceCount: number;
  createdAt: Date;
  lastAccessed?: Date;
  embedding?: number[];     // 384-dim vector
  embeddingModel?: string;  // which model produced it
}
```

New facts default to importance 50 and confidence 0.8. `calculateFactImportance()` adds points for length, emotional words, personal details, and strong sentiment, up to 100.

### Memory Sources

1. **The model's `new_memory`.** Written in third person, one short sentence.
2. **The heuristic baseline.** If the model gives no memory, a simple "I'm..." or "I like..." match from the user's message stands in.
3. **Pattern extraction.** `extractPotentialFacts()` in `src/lib/ai/response-parser.ts` scans the user's message ("I work at", "I live in", "my name is") and her reply ("you mentioned", "I'll remember that"). It saves at most two facts per turn, or one when the model already wrote a memory.

### Deduplication

Before a fact is written, `src/lib/services/storage/memory.ts` compares it with facts in the same category (`src/lib/engine/fact-dedup.ts`). A match is either the same normalized text or a cosine similarity of 0.9 or more. On a match, the existing fact gets a higher reference count and the larger importance instead of a new row.

### What Goes Into the Prompt

- Recent turns from working memory
- Relevant facts
- Up to 3 triggered memories
- "Last time you talked", when more than 6 hours have passed and a past session has a summary

## Context Window and Memory Budget

Settings > LLM Model has a **Context Window** control: a switch for context window scaling and a slider from 1k to 128k tokens (default 8k). When scaling is on, the value is used three ways:

1. **Retrieval.** Working memory returns the budgeted number of turns. With scaling off it returns 10.
2. **Injection.** The prompt includes the budgeted turns and facts:

   | Context window | Recent turns | Relevant facts |
   |----------------|--------------|----------------|
   | Up to 4,096 | 6 | 3 |
   | Up to 8,192 | 10 | 5 |
   | Larger | 20 | 10 |
   | Scaling off | 6 | 5 |

3. **Truncation.** Before each request (and before each MCP tool round), older history is dropped until the system prompt, tool schemas, and history fit with a 500-token reserve for the reply. The system prompt and the current user message always stay. Token counts are estimates: one token per CJK character, one per four other characters.

## Showing Her Images (Multimodal)

Users show the companion an image with the paperclip button in the chat bar or by dropping a photo on it. It is framed as showing her something, not attaching a file.

- **Vision gating.** `canShowImages()` in `src/lib/services/providers/vision.ts` combines a provider flag (OpenAI, Anthropic, Google, xAI) with a model-name check for local providers, where it depends on the installed model (LLaVA, gemma3, qwen2.5-vl, and similar). Text-only models get a prompt to switch instead of a silent failure.
- **Format handling.** Images are downscaled so the longest edge is at most 1568 px. Formats the browser can decode but the APIs reject (such as HEIC on Safari) are converted to JPEG. Formats the browser cannot decode are rejected with a message. The wire formats are JPEG, PNG, GIF, and WebP.
- **Wire formats.** `toOpenAIContent` and `toAnthropicContent` in `src/lib/services/chat/content.ts` serialize the same image as `image_url` data URLs or Anthropic base64 `source` blocks.
- **Keepsakes.** A shown image is kept locally with a thumbnail and her memory note, and appears on the photoboard.

### Privacy

Images stay on the device except for the one request where they are shown, and only vision-capable models receive them. The first time a cloud provider is used, a notice says the photo goes to that provider. With a local provider it says the photo never leaves the machine. Kept photos can be deleted from the board.

## Time-Based Recovery and Decay

On load, `resolveTimeDecayOnLoad()` in `src/lib/engine/state-updates.ts` looks at the hours since the last interaction. Nothing happens under 30 minutes. Energy recovers on every load. Affection, trust, and mood decay apply once per absence, tracked with `lastDecayAt`, so a reload or a second window cannot apply them twice.

### Energy Recovery

- **6 or more hours away:** energy returns to 100.
- **Less:** recovers in proportion to hours / 6, at least 1 point.

### Affection Decay

- **Starts after 48 hours.**
- **Rate:** 1% per day beyond the first two, up to 5%.
- **Cap:** 50 affection per absence.

### Trust Decay

- **Starts after 7 days.**
- **Rate:** 2 per full week away.
- **Cap:** 10 per absence.

### Mood Shift

- **Starts after 3 days.**
- **Effect:** mood becomes `melancholy` with the cause "missing you".
- **Intensity:** rises 5 per day away, up to 30.

## Event System

### Event Definition

From `src/lib/types/events.ts`.

```typescript
interface EventDefinition {
  id: string;
  name: string;
  type: 'milestone' | 'random' | 'scheduled' | 'conditional' | 'anniversary';
  conditions: EventCondition[];   // all must pass
  scene?: Scene;
  stateChanges?: Partial<StateUpdates>;
  unlocks?: string[];
  achievementId?: string;
  oneTime: boolean;
  cooldownDays?: number;
  lastTriggered?: Date;
  priority: number;               // higher wins
}
```

### Condition Types

| Condition | Passes when |
|-----------|-------------|
| min_affection | Affection is at least the value |
| min_trust | Trust is at least the value |
| min_intimacy | Intimacy is at least the value |
| min_comfort | Comfort is at least the value |
| min_respect | Respect is at least the value |
| max_energy | Energy is at most the value |
| relationship_stage | The stage matches exactly |
| relationship_stage_min | The stage is at least the value |
| days_known | Days known is at least the value |
| total_interactions | Interactions are at least the value |
| event_completed | The event or marker is completed |
| event_not_completed | The event or marker is not completed |
| time_of_day | morning (5 to 12), afternoon (12 to 17), evening (17 to 21), or night |
| day_of_week | 0 to 6, Sunday to Saturday |
| random_chance | A random draw is below the value (0 to 1) |
| keyword_mentioned | The user's message contains the word |
| mood_is | The primary mood matches |
| mood_intensity_min | Mood intensity is at least the value |
| consecutive_days | The current streak is at least the value |
| hours_since_last_interaction_min | At least this many hours since the last talk |
| hours_since_last_interaction_max | At most this many hours since the last talk |

A one-time event never fires twice. A repeatable event waits `cooldownDays` after its last completion. When several events qualify, the highest priority wins. Events are checked after each Dating Sim turn and never on system-event turns. The model's `triggered_event` field is parsed but does not fire events; only conditions do.

### Scene Structure

```typescript
interface Scene {
  id: string;
  intro?: string;
  dialogue?: string;
  choices?: SceneChoice[];
  outro?: string;
  backgroundChange?: string;
  expressionOverride?: string;
  musicCue?: string;
}

interface SceneChoice {
  text: string;
  response: string;
  stateChanges: Partial<StateUpdates>;
  nextSceneId?: string;
  unlocks?: string[];
}
```

### Generated Moments

When an event fires, the chat model rewrites the scene's intro, dialogue, choice lines, and outro. The inputs are the persona, mode, stage, mood, days known, conversation count, up to 8 stored memories, and the user's last 4 messages. Memories are picked from the 40 most important facts, with shared experiences and relationship facts first. The recent messages set the language.

Structure never changes. The static scene is the template: choices keep their count and order, and `stateChanges`, `nextSceneId`, `unlocks`, and the completion record always come from it. The prompt allows references only to the memories it was given, since invented shared history reads worse than a general line.

The built-in scene plays when:

- Settings > Display > Personalized moments is off
- No chat provider is ready
- The request takes longer than 15 seconds
- The output fails validation: missing dialogue, a missing intro or outro the template has, a different number of choices, or text over the length caps (400 characters for narration, 1200 for dialogue, 160 for a choice, 800 for a response)

A written scene is cached per event for the session, so a dismissed event that comes back does not call the model again. Failures are not cached. The logic lives in `src/lib/engine/moments.ts` (prompt, parsing, memory selection) and `src/lib/services/events/moment-generator.ts` (transport).

### Event Files

`src/lib/data/events/` holds the definitions:

1. **`milestones.ts`**: first meeting, anniversaries, deep conversations, streaks
2. **`random.ts`**: questions, compliments, memories, teases
3. **`romantic.ts`**: confession, dates, commitment, and the revisit events
4. **`time-based.ts`**: morning greetings, late-night chats, weekends
5. **`strain.ts`**: the relationship strain event, dispatched directly on a demotion with a 1-day cooldown and not part of the regular pool

## Prompt Architecture

`buildSystemPrompt()` in `src/lib/ai/prompt-builder.ts` joins these layers in Dating Sim Mode:

1. **`<system>`**: rules, output format, current time, session length, and the next reminder
2. **`<character>`**: name and the persona's personality prompt
3. **`<current_state>`**: mood and its causes, energy, time since last talk, stage, stat descriptions, days known, streak
4. **`<memory>`**: recent turns, relevant facts, triggered memories, last session summary
5. **`<being_shown>`** (optional): only on image turns
6. **`<event>`** (optional): only for system events such as a fired reminder
7. **`<speech_output_control>`** (optional): only when speech is on with OmniVoice; teaches either native speech tools or the inline `speak()` syntax
8. **`<avatar>`** (optional): only when animations are enabled for her; lists each id and description
9. **`<instructions>`**: stage guidance, behavior parameters, the reminder tag, and the JSON format

Companion Mode uses a shorter prompt: system, character, a `<state>` with mood and energy only, memory, the same optional layers, and simpler instructions.

When MCP tools are active, an `<mcp_tool_security>` block is appended unless `PUBLIC_MCP_PROMPT_HARDENING=false` opts out. See [MCP Servers](/docs/guides/mcp#hardening).

### Turn Progress Hooks

The send loop reports progress through a small hooks interface, so the main app and the desktop overlay can each render it. `setPhase` narrates the real pipeline: `remembering` while memory retrieval builds the prompt, then `seeing` on image turns or `thinking` once the model call starts. The UI shows these as a shimmer label instead of anonymous typing dots.

### System Events and Reminders

The companion can schedule reminders with a `[reminder:5min]content[/reminder]` tag in her reply. If the user phrases a reminder naturally ("remind me in 10 minutes") and the model emits no tag, a client-side fallback schedules it. Reminders persist in the `reminders` table, fire from a poll loop that survives reloads, and ones missed while the app was closed surface on the next launch.

A fired reminder is delivered as a **system event**. The trigger text enters through the `<event>` layer instead of a user turn. Sentiment heuristics, baseline stat updates, streak and interaction counting, fact extraction, and event checks are all skipped. Her reply is still parsed, spoken, and can schedule more reminders. Machine-generated turns never advance the relationship or reset the away-time clock.

## LLM Output Format

State extraction has two paths, so it works from large cloud models down to small local ones.

### 1. Inline Block

The model replies in character and ends with a fenced JSON block. In Dating Sim Mode the prompt asks for:

```json
{
  "mood_change": { "emotion": "happy", "intensity_delta": 10 },
  "affection_delta": 5,
  "trust_delta": 2,
  "intimacy_delta": 3,
  "comfort_delta": 1,
  "new_memory": "They grew up in Seattle and miss the rain",
  "triggered_event": null,
  "action": null,
  "expression": null
}
```

- `action` appears only when at least one animation is enabled for her. It takes an animation id or `null`.
- `expression` takes one of the emotion names or `null`. The prompt tells her to use it only for a visible reaction in the moment.
- `respect_delta` is accepted by the parser but not requested.
- In Companion Mode the prompt asks only for `mood_change`, `new_memory`, and optionally `action` and `expression`. Energy always comes from heuristics, so the block never asks for it.

### 2. Extraction Fallback

Small and roleplay-tuned models often skip or mangle the block. When no usable block is found, `companion-turn.ts` makes one extra call through `completeJson()` in `src/lib/services/llm/transport.ts` with a dedicated extraction prompt. It uses the same transport as chat: direct calls use `response_format: json_object` for OpenAI-compatible providers and Anthropic's `/messages`; on web, cloud providers go through the `/api/chat` route and the streamed reply is read to the end. It returns mood, the four relationship deltas, and `new_memory`. Models that already produce the block never trigger it.

### Response Parsing and Robustness

`src/lib/ai/response-parser.ts` normalizes output before anything is applied:

- **Reasoning removed.** `<think>...</think>` blocks and a lone `</think>` are stripped before parsing or display.
- **Tolerant JSON.** Trailing commas, `//` and `/* */` comments, and unfenced JSON are accepted. A balanced-brace scan pulls the state object out of surrounding prose.
- **Stop tokens cut.** `</s>`, `<|im_end|>`, `<|eot_id|>`, `<end_of_turn>`, and similar tokens are removed, and text after an end-of-turn marker is dropped.
- **Fake turns cut.** When the model keeps writing as the user or a narrator on a later line (`They: ...`, `Name: "..."`), that tail is removed.
- **Text after the block dropped.** Only the text before the JSON block is the reply.
- **Emotion normalization.** Compound and free-form emotions (`"grateful|cared-for"`, `"nervous"`) map to the canonical set. Unknown ones are dropped.
- **Clamping.** Mood intensity is clamped to plus or minus 30, affection to 20, and the other stats to 10. Action ids must match `[a-z0-9_-]`, 1 to 64 characters.

## Animation Library

Settings > Animations lists seven built-in emotes and any `.vrma` files the user uploads. Uploads are parsed with the real loader before anything is saved, with a 25 MB and 60-second cap. Blobs live in the `utsuwa-animations` localforage store. Names, descriptions, and the "Companion can use" switches live in localStorage under `utsuwa-animations`, so other windows pick up edits.

Enabled entries are listed in the `<avatar>` prompt layer by id and description, and the JSON block gains `"action": null | "animation_id"`. `src/lib/engine/action-gate.ts` then drops unknown ids, repeats of the same animation within 20 seconds, and any action within 8 seconds of the previous one. Photo mode and an emote already playing always win, so a requested action is skipped, not queued.

The same page sets her base behavior. The idle cycle picks from a user-chosen pool (the five built-in idles plus uploads), never repeats the same clip twice in a row, switches after one to two loops, and waits while she talks, thinks, emotes, or poses. Pool ids are checked against the library at read time, so a deleted upload drops out, and an empty pool falls back to all five built-in idles. An optional thinking clip loops from sending until the first reply text arrives. Talking always uses the built-in talking clip.

## Heuristics Engine

### Message Analysis

`analyzeMessage()` in `src/lib/engine/heuristics.ts` reads each user message for:

- **Sentiment:** positive and negative English keywords and emoticons
- **Topic depth:** deep with 3 or more depth markers or over 200 characters; moderate with 1 marker or over 80 characters; otherwise shallow
- **Emotional content:** emotional keywords
- **Questions:** a question mark (ASCII or full-width) or a leading question word

The keyword lists are English. When a message is mostly non-Latin script, sentiment is skipped and the model's deltas carry full weight (see below).

### Baseline Calculations

Every message starts from -2 energy and +1 affection. Then:

| Factor | Effect |
|--------|--------|
| Positive sentiment (above 0.3) | +2 affection, +1 comfort |
| Negative sentiment (below -0.3) | -1 affection, -1 comfort |
| Deep topic | +2 affection, +2 intimacy, +1 trust, -2 energy |
| Moderate topic | +1 affection, +1 intimacy, -1 energy |
| Shallow topic | -1 comfort |
| Emotional content | +2 intimacy, +1 trust, +1 affection |
| Question | +1 respect, +1 trust |
| Affection phase | 1.5x under 300 affection, normal to 700, 0.7x above |
| Randomness | plus or minus 20% on affection and trust |

The results are clamped: affection -5 to 10, trust -3 to 5, intimacy -2 to 5, comfort -3 to 3, respect -2 to 3. Strong sentiment also sets a baseline mood (`happy`, `content`, `anxious`, or `sad`).

### State Merging

`mergeUpdates()` in `src/lib/engine/state-updates.ts` combines the baseline with the sanitized LLM suggestion:

1. The LLM's mood change replaces the baseline mood.
2. The LLM's affection delta is capped at twice the baseline's magnitude, at least 5.
3. The LLM's trust delta is capped at twice the baseline's magnitude, at least 3.
4. The LLM's intimacy, comfort, and respect deltas are clamped to -3 to 5.
5. Energy always comes from the baseline.
6. `new_memory`, `triggered_event`, `action`, and `expression` pass through.

For mostly non-Latin messages (`isNonLatinDominant()`), steps 2 to 4 are skipped and the sanitized LLM deltas apply as given. Otherwise the relationship would flatline for users writing in Japanese and similar languages.

## Interaction Flow

```
User sends message
    |
[App] Update streak and days known
    |
[App] Retrieve memories, build prompt
    |
[LLM] Stream reply (plus MCP tool rounds, if any)
    |
[App] Parse reply and JSON block
    |     (extraction call if the block is missing)
    |
[App] Heuristic baseline, merge with LLM suggestion
    |
[App] Apply state; play action; flash expression
    |
[App] Save the model's memory
    |
[App] Check stage transition (Dating Sim)
    |
[App] Save both turns; extract pattern facts
    |
[App] Check events (Dating Sim); strain event on demotion
    |
[UI] Show reply, speak it, open event scene if one fired
```

## Storage

All data is stored on the device in IndexedDB through Dexie (`src/lib/db/index.ts`).

### Database Schema

```typescript
// database: 'utsuwa-db'

// v2: single character (migrated from v1 multi-persona)
db.version(2).stores({
  characterStates: '++id, updatedAt',
  companion: null,  // legacy table removed
  facts: '++id, category, importance, createdAt',
  sessions: '++id, startedAt',
  conversationTurns: '++id, sessionId, createdAt',
  completedEvents: '++id, eventId, completedAt'
});

// v3: optional embedding vectors on facts (no index change)
// v4: reminders table
// v5: [executed+triggerAt] compound index for due queries
// v6: dismissed flag so fired reminders survive reloads
db.version(6).stores({
  characterStates: '++id, updatedAt',
  facts: '++id, category, importance, createdAt',
  sessions: '++id, startedAt',
  conversationTurns: '++id, sessionId, createdAt',
  completedEvents: '++id, eventId, completedAt',
  reminders: '++id, sessionId, triggerAt, executed, dismissed, [executed+triggerAt]'
});
```

### Data Export and Import

Settings > Data exports a JSON save file (`src/lib/db/export.ts`). Embeddings are stripped and rebuilt by the background backfill after import. Import can merge into or replace existing data.

```typescript
interface SaveFile {
  version: string;      // "2.0"
  exportedAt: string;
  appVersion: string;
  data: {
    character: CharacterState;
    facts: Fact[];
    sessions: SessionSummary[];
    conversationTurns: ConversationTurn[];
    completedEvents: CompletedEventRecord[];
  };
}
```

Reminders, uploaded models, animations, backgrounds, kept photos, and settings are not in the save file.

## Inspecting Memory

Settings > Memory has four tabs:

- **Graph**: the [memory graph](/docs/technology/memory-graph)
- **Facts**: search, filter by category, add a memory, or delete one with confirmation. Additions go through the normal creation path, including dedup and embedding.
- **Sessions**: the current session's turns and saved session summaries
- **Settings**: a link to Settings > Data, plus an Advanced section with a read-only view of character state and a parser test that parses sample responses without saving anything
