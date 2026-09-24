// Writes an event scene with the active chat model. Uses the same transport as
// chat (direct on desktop and for local providers, the server route otherwise)
// and falls back to the static scene on anything unexpected: null means "play
// the built-in scene".
import { characterStore } from '$lib/stores/character.svelte';
import { personaStore } from '$lib/stores/persona.svelte';
import { displayStore } from '$lib/stores/display.svelte';
import { modulesStore } from '$lib/stores/modules.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { getLLMProvider } from '$lib/services/providers/registry';
import { isTauri } from '$lib/services/platform';
import { requestJsonCompletion } from '$lib/services/chat/client-chat';
import { streamServerRoute } from '$lib/services/chat/companion-chat';
import { getRecentTurns, memoryApi } from '$lib/engine/memory';
import { buildMomentPrompt, parseMoment, selectMomentMemories } from '$lib/engine/moments';
import type { EventDefinition, Scene } from '$lib/types/events';
import type { LLMProvider } from '$lib/types';

const MAX_TOKENS = 900;

function activeLLM() {
	if (!modulesStore.isModuleEnabled('consciousness')) return null;
	const settings = modulesStore.getModuleSettings('consciousness');
	const provider = settings.activeProvider as string | undefined;
	if (!provider) return null;
	const meta = getLLMProvider(provider);
	const config = settingsStore.getProviderConfig(provider);
	const model = (settings.activeModel as string | undefined) || meta?.models?.[0]?.id;
	if (!model || (meta?.requiresApiKey && !config.apiKey)) return null;
	return { provider, meta, model, apiKey: config.apiKey, baseURL: config.baseUrl || meta?.defaultBaseUrl };
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

		const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
		const raw =
			isTauri() || llm.meta?.isLocal
				? await requestJsonCompletion({
						provider: llm.provider as LLMProvider,
						model: llm.model,
						apiKey: llm.apiKey || undefined,
						baseURL: llm.baseURL,
						system,
						user,
						maxTokens: MAX_TOKENS,
						signal
					})
				: await streamServerRoute(
						{
							messages: [{ role: 'user', content: user }],
							provider: llm.provider,
							model: llm.model,
							apiKey: llm.apiKey || (llm.meta?.custom ? undefined : 'not-needed'),
							baseURL: llm.baseURL,
							systemPrompt: system,
							maxTokens: MAX_TOKENS
						},
						() => {},
						undefined,
						signal
					);

		const scene = raw ? parseMoment(raw, template) : null;
		if (scene) written.set(event.id, scene);
		if (!scene) console.debug('[moments] no usable moment, playing the built-in scene');
		return scene;
	} catch (e) {
		console.debug('[moments] generation failed, playing the built-in scene', e);
		return null;
	}
}
