// Writes an event scene with the active chat model. Uses the same transport as
// chat (direct on desktop and for local providers, the server route otherwise)
// and falls back to the static scene on anything unexpected: null means "play
// the built-in scene".
import { characterStore } from '$lib/stores/character.svelte';
import { personaStore } from '$lib/stores/persona.svelte';
import { displayStore } from '$lib/stores/display.svelte';
import { resolveActiveLLM } from '$lib/services/llm/active-llm';
import { completeJson } from '$lib/services/llm/transport';
import { getRecentTurns, memoryApi } from '$lib/engine/memory';
import { buildMomentPrompt, parseMoment, selectMomentMemories } from '$lib/engine/moments';
import type { EventDefinition, Scene } from '$lib/types/events';

const MAX_TOKENS = 900;

function activeLLM() {
	const llm = resolveActiveLLM();
	return llm?.model ? llm : null;
}

/** Whether generateMoment would actually call the model for this event. */
export function canGenerateMoment(event: EventDefinition): boolean {
	return displayStore.generatedMoments && !!event.scene && activeLLM() !== null;
}

// A dismissed event comes back on the next turn; keep what she already wrote
// so reopening costs nothing. Session only, and a null (fallback) is not kept
// so a transient failure gets another try.
const written = new Map<string, Scene>();

export async function generateMoment(
	event: EventDefinition,
	opts: { timeoutMs?: number } = {}
): Promise<Scene | null> {
	const llm = activeLLM();
	const template = event.scene;
	if (!displayStore.generatedMoments || !template || !llm) return null;
	const cached = written.get(event.id);
	if (cached) return cached;

	try {
		const state = characterStore.state;
		const facts = await memoryApi.getFacts(40);
		const { system, user } = buildMomentPrompt(template, {
			companionName: personaStore.activeCard.name,
			personality: personaStore.activeCard.systemPrompt,
			mode: state.appMode,
			stage: state.relationshipStage,
			mood: state.mood,
			daysKnown: state.daysKnown,
			totalInteractions: state.totalInteractions,
			memories: selectMomentMemories(facts),
			recentUserLines: getRecentTurns()
				.filter((t) => t.role === 'user' && t.content.trim())
				.slice(-4)
				.map((t) => t.content.trim().slice(0, 300)),
			eventName: event.name,
			eventType: event.type
		});

		const raw = await completeJson({
			...llm,
			system,
			user,
			maxTokens: MAX_TOKENS,
			signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000)
		});

		const scene = raw ? parseMoment(raw, template) : null;
		if (scene) written.set(event.id, scene);
		if (!scene) console.debug('[moments] no usable moment, playing the built-in scene');
		return scene;
	} catch (e) {
		console.debug('[moments] generation failed, playing the built-in scene', e);
		return null;
	}
}
