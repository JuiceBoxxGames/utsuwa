// Fact categories for long-term memory
export type FactCategory = 'user' | 'relationship' | 'shared_experience';

// A fact remembered about the user or relationship
export interface Fact {
	id?: number;
	content: string;
	category: FactCategory;
	importance: number; // 0-100, for retrieval ranking
	confidence: number; // 0-1, how sure we are this is accurate
	source?: string; // conversation or event that created this
	referenceCount: number;
	createdAt: Date;
	lastAccessed?: Date;
	embedding?: number[]; // 384-dim vector for semantic search
	embeddingModel?: string; // which model produced the vector; absent = legacy, needs re-embed
}

// Topic depth for conversation analysis
export type TopicDepth = 'shallow' | 'moderate' | 'deep';

// A single conversation turn
export interface ConversationTurn {
	id?: number;
	sessionId?: number;
	role: 'user' | 'assistant';
	content: string;
	metadata?: {
		detectedEmotion?: string;
		sentiment?: number; // -1 to 1
		topicDepth?: TopicDepth;
		stateChanges?: Record<string, number>;
	};
	createdAt: Date;
}

// Session summary (short-term memory)
export interface SessionSummary {
	id?: number;
	summary?: string;
	keyTopics: string[];
	emotionalArc?: string; // e.g., "started playful, became serious, ended warmly"
	stateSnapshot?: {
		mood: string;
		affection: number;
		trust: number;
		relationshipStage: string;
	};
	messageCount: number;
	startedAt: Date;
	endedAt?: Date;
}

// Context retrieved from memory for prompt building
export interface RelevantContext {
	recentTurns: ConversationTurn[];
	relevantFacts: Fact[];
	triggeredMemories: Fact[];
	recentSessions: SessionSummary[];
}

// Memory search options
export interface MemorySearchOptions {
	category?: FactCategory;
	limit?: number;
	minImportance?: number;
	keywords?: string[];
}

// New fact input
export interface NewFact {
	content: string;
	category: FactCategory;
	importance?: number;
	confidence?: number;
	source?: string;
}

// Scheduled reminder / task
export interface Reminder {
	id?: number;
	triggerAt: Date;
	content: string;
	executed: number;
	createdAt: Date;
	sessionId: number;
	dismissed?: number;
}

// Working memory state (in-memory during session)
export interface WorkingMemory {
	turns: ConversationTurn[];
	currentSessionId?: number;
	sessionStartedAt: Date;
	messageCount: number;
}

// Memory analysis result (from analyzing a message)
export interface MessageAnalysis {
	sentiment: number; // -1 to 1
	topicDepth: TopicDepth;
	detectedEmotion?: string;
	extractedFacts: string[];
	isQuestion: boolean;
	hasEmotionalContent: boolean;
	// Mostly non-Latin script: the English keyword heuristics didn't run, so
	// downstream should weight the LLM's own deltas fully.
	nonLatinDominant: boolean;
}

// Memory injection budget derived from the configured model context size.
// Only fields that are actually consumed by the prompt builder are included.
export interface MemoryBudget {
	workingMemoryTurns: number;
	relevantFacts: number;
}

// Constants
export const MAX_WORKING_MEMORY_TURNS = 20;
export const MAX_RELEVANT_FACTS = 10;
export const MAX_RECENT_SESSIONS = 3;
export const DEFAULT_FACT_IMPORTANCE = 50;
export const DEFAULT_FACT_CONFIDENCE = 0.8;
