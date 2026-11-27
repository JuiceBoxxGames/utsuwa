import { characterStore } from '$lib/stores/character.svelte';
import { vrmStore } from '$lib/stores/vrm.svelte';
import { parseResponse, validateStateUpdates, extractPotentialFacts } from '$lib/ai/response-parser';
import { buildExtractionSystemPrompt } from '$lib/ai/prompt-builder';
import { calculateBaselineUpdates, analyzeMessage } from '$lib/engine/heuristics';
import { mergeUpdates, checkAndApplyStageTransition } from '$lib/engine/state-updates';
import { memoryApi, determineFactCategory, calculateFactImportance } from '$lib/engine/memory';
import { recordTurn, ensureSession } from '$lib/engine/memory-session';
import { HEURISTIC_FACT_SOURCE } from '$lib/engine/fact-dedup';
import { checkAllEvents, checkEvent } from '$lib/engine/event-matching';
import { eventsApi } from '$lib/engine/events';
import { allEvents, relationshipStrainEvent } from '$lib/data/events';
import { dismissedEventIds } from '$lib/services/session/event-session.svelte';
import { completeJson, type LLMTarget } from '$lib/services/llm/transport';
import { extractReminderTags } from '$lib/utils/reminders';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { requestAvatarAction } from '$lib/services/animation-actions';
import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
import { toPromptActions } from '$lib/stores/animation-library-parser';
import type { EventDefinition } from '$lib/types/events';

export interface CompanionTurnInput {
	userMessage: string;
	companionResponse: string;
	llm: LLMTarget & { hasImages: boolean };
	// When true, the turn is a system event (e.g. a fired reminder). Skip user-
	// specific side effects like sentiment analysis, baseline stat updates,
	// streak/interaction counting and fact extraction from the trigger text.
	systemEvent?: boolean;
	// Adds query-only picture fields to the generic extraction fallback.
	showImagesEnabled?: boolean;
}

export interface CompanionTurnResult {
	// Cleaned dialogue to display/speak.
	dialogue: string;
	// Memory the model produced this turn, if any (the app attaches it to kept photos).
	newMemory?: string;
	// Search query for pictures she wants to show this turn (app resolves it).
	imageSearch?: string;
	// 1-based page for "show me more".
	imagePage?: number;
	// True when she is closing the image popup this turn.
	closeImages?: boolean;
	// An event that should be shown after this turn, if one triggered.
	triggeredEvent: EventDefinition | null;
}

function buildExtractionUser(userMessage: string, dialogue: string): string {
	return [`User: ${userMessage}`, `Companion: ${dialogue}`, 'Return the JSON.'].join('\n\n');
}

// Runs the full companion turn: parse the model output (with a forced-JSON
// extraction fallback for models that skip the inline state block), apply state
// and mood updates, persist the exchange and any extracted facts, run a stage
// transition, and check for triggered events. Shared by the main app and the
// overlay so their pipelines can't drift (the overlay previously lacked the
// extraction fallback). Page-specific side effects — showing the event modal,
// keeping photos — stay in the pages via the return value.
export async function processCompanionTurn(input: CompanionTurnInput): Promise<CompanionTurnResult> {
	const { userMessage, companionResponse, llm, systemEvent = false, showImagesEnabled = false } = input;

	const state = characterStore.state;
	// applyUpdates stamps lastInteraction with now, so absence-based events need
	// the gap as it was when this message arrived.
	const previousInteraction = state.lastInteraction;
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
	let imageSearch = parsed.imageSearch;
	let imagePage = parsed.imagePage;
	let closeImages = parsed.closeImages;

	// Generic state recovery only. Picture fields may come from the same
	// extraction, but only as query intents — never URLs or tool results.
	if (!llmUpdates) {
		const extracted = await completeJson({
			...llm,
			system: buildExtractionSystemPrompt(
				llm.hasImages,
				toPromptActions(animationLibraryStore.enabledForLlm),
				showImagesEnabled
			),
			user: buildExtractionUser(userMessage, dialogue),
			maxTokens: 500
		});
		if (extracted) {
			// parseResponse handles both bare JSON (OpenAI json_object) and a
			// model-added ```json fence (Anthropic). Don't re-wrap.
			const fallbackParsed = parseResponse(extracted);
			// This recovery run only happens when the inline state was missing,
			// so mood/memory cannot be applied twice.
			llmUpdates = fallbackParsed.stateUpdates;
			// Query-only picture recovery: never URLs or tool-result harvesting.
			if (!imageSearch) {
				imageSearch = fallbackParsed.imageSearch;
				imagePage = fallbackParsed.imagePage;
			}
			if (fallbackParsed.closeImages) closeImages = true;
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
	if (finalUpdates.expression) vrmStore.requestFlash(finalUpdates.expression);

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
					importance: calculateFactImportance(factContent, userAnalysis.sentiment),
					source: HEURISTIC_FACT_SOURCE
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
				const eventState = { ...characterStore.state, lastInteraction: previousInteraction };
				const candidates = allEvents.filter((e) => !dismissedEventIds.has(e.id));
				const triggeredEvents = checkAllEvents(candidates, eventState, completedEvents, userMessage);
				if (triggeredEvents.length > 0) {
					triggeredEvent = triggeredEvents[0];
				}
			}
		} catch (e) {
			console.debug('Event check failed:', e);
		}
	}

	return {
		dialogue,
		newMemory: finalUpdates.newMemory || undefined,
		imageSearch: imageSearch || undefined,
		imagePage: imagePage || undefined,
		closeImages: closeImages || undefined,
		triggeredEvent
	};
}
