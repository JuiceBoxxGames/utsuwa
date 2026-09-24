import { characterStore } from '$lib/stores/character.svelte';
import { parseResponse, validateStateUpdates, extractPotentialFacts } from '$lib/ai/response-parser';
import { buildExtractionSystemPrompt } from '$lib/ai/prompt-builder';
import { calculateBaselineUpdates, analyzeMessage } from '$lib/engine/heuristics';
import { mergeUpdates, checkAndApplyStageTransition } from '$lib/engine/state-updates';
import {
	recordTurn,
	memoryApi,
	determineFactCategory,
	calculateFactImportance
} from '$lib/engine/memory';
import { checkAllEvents, checkEvent, eventsApi } from '$lib/engine/events';
import { allEvents, relationshipStrainEvent } from '$lib/data/events';
import { extractStateUpdates } from './client-chat';
import { extractReminderTags } from '$lib/utils/reminders';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { ensureSession } from '$lib/engine/memory';
import { requestAvatarAction } from '$lib/services/animation-actions';
import type { LLMProvider } from '$lib/types';
import type { EventDefinition } from '$lib/types/events';

export interface CompanionTurnInput {
	userMessage: string;
	companionResponse: string;
	llm: {
		provider: string;
		model: string;
		apiKey?: string;
		baseURL?: string;
		hasImages: boolean;
	};
	// When true, the turn is a system event (e.g. a fired reminder). Skip user-
	// specific side effects like sentiment analysis, baseline stat updates,
	// streak/interaction counting and fact extraction from the trigger text.
	systemEvent?: boolean;
	// DEV-only console logging of the raw/parsed model output.
	debug?: boolean;
}

export interface CompanionTurnResult {
	// Cleaned dialogue to display/speak.
	dialogue: string;
	// Memory the model produced this turn, if any (the app attaches it to kept photos).
	newMemory?: string;
	// An event that should be shown after this turn, if one triggered.
	triggeredEvent: EventDefinition | null;
}

// Runs the full companion turn: parse the model output (with a forced-JSON
// extraction fallback for models that skip the inline state block), apply state
// and mood updates, persist the exchange and any extracted facts, run a stage
// transition, and check for triggered events. Shared by the main app and the
// overlay so their pipelines can't drift (the overlay previously lacked the
// extraction fallback). Page-specific side effects — showing the event modal,
// keeping photos — stay in the pages via the return value.
export async function processCompanionTurn(input: CompanionTurnInput): Promise<CompanionTurnResult> {
	const { userMessage, companionResponse, llm, systemEvent = false, debug = false } = input;

	const state = characterStore.state;
	// System events (e.g. fired reminders) must not trigger sentiment heuristics,
	// baseline stat updates, streak/interaction counting or fact extraction from
	// the trigger text.
	const userAnalysis = systemEvent ? null : analyzeMessage(userMessage);
	const baselineUpdates = systemEvent ? null : calculateBaselineUpdates(userMessage, state);

	// Extract any reminder tags the model emitted and schedule them.
	const { reminders: llmReminders, cleanedText: reminderCleaned } = extractReminderTags(companionResponse);
	const sessionId = await ensureSession();
	if (sessionId && llmReminders.length > 0) {
		for (const r of llmReminders) {
			try {
				await reminderStore.addReminder(r.content, r.triggerAt, sessionId);
			} catch (e) {
				console.error('[Reminder] Failed to save LLM reminder:', e);
			}
		}
	}

	const parsed = parseResponse(reminderCleaned, state.name);
	const dialogue = parsed.dialogue;
	let llmUpdates = parsed.stateUpdates;

	if (debug) {
		console.log('%c[LLM raw response]', 'color:#00b2ff;font-weight:bold', companionResponse);
		console.log('%c[LLM parsed]', 'color:#22c55e;font-weight:bold', {
			stateUpdates: llmUpdates,
			new_memory: llmUpdates?.newMemory ?? null
		});
	}

	// Decoupled fallback: the model skipped the inline JSON, so ask a dedicated
	// forced-JSON call to extract mood + memory from the exchange.
	if (!llmUpdates) {
		const extracted = await extractStateUpdates({
			provider: llm.provider as LLMProvider,
			model: llm.model,
			apiKey: llm.apiKey,
			baseURL: llm.baseURL,
			system: buildExtractionSystemPrompt(llm.hasImages),
			userMessage,
			reply: dialogue
		});
		if (extracted) {
			// parseResponse handles both bare JSON (OpenAI json_object) and a
			// model-added ```json fence (Anthropic). Don't re-wrap.
			llmUpdates = parseResponse(extracted).stateUpdates;
			if (debug) {
				console.log('%c[extraction fallback]', 'color:#f59e0b;font-weight:bold', extracted, '->', llmUpdates);
			}
		}
	}

	let validatedLLMUpdates = null;
	if (llmUpdates) {
		validatedLLMUpdates = validateStateUpdates(llmUpdates).sanitized;
	}

	// For non-Latin input the keyword baseline is meaningless (English lists),
	// so the LLM's sanitized deltas carry full weight instead of being clamped
	// relative to it. Otherwise the game layer silently flatlines for users
	// chatting in Japanese and other non-Latin languages.
	const finalUpdates = systemEvent
		? validatedLLMUpdates || {}
		: mergeUpdates(baselineUpdates || {}, validatedLLMUpdates || {}, {
				trustLLMDeltas: userAnalysis?.nonLatinDominant ?? false
			});
	characterStore.applyUpdates(finalUpdates, { countInteraction: !systemEvent });
	if (finalUpdates.action) requestAvatarAction(finalUpdates.action);

	// Save the model's memory observation
	if (finalUpdates.newMemory) {
		try {
			await memoryApi.createFact({
				content: finalUpdates.newMemory,
				category: determineFactCategory(finalUpdates.newMemory),
				importance: calculateFactImportance(finalUpdates.newMemory)
			});
		} catch (e) {
			console.debug('[Memory] Failed to save LLM observation:', e);
		}
	}

	// Stage transitions (Dating Sim Mode only)
	let stageStrained = false;
	if (characterStore.appMode === 'dating_sim') {
		const completedEventIds = characterStore.state.completedEvents || [];
		const transition = checkAndApplyStageTransition(characterStore.state, completedEventIds);
		if (transition.transitioned && transition.toStage) {
			characterStore.setRelationshipStage(transition.toStage);
			stageStrained = transition.strained;
		}
	}

	// Persist the exchange (and mirror into working memory) so it survives reloads.
	// For system events only the assistant reply is persisted; the trigger is not
	// a user turn.
	if (!systemEvent) {
		await recordTurn({ role: 'user', content: userMessage });
	}
	await recordTurn({ role: 'assistant', content: dialogue });

	// Extract and persist facts from the exchange. When the model already
	// produced a memory this turn, cap the heuristic extraction at one so a
	// single exchange can't fill the facts table with three takes on the same
	// information. Skipped for system events.
	if (!systemEvent && userAnalysis) {
		const potentialFacts = extractPotentialFacts(dialogue, userMessage);
		const maxHeuristicFacts = finalUpdates.newMemory ? 1 : 2;
		for (const factContent of potentialFacts.slice(0, maxHeuristicFacts)) {
			try {
				await memoryApi.createFact({
					content: factContent,
					category: determineFactCategory(factContent),
					importance: calculateFactImportance(factContent, userAnalysis.sentiment)
				});
			} catch (e) {
				console.debug('Failed to save fact:', e);
			}
		}
	}

	// Check for triggered events (Dating Sim Mode only)
	let triggeredEvent: EventDefinition | null = null;
	if (!systemEvent && characterStore.appMode === 'dating_sim') {
		try {
			const completedEvents = await eventsApi.getCompletedEvents();

			// A demotion this turn takes over the event slot so the character can
			// acknowledge the strain instead of it happening silently. checkEvent
			// still applies the cooldown via the completion records.
			if (stageStrained) {
				const strain = checkEvent(relationshipStrainEvent, characterStore.state, completedEvents);
				if (strain.triggered) {
					triggeredEvent = relationshipStrainEvent;
				}
			}

			if (!triggeredEvent) {
				const triggeredEvents = checkAllEvents(allEvents, characterStore.state, completedEvents, userMessage);
				if (triggeredEvents.length > 0) {
					triggeredEvent = triggeredEvents[0];
				}
			}
		} catch (e) {
			console.debug('Event check failed:', e);
		}
	}

	return { dialogue, newMemory: finalUpdates.newMemory || undefined, triggeredEvent };
}
