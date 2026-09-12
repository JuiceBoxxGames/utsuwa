---
title: Companion System
description: Architecture documentation for Utsuwa's companion relationship and character state system.
---

# Companion System Architecture

## Overview

The Companion System is the core engine that manages relationship state, character emotions, memory, and event progression. The key design principle: **the app is the game master** — it controls emotions, mood, relationship state, and the LLM is purely a dialogue generator that can suggest state changes via JSON.

## Design Principles

1. **App-Controlled State** — All character state is managed by the application. The LLM doesn't have internal state.
2. **Hybrid Updates** — App heuristics calculate baseline state changes; the LLM can override mood and suggest additional changes via JSON.
3. **Graceful Degradation** — If the LLM fails to output valid JSON, the system works using heuristics alone.
4. **Multi-Axis Relationships** — Instead of a single affection score, relationships are tracked across 5 dimensions.
5. **Event-Driven Progression** — Milestone events trigger at specific relationship thresholds.
6. **Single Companion** — One unified character state combining persona metadata and stats.
7. **Dual Mode Operation** — Users can choose between Companion Mode (simple assistant) and Dating Sim Mode (full relationship mechanics).

## App Modes

Utsuwa supports two distinct modes:

### Companion Mode

- Simple AI assistant experience without relationship mechanics
- Relationship stage is locked to "Companion"
- No stat progression — affection, trust, intimacy, etc. remain static
- Dating sim stats are preserved; switching back recalculates the stage

### Dating Sim Mode (Default)

- Full relationship mechanics enabled
- Progress through 8 relationship stages (Stranger to Soulmate)
- Stats change based on conversations and interactions
- Events trigger at milestones

When switching from Dating Sim to Companion Mode, the current relationship stage is saved to `savedDatingSimStage`. Switching back recalculates the relationship stage from current stats.

## Data Models

### Character State

The central data structure tracking all relationship and character data. A unified record combining persona metadata with character stats.

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
  appMode: AppMode;
  relationshipStage: RelationshipStage;
  savedDatingSimStage?: RelationshipStage;
  personality: PersonalityProfile;
  lastInteraction: Date | null;
  lastDecayAt?: Date | null;   // decay applies once per absence, not per reload
  firstMet: Date;
  daysKnown: number;
  totalInteractions: number;
  currentStreak: number;
  longestStreak: number;
  streakLastDate: string | null;
  completedEvents: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Mood State

Tracks current emotional state with causality — the system remembers *why* the companion feels a certain way.

```typescript
interface MoodState {
  primary: Emotion;
  intensity: number;     // 0-100
  secondary?: Emotion;
  causes: string[];      // Last 5 causes
}

type Emotion =
  | 'happy' | 'sad' | 'excited' | 'anxious'
  | 'content' | 'frustrated' | 'curious'
  | 'affectionate' | 'playful' | 'melancholy'
  | 'flustered' | 'neutral';
```

### Relationship Stages

Nine stages total — one special Companion Mode stage (not part of progression) plus eight Dating Sim progression stages (Stranger through Soulmate).

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

| Stage | Affection | Trust | Intimacy | Comfort | Respect | Days Known | Interactions | Required Events |
|-------|-----------|-------|----------|---------|---------|------------|--------------|-----------------|
| Stranger | 0 | 0 | - | - | - | - | - | - |
| Acquaintance | 50 | 20 | - | - | - | - | 3 | - |
| Friend | 150 | 50 | - | - | - | 3 | 10 | - |
| Close Friend | 300 | 70 | - | 50 | - | 7 | 25 | - |
| Romantic Interest | 450 | 75 | 30 | - | - | 10 | - | first_deep_conversation, shared_vulnerability |
| Dating | 600 | 85 | 50 | - | - | 14 | - | confession_accepted |
| Committed | 800 | 95 | 75 | 80 | - | 30 | - | commitment_accepted |
| Soulmate | 950 | 100 | 90 | 95 | 90 | 60 | - | deep_bond_moment |

`confession_accepted` and `commitment_accepted` are choice outcome markers, not event ids: only the accept choice of the confession or commitment talk grants them. Deferring either talk leaves the stage locked, and a repeatable follow-up event (`confession_revisit` / `commitment_revisit`) resurfaces the question later so the door stays open.

## Memory System

### Three-Tier Memory

1. **Working Memory** (in-memory) — Last 20 conversation turns, current session context
2. **Facts** (IndexedDB) — Extracted knowledge about the user, indexed with vector embeddings
3. **Sessions** (IndexedDB) — Summaries of past conversations

### Semantic Memory Search

Facts are indexed using vector embeddings for semantic similarity search. Instead of keyword matching, the system finds facts by meaning — "outdoor activities" can retrieve memories about hiking even without shared words.

**How it works:**
- Uses Transformers.js with the multilingual `paraphrase-multilingual-MiniLM-L12-v2` model (runs locally; works across languages, not just English)
- Embeddings are 384-dimensional vectors stored alongside facts in IndexedDB
- On query, the user message is embedded and compared using cosine similarity
- Results ranked by blending semantic similarity (70%) with importance score (30%), minimum similarity 0.3
- Triggered memories (keyword-based re-search) use a different blend: 60% similarity / 40% importance, minimum similarity 0.5
- Falls back to keyword search if the embedding model fails to load

**Performance:**
- Model loads in 2-5 seconds (cached after first load)
- Embedding generation: 10-50ms per fact
- Similarity search: under 10ms even with thousands of facts
- Storage: ~1.5KB per fact for embeddings

### Fact Structure

```typescript
interface Fact {
  id?: number;
  content: string;
  category: FactCategory;  // 'user' | 'relationship' | 'shared_experience'
  importance: number;       // 0-100
  confidence: number;       // 0-1
  source?: string;
  referenceCount: number;
  createdAt: Date;
  lastAccessed?: Date;
  embedding?: number[];     // 384-dim vector
  embeddingModel?: string;  // which model produced it; drives re-embedding on upgrades
}
```

### Memory Sources

Facts are captured from two sources:

1. **LLM Observations** — The LLM can output a `new_memory` field in its JSON response with insights about the user. These are automatically saved.
2. **Pattern Extraction** — Regex patterns extract facts from user messages (e.g., "My name is...", "I work at...", "I like...").

### Memory Retrieval

When building prompts, the system retrieves:
- Recent turns from working memory
- Relevant facts by semantic similarity search (falls back to keyword search)
- Triggered memories (high-importance facts semantically related to conversation)
- Recent session summaries (if returning after absence)

## Showing Her Images (Multimodal)

Users can "show" their companion an image the way you'd show a friend something on your phone: via the camera button in the chat bar, or by dragging a photo onto it. It is framed as *showing her something*, not "attaching a file."

### How it works

- **Vision gating**: The camera affordance is only active when the selected model can actually see. `canShowImages()` combines a provider-level `supportsVision` flag (OpenAI, Anthropic, Google, xAI) with a model-name heuristic (`modelSupportsVision`) for local providers (Ollama / LM Studio), where capability depends on the installed model (LLaVA, gemma3:4b, qwen2.5-vl, ...). Text-only models get a gentle prompt to switch, not a silent failure.
- **Format handling**: Picked images are normalized before send. Oversized images are downscaled (longest edge clamped) and re-encoded to JPEG; decodable-but-unsupported formats (e.g. HEIC on Safari) are converted to JPEG; formats the browser cannot decode and the vision APIs will not accept (e.g. HEIC on Chrome) are rejected with a clear message. Supported wire formats are JPEG, PNG, GIF, and WebP.
- **Provider wire formats**: The same in-memory image is serialized per provider (OpenAI-style `image_url` data URLs, or Anthropic-style base64 `source` blocks) by `toOpenAIContent` / `toAnthropicContent`.
- **Memory + the board**: A shown image can become a "photo memory" — the companion may leave a note about what she saw — and kept photos are stored locally (blob + thumbnail) and surfaced on a scrapbook-style **photoboard**.

### Privacy

Images stay on your device. Only vision-capable models receive them, and only for the single inference where you show them. When a cloud provider is selected, a one-time disclosure tells the user their photo is sent to that provider to be seen; with a local provider it notes the image never leaves the machine. Kept photos can be deleted from the board at any time.

## Time-Based Recovery and Decay

When the app loads, it calculates hours since the last interaction and applies recovery or decay.

### Energy Recovery

- **Full recovery** — 6+ hours away restores energy to 100
- **Partial recovery** — Ratio-based (hours / 6), minimum 1 energy per session

### Affection Decay

- **Threshold** — 48+ hours away
- **Rate** — 1-5% per session based on days away
- **Cap** — Maximum 50 affection lost per session

### Trust Decay

- **Threshold** — 7+ days away
- **Rate** — 2 trust per week away
- **Cap** — Maximum 10 trust lost per session

### Mood Shift

- **Threshold** — 3+ days away
- **Effect** — Mood shifts to melancholy
- **Intensity** — Increases 5 per day away (max 30)

## Event System

### Event Definition

```typescript
interface EventDefinition {
  id: string;
  name: string;
  type: 'milestone' | 'random' | 'scheduled' | 'conditional' | 'anniversary';
  conditions: EventCondition[];
  scene?: Scene;
  stateChanges?: Partial<StateUpdates>;
  unlocks?: string[];
  achievementId?: string;
  cooldownDays?: number;
  lastTriggered?: Date;
  oneTime: boolean;
  priority: number;
}
```

### Condition Types

| Condition | Description |
|-----------|-------------|
| min_affection | Minimum affection level |
| min_trust | Minimum trust level |
| min_intimacy | Minimum intimacy level |
| min_comfort | Minimum comfort level |
| min_respect | Minimum respect level |
| max_energy | Maximum energy (for tired events) |
| relationship_stage | Exact stage match |
| relationship_stage_min | Minimum stage |
| days_known | Minimum days known |
| total_interactions | Minimum chat count |
| event_completed | Prerequisite event |
| event_not_completed | Event not yet triggered |
| time_of_day | morning / afternoon / evening / night |
| day_of_week | 0-6 (Sunday-Saturday) |
| random_chance | Probability (0-1) |
| keyword_mentioned | Word in message |
| mood_is | Specific mood |
| mood_intensity_min | Minimum intensity |
| consecutive_days | Minimum streak |
| hours_since_last_interaction_min | Time away minimum |
| hours_since_last_interaction_max | Time away maximum |

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

### Event Categories

Events are organized by type (`milestone`, `random`, `scheduled`, `conditional`, `anniversary`), and grouped into four files:

1. **Milestone Events** — First meeting, anniversaries, deep conversations, streak achievements
2. **Random Events** — Questions, compliments, memories, teases
3. **Romantic Events** — Confession, dates, commitment ceremonies
4. **Time-Based Events** — Morning greetings, late night chats, weekend vibes

## Prompt Architecture

The system prompt is built from up to 7 layers:

1. **System** — Rules, output format, current time
2. **Character** — Name, personality, background, speech patterns
3. **Current State** — Mood, energy, relationship stage and stats, days known
4. **Memory** — Recent conversation turns, relevant facts, session context
5. **Being Shown** *(optional)* — Present only when the user shows an image: frames the photo as something she is being shown in the moment, not a file attachment
6. **Event** *(optional)* — Present only for system events such as a fired reminder: the trigger text arrives in an `<event>` block instead of a user turn
7. **Instructions** — Stage-specific behavior guidance, JSON output format

### Turn Progress Hooks

The send loop (`companion-chat.ts`) reports progress to whichever surface hosts it (main app or desktop overlay) through a small hooks interface. Beyond the typing flag and the final reply, an optional `setPhase` hook narrates what the turn is actually doing: `remembering` while memory retrieval builds the prompt, then `seeing` (image turns) or `thinking` once the model call starts. The UI renders these as a shimmer label in the speech bubble and chat window instead of anonymous typing dots. The phases are driven by the real pipeline stages, never simulated.

### System Events and Reminders

Not every turn starts with the user. The companion can schedule reminders and timers, either by emitting a `[reminder:5min]content[/reminder]` tag in her reply or from natural phrasing like "remind me in 10 minutes" via a client-side fallback. Reminders persist in the `reminders` table, fire from a poll loop that survives reloads, and timers missed while the app was closed surface on the next launch.

A fired reminder is delivered as a **system event**: the trigger text enters the prompt through the `<event>` layer instead of a fake user message, and the turn deliberately skips everything that would pretend the user spoke. Sentiment heuristics, baseline stat updates, streak and interaction counting, fact extraction, and event checks are all bypassed; her reply is still parsed, spoken through TTS, and can chain further reminders. Machine-generated turns can never advance the relationship or reset the away-time clock.

### Context Window and Memory Budget

The LLM settings expose a **Context Window** slider that tells Utsuwa how many tokens the selected model can process. This value is used in three places:

1. **Memory retrieval** — `retrieveRelevantContext` asks working memory for up to the budgeted number of recent turns. Without a context window configured it falls back to 10 turns; with a large window configured it retrieves up to 20, so the larger budget is actually used.

2. **Memory injection** — The prompt builder injects only the budgeted number of recent conversation turns and relevant facts. Small local models (1K–4K tokens) receive a minimal memory layer so the system prompt itself does not overflow the window. Larger models receive more turns and facts up to a reasonable ceiling.

3. **History truncation** — Before a request is sent, the assembled messages are trimmed so the system prompt plus conversation history plus a small reserve for the model's response fit inside the configured window. Truncation always keeps the system prompt and the user's newest message; older history is dropped first.

The reserve and scaling are intentionally conservative. If the system prompt alone is larger than the window, Utsuwa still keeps the newest user message and lets the provider handle the overflow rather than silently dropping the user's current turn.

### LLM Output Format

The companion uses a **two-path state extraction** model, so it stays reliable across everything from GPT-4o down to a 4B local model:

1. **Inline fast path** — The model replies in character, then ends with a JSON block of state updates. Capable models do this every turn, so nothing extra is needed.

   ```json
   {
     "mood_change": { "emotion": "happy", "intensity_delta": 10 },
     "affection_delta": 5,
     "trust_delta": 2,
     "intimacy_delta": 3,
     "comfort_delta": 1,
     "respect_delta": 0,             // supported by parser, not in prompt template
     "new_memory": "User mentioned they like hiking",
     "new_inside_joke": "optional string (defined in schema but not mapped by parser)",
     "triggered_event": "optional_event_id"
   }
   ```

2. **Decoupled extraction fallback** — Smaller and roleplay-tuned models often skip or mangle that block. When the inline JSON is missing, a second non-streaming call re-derives the state from the exchange, constrained to JSON (`response_format: json_object` for OpenAI-compatible providers; a dedicated system prompt on Anthropic's `/messages`). It returns the same shape including the relationship deltas, so memory and relationship movement land even when the model ignores the format. Capable models never trigger it — the inline block is already valid — so there's no extra call on the fast path.

Both modes write memories: **Companion Mode** also emits `new_memory` (only mood/energy and memory apply there — relationship deltas are ignored), while **Dating Sim Mode** uses the full set.

### Response Parsing & Robustness

`response-parser.ts` normalizes model output defensively before it's applied — this is what makes small and local models usable:

- **Reasoning traces stripped** — `<think>...</think>` (and a lone `</think>`) from R1-style models are removed before parsing or display, so the scratchpad never leaks into the chat bubble or gets mistaken for the state block.
- **Tolerant JSON** — trailing commas, `//` and `/* */` comments, and bare (unfenced) JSON are accepted; the parser also pulls the state object out of surrounding prose via a balanced-brace scan.
- **Leaked stop tokens cut** — `</s>`, `<|im_end|>`, `<|eot_id|>`, `<end_of_turn>` and stray template tokens are stripped, and runaway output after an end-of-turn marker is dropped.
- **Hallucinated turns cut** — when a model keeps writing as the user or a narrator (e.g. `Name: "a third-person note"`), that trailing fake turn is removed from the dialogue.
- **Emotion normalization** — free-form and compound emotions (`"grateful|cared-for"`, `"excitement"`, `"nervous"`) are mapped to the canonical set; genuinely unknown ones are dropped rather than guessed.

All deltas are clamped and emotions whitelisted, so a malformed or exaggerated update can't corrupt saved state.

## Heuristics Engine

### Message Analysis

Each user message is analyzed for:
- **Sentiment** — Positive/negative based on keyword matching
- **Topic Depth** — Shallow, moderate, or deep
- **Emotional Content** — Presence of emotional language
- **Questions** — Whether the message asks something

### Baseline Calculations

| Factor | Effect |
|--------|--------|
| Positive sentiment | +2 affection, +1 comfort |
| Negative sentiment | -1 affection, -1 comfort |
| Deep topic | +2 affection, +2 intimacy, +1 trust, -2 energy |
| Moderate topic | +1 affection, +1 intimacy, -1 energy |
| Shallow topic | -1 comfort |
| Emotional content | +2 intimacy, +1 trust, +1 affection |
| Questions asked | +1 respect, +1 trust |
| Non-linear affection | Fast early (1.5x), normal middle, slow late (0.7x) |
| Randomness | +/-20% variance on affection and trust deltas |

### State Merging

When the LLM provides JSON suggestions:
1. LLM mood change overrides baseline mood entirely
2. LLM affection delta is capped at ±2x the baseline magnitude (minimum cap of ±5)
3. LLM trust delta is capped at ±2x the baseline magnitude (minimum cap of ±3)
4. LLM intimacy/comfort/respect deltas are clamped to [-3, 5]
5. Energy delta always comes from heuristics (LLM cannot change energy)
6. Memory and event suggestions pass through unchanged

## Interaction Flow

```
User sends message
    |
[App] Calculate baseline state updates (heuristics)
    |
[App] Retrieve relevant memories
    |
[App] Build prompt with context
    |
[LLM] Generate response
    |
[App] Parse response + JSON
    |
[App] Merge LLM suggestions with baseline
    |
[App] Apply state updates
    |
[App] Check stage transitions
    |
[App] Check event triggers
    |
[App] If event triggered, present scene
    |
[App] Save state to IndexedDB
    |
[UI] Display response + trigger animation
```

## Storage

All data is stored client-side on the user's device using IndexedDB via Dexie.js.

### Database Schema

```typescript
const db = new Dexie('utsuwa-db');

// v2: Single character model (migrated from v1 multi-persona)
db.version(2).stores({
  characterStates: '++id, updatedAt',
  facts: '++id, category, importance, createdAt',
  sessions: '++id, startedAt',
  conversationTurns: '++id, sessionId, createdAt',
  completedEvents: '++id, eventId, completedAt',
  companion: null  // Delete legacy table
});

// v3: Added optional 384-dim embedding vectors to facts
db.version(3).stores({
  characterStates: '++id, updatedAt',
  facts: '++id, category, importance, createdAt',
  sessions: '++id, startedAt',
  conversationTurns: '++id, sessionId, createdAt',
  completedEvents: '++id, eventId, completedAt'
});

// v4: Reminders table for scheduled tasks and timers
// v5: Compound index [executed+triggerAt] for efficient due/upcoming queries
// v6: dismissed flag so fired reminders survive reloads until dismissed
db.version(6).stores({
  characterStates: '++id, updatedAt',
  facts: '++id, category, importance, createdAt',
  sessions: '++id, startedAt',
  conversationTurns: '++id, sessionId, createdAt',
  completedEvents: '++id, eventId, completedAt',
  reminders: '++id, sessionId, triggerAt, executed, dismissed, [executed+triggerAt]'
});
```

### Data Export/Import

Users can export all data as a JSON save file. Vector embeddings are stripped from exports (they're regenerated on import).

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


## Inspecting memory

Settings > Memory lists saved facts, the current session, session summaries, and character state. Search or filter facts, add one manually, or confirm an individual deletion. Additions use the existing memory creation path, including duplicate detection and embedding when available. Deletions affect future retrieval. The Test tab parses sample responses locally without applying state changes or saving facts.
