import type { MemoryBudget } from '../types/memory.ts';

/**
 * Scale memory injection based on the configured model context window.
 * Larger context windows allow more recent turns and relevant facts to be
 * injected into each prompt. When no context size is configured, callers
 * should fall back to the historical defaults (6 turns, 5 facts).
 */
export function getMemoryBudget(contextSize: number): MemoryBudget {
	if (contextSize <= 4096) {
		return { workingMemoryTurns: 6, relevantFacts: 3 };
	}
	if (contextSize <= 8192) {
		return { workingMemoryTurns: 10, relevantFacts: 5 };
	}
	return { workingMemoryTurns: 20, relevantFacts: 10 };
}
