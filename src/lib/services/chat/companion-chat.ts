// The one companion send/stream pipeline, shared by the main app and the
// desktop overlay. Both pages used to carry ~180 near-identical lines each,
// which had already drifted (the overlay forgot to filter empty messages). This
// centralizes prompt building, streaming (direct vs. server route), the
// post-turn processing, keepsakes, TTS, and the talking animation. Pages provide
// a small set of hooks to sync their own reactive state.
import { characterStore } from '$lib/stores/character.svelte';
import type { ThinkingPhase } from './chat-phase';
import { chatStore } from '$lib/stores/chat.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { modulesStore } from '$lib/stores/modules.svelte';
import { ttsStore } from '$lib/stores/tts.svelte';
import { personaStore } from '$lib/stores/persona.svelte';
import { vrmStore } from '$lib/stores/vrm.svelte';
import { STATE_FENCE_OPEN } from '$lib/ai/response-parser';
import { getLLMProvider, getTTSProvider } from '$lib/services/providers/registry';
import { type TTSOptions } from '$lib/services/tts';
import {
	cleanSpeechMarkers,
	cutAtStateFence,
	hasIncompleteTrailingMarkup,
	stripThinkingBlocks,
	StreamingDisplayCleaner
} from '$lib/services/tts/chat-text';
import { streamChatDirect } from '$lib/services/chat/client-chat';

import { processCompanionTurn } from '$lib/services/chat/companion-turn';
import { retrieveRelevantContext } from '$lib/engine/memory';
import { buildSystemPrompt, buildMcpSecurityInstructions, truncateChatHistory, type PromptContext } from '$lib/ai/prompt-builder';
import { keepImage, type PreparedImage } from '$lib/services/storage/keepsakes';
import { extractReminderTags, tryExtractReminderFromUserMessage } from '$lib/utils/reminders';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { getWorkingMemory, ensureSession } from '$lib/engine/memory';
import { toOpenAIContent, type ContentPart } from '$lib/services/chat/content';
import { pseudoCallFromTool } from '$lib/services/tts/speech-compiler';
import { shouldUseSpeechTools } from '$lib/services/tts/tool-definitions';
import { isTauri } from '$lib/services/platform';
import { env as publicEnv } from '$env/dynamic/public';
import { parseToolNameList } from '$lib/services/mcp/protocol';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { callTool } from '$lib/services/mcp/capability';
import {
	MCP_MAX_ROUNDS,
	MAX_TOOL_CALLS_PER_ROUND,
	buildAssistantToolMessage,
	buildToolResultMessages,
	capToolResult,
	ensureToolPairs,
	findMcpTool,
	mcpCallsOnly,
	splitToolCalls,
	speechToolAck,
	stripFromStateFence,
	toOpenAiTool,
	type OpenAiToolCall
} from '$lib/services/mcp/loop';
import type { McpCollectedToolCall } from '$lib/types/mcp';
import type { LLMProvider, TTSProvider } from '$lib/types';
import type { EventDefinition } from '$lib/types/events';

/** Message shape used by the chat loop; extends the plain history with the
 *  tool-role entries the MCP loop appends between rounds. */
interface ChatLoopMessage {
	role: 'user' | 'assistant' | 'tool';
	content: string | ContentPart[];
	tool_calls?: OpenAiToolCall[];
	tool_call_id?: string;
}

export interface CompanionChatHooks {
	/** Toggle the typing indicator. */
	setTyping: (typing: boolean) => void;
	/** The latest cleaned reply, for the speech bubble. */
	setLatestResponse: (response: string) => void;
	/** A visual-novel event the reply triggered. */
	setActiveEvent: (event: EventDefinition) => void;
	/** Blob-URL previews of images shown this turn (main app scrapbook). */
	onShownImages?: (shown: { id: string; url: string }[]) => void;
	/** The new memory the model recorded, if any. */
	onNewMemory?: (memory: string | undefined) => void;
	/** Runs just before streaming starts (e.g. the overlay collapses its chat). */
	beforeStream?: () => void;
	/** What she is doing right now (remembering, seeing, thinking). */
	setPhase?: (phase: ThinkingPhase) => void;
}

async function buildCompanionPrompt(
	userMessage: string,
	hasImages: boolean,
	llmProvider: string,
	contextSize?: number,
	systemEvent?: string
): Promise<string> {
	const workingMemory = getWorkingMemory();
	const speechSettings = modulesStore.getModuleSettings('speech');
	// Speech switched off means no speak() instructions, whatever provider is picked
	const speechEnabled = modulesStore.getModuleState('speech')?.enabled === true;
	const context: PromptContext = {
		persona: personaStore.activeCard,
		state: characterStore.state,
		memories: await retrieveRelevantContext(userMessage, contextSize),
		userMessage,
		systemTime: new Date(),
		hasImages,
		contextSize,
		pendingReminders: reminderStore.upcoming.map((r) => ({ triggerAt: r.triggerAt, content: r.content })),
		sessionStartedAt: workingMemory.sessionStartedAt,
		systemEvent,
		ttsProvider: speechEnabled ? (speechSettings.activeProvider as string | undefined) : undefined,
		ttsLanguage: (speechSettings.activeLanguage as string) || undefined,
		ttsAltLanguage: (speechSettings.altLanguage as string) || undefined,
		ttsAltEnabled: (speechSettings.enableAltLanguage as boolean) ?? false,
		// Same gate as the ttsTools injection in sendCompanionMessage: the
		// speech layer must mandate tool calls exactly when the tools are sent.
		ttsToolCalling: shouldUseSpeechTools(llmProvider, speechEnabled, speechSettings)
	};
	return buildSystemPrompt(context);
}

// Assemble the message history for the provider. The current turn carries the
// image bytes; prior turns stay text. Empty messages are dropped (the assistant
// placeholder, and any stray blank turn) so we never send an empty message.
function buildMessages(images: PreparedImage[]) {
	const history = chatStore.messages.slice(0, -1).filter((m) => m.content || m.images?.length);
	return history.map((m, idx) => {
		const isCurrentTurn = idx === history.length - 1 && images.length > 0;
		if (!isCurrentTurn) {
			return { role: m.role as 'user' | 'assistant', content: m.content };
		}
		const parts: ContentPart[] = [];
		if (m.content) parts.push({ type: 'text', text: m.content });
		for (const img of images) {
			parts.push({ type: 'image', mimeType: img.mimeType, data: img.base64 });
		}
		return { role: m.role as 'user' | 'assistant', content: parts };
	});
}

// Buffer partial lines from the server's text, tool-call and error events.
// Always release the reader lock, including when an error event arrives.
async function streamServerRoute(
	body: unknown,
	onDelta: (fullContent: string) => void,
	onToolCall?: (name: string, args: Record<string, unknown>, id?: string) => void
): Promise<string> {
	const response = await fetch('/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const errBody = await response.json().catch(() => null);
		throw new Error(errBody?.error || 'Failed to get response');
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No response body');

	const decoder = new TextDecoder();
	let fullContent = '';
	const processLine = (line: string) => {
		if (line.startsWith('0:')) {
			fullContent += JSON.parse(line.slice(2));
			onDelta(fullContent);
		} else if (line.startsWith('t:')) {
			const { id, name, args } = JSON.parse(line.slice(2)) as {
				id?: string;
				name: string;
				args: Record<string, unknown>;
			};
			onToolCall?.(name, args, id);
		} else if (line.startsWith('e:')) {
			throw new Error(JSON.parse(line.slice(2)).error);
		}
	};

	try {
		let buffer = '';
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';
			for (const line of lines) processLine(line);
		}
		buffer += decoder.decode();
		if (buffer) processLine(buffer);
	} finally {
		reader.releaseLock();
	}

	return fullContent;
}

/**
 * Send a user message and run the full companion turn. Handles both transports
 * (direct provider call on desktop/local, server route on web/cloud), post-turn
 * state, keepsakes, TTS, and the talking animation. Errors surface via
 * chatStore.setError; the returned promise always resolves.
 */
export interface SendCompanionMessageOptions {
	/** When true, the message is delivered as a system event instead of a user turn. */
	systemEvent?: boolean;
}

export async function sendCompanionMessage(
	content: string,
	images: PreparedImage[],
	hooks: CompanionChatHooks,
	options: SendCompanionMessageOptions = {}
): Promise<void> {
	const { systemEvent = false } = options;
	if ((!content.trim() && images.length === 0) || chatStore.isLoading) return;

	if (!modulesStore.isModuleEnabled('consciousness')) {
		chatStore.setError('Chat is disabled. Enable it in Settings > Character > AI Services.');
		return;
	}

	const shown = images.map((img) => ({ id: img.id, url: URL.createObjectURL(img.blob) }));

	if (!systemEvent) {
		chatStore.addMessage('user', content, shown.length ? shown : undefined);
		hooks.onShownImages?.(shown);
	}

	// Client fallback: if the user phrases a reminder naturally and the LLM
	// fails to emit a [reminder:...] tag, schedule it after the turn.
	const directReminder = systemEvent ? null : tryExtractReminderFromUserMessage(content);

	chatStore.setLoading(true);
	chatStore.setError(null);
	hooks.setTyping(true);
	hooks.setLatestResponse('');
	hooks.setPhase?.('remembering');
	hooks.beforeStream?.();

	// Tracks whether an OmniVoice streaming TTS session was started for this
	// turn. Declared here so the error path can cancel it.
	let streamingTTS = false;

	// Only touch relationship-time state once the character has loaded, or an
	// early message would mutate the default state that load then discards.
	// System events (e.g. fired reminders) must not count as interaction.
	if (!systemEvent && characterStore.isReady) {
		characterStore.updateStreak();
		characterStore.updateDaysKnown();
	}

	try {
		const consciousnessSettings = modulesStore.getModuleSettings('consciousness');
		const provider = consciousnessSettings.activeProvider as string;
		const model = consciousnessSettings.activeModel as string;
		if (!provider) {
			throw new Error('Please configure a provider in Settings > Modules > Consciousness');
		}

		const contextSize = (consciousnessSettings.contextSize as number | undefined) || undefined;
		const providerConfig = settingsStore.getProviderConfig(provider);
		const apiKey = providerConfig.apiKey;
		const providerMeta = getLLMProvider(provider);
		if (providerMeta?.requiresApiKey && !apiKey) {
			throw new Error(`Please configure API key for ${providerMeta.name} in Settings > Providers`);
		}

		let systemPrompt = await buildCompanionPrompt(
			content,
			images.length > 0,
			provider,
			contextSize,
			systemEvent ? content : undefined
		);

		// Prompt building (memory retrieval) is done; the model call starts now
		hooks.setPhase?.(images.length > 0 ? 'seeing' : 'thinking');

		chatStore.addMessage('assistant', '');
		const selectedModel = model || providerMeta?.models?.[0]?.id || '';
		const baseURL = providerConfig.baseUrl || providerMeta?.defaultBaseUrl;
		let messages: ChatLoopMessage[] = buildMessages(images);

		// Snapshot speech settings at turn start so mid-stream changes cannot
		// corrupt an ongoing TTS session, then start OmniVoice streaming before
		// the LLM call so the first sentence can be synthesised while the model
		// is still generating the rest of the reply.
		const displaySpeechSettings = modulesStore.getModuleSettings('speech');
		const displayTtsProvider = displaySpeechSettings.activeProvider as TTSProvider;
		const speechState = modulesStore.getModuleState('speech');

		const ttsConfig = settingsStore.getProviderConfig(displayTtsProvider);
		const ttsMeta = getTTSProvider(displayTtsProvider);
		const baseTtsOptions: TTSOptions = {
			provider: displayTtsProvider,
			apiKey: ttsConfig.apiKey,
			voiceId: (displaySpeechSettings.activeVoiceId as string) || undefined,
			model: (displaySpeechSettings.activeModel as string) || ttsConfig.modelId,
			baseUrl: ttsConfig.baseUrl || ttsMeta?.defaultBaseUrl,
			speed: (displaySpeechSettings.speed as number) ?? 1,
			// Leave unset when the user hasn't picked one; the orchestrator
			// infers the primary language from the first segment instead.
			language: (displaySpeechSettings.activeLanguage as string) || undefined,
			altLanguage: (displaySpeechSettings.altLanguage as string) || undefined,
			altVoiceId: (displaySpeechSettings.altVoiceId as string) || undefined,
			enableAltLanguage: (displaySpeechSettings.enableAltLanguage as boolean) ?? false,
			altSpeed: (displaySpeechSettings.altSpeed as number) ?? undefined
		};

		const ttsOptions: TTSOptions =
			displayTtsProvider === 'omnivoice'
				? {
						...baseTtsOptions,
						instructions: (displaySpeechSettings.instructions as string) || undefined,
						altInstructions: (displaySpeechSettings.altInstructions as string) || undefined,
						numStep: (displaySpeechSettings.numStep as number) ?? undefined,
						altNumStep: (displaySpeechSettings.altNumStep as number) ?? undefined,
						positionTemperature: (displaySpeechSettings.positionTemperature as number) ?? undefined,
classTemperature: (displaySpeechSettings.classTemperature as number) ?? undefined,
					altPositionTemperature:
						(displaySpeechSettings.altPositionTemperature as number) ?? undefined,
					altClassTemperature:
						(displaySpeechSettings.altClassTemperature as number) ?? undefined
			  }
			: baseTtsOptions;

		streamingTTS =
			speechState?.enabled && displayTtsProvider === 'omnivoice'
				? await ttsStore.beginStreaming(ttsOptions)
				: false;
		let roundTextLen = 0;
		let roundText = '';
		let assembledContent = '';
		let ttsFedUntil = 0;
		const displayCleaner = new StreamingDisplayCleaner();
		let pendingRaw = '';
		let displayCapped = false;

		const onDelta = (roundFull: string) => {
			if (displayTtsProvider !== 'omnivoice') {
				// Across MCP rounds the message shows everything produced so far.
				chatStore.updateLastMessage(assembledContent + roundFull);
				roundTextLen = roundFull.length;
				return;
			}

			const delta = roundFull.slice(roundTextLen);

			// Feed the live display only until the ```json state fence appears:
			// what follows the fence is the model's post-state repeat, and the
			// final parser cut replaces the message anyway. Without the cap the
			// repeat visibly built the message up twice.
			if (!displayCapped) {
				pendingRaw += delta;

				const cut = cutAtStateFence(pendingRaw);
				if (cut.capped) {
					// Show what precedes the fence, unless it ends mid-markup —
					// that incomplete tail would flash raw fragments.
					if (cut.visible && !hasIncompleteTrailingMarkup(cut.visible)) {
						displayCleaner.push(cut.visible);
					}
					pendingRaw = '';
					displayCapped = true;
				} else if (!hasIncompleteTrailingMarkup(pendingRaw)) {
					// No fence yet: flush only when no incomplete
					// speak/pause/gesture call, language tag or code fence is
					// dangling at the end. This keeps the incremental cleanup
					// O(1) per chunk, and the cleaner reconstructs boundary
					// whitespace the per-fragment trim would otherwise eat.
					displayCleaner.push(pendingRaw);
					pendingRaw = '';
				}
			}

			chatStore.updateLastMessage(displayCleaner.text);

			if (streamingTTS && roundFull.length > roundTextLen) {
				// Reasoning blocks (<thinking>…) and the trailing JSON state
				// block are instructions, not speech — never feed them to TTS.
				// These cuts mirror parseResponse so chat, display and speech
				// agree; they also stop repeated text after the state block
				// from being spoken twice.
				const speechSource = stripThinkingBlocks(roundFull);
				const fenceIndex = speechSource.match(STATE_FENCE_OPEN)?.index ?? -1;
				const speechEnd = fenceIndex === -1 ? speechSource.length : fenceIndex;
				if (ttsFedUntil < speechEnd) {
					ttsStore.feedStreaming(speechSource.slice(ttsFedUntil, speechEnd));
				}
				ttsFedUntil = speechEnd;
			}
			roundTextLen = roundFull.length;
		};

		// MCP tools for this turn (client-side loop). Without configured servers
		// the whole path is skipped — no probe, no request fields, so users who
		// never touch MCP see the exact same chat behavior as before.
		// Anthropic requests carry no tool definitions at all, so MCP stays out
		// of that path.
		const mcpConfigured = mcpStore.servers.some((s) => s.enabled);
		if (mcpConfigured) {
			try {
				await mcpStore.ensureTools();
			} catch {
				// Tool discovery must never break the chat turn — MCP stays off.
			}
		}
		// Snapshot only tools whose server is still enabled: a server disabled
		// while tools were cached must not stay callable in this turn.
		const enabledServerIds = new Set(
			mcpStore.servers.filter((s) => s.enabled).map((s) => s.id)
		);
		const mcpTools =
			mcpConfigured && provider !== 'anthropic' && mcpStore.hasActiveTools
				? mcpStore.tools.filter((tool) => enabledServerIds.has(tool.serverId))
				: [];
		const mcpToolNames = new Set(mcpTools.map((tool) => tool.name));
		const useMcpLoop = mcpTools.length > 0;

		// Optional env-gated hardening (default off): tool results are untrusted
		// data and state-changing actions need an explicit user request. Added
		// before truncation so the layer counts against the context budget.
		const confirmToolNames = new Set(parseToolNameList(publicEnv.PUBLIC_MCP_CONFIRM_TOOLS));
		const hardeningEnabled =
			publicEnv.PUBLIC_MCP_PROMPT_HARDENING === 'true' || publicEnv.PUBLIC_MCP_PROMPT_HARDENING === '1';
		if (mcpTools.length > 0) {
			const security = buildMcpSecurityInstructions({
				mcpActive: true,
				hardeningEnabled,
				confirmTools: [...confirmToolNames]
			});
			if (security) systemPrompt += '\n\n' + security;
		}

		// Tool schemas are sent with every round; count them against the context
		// budget so large MCP schemas cannot silently overflow the window.
		const toolSchemaContext =
			mcpTools.length > 0 ? JSON.stringify(mcpTools.map(toOpenAiTool)) : undefined;

		// Advanced parameters are only supported for OpenAI-compatible endpoints.
		const advancedParams = providerMeta?.custom
			? {
					temperature: (consciousnessSettings.temperature as number) ?? 0.7,
					topP: (consciousnessSettings.topP as number) ?? 1.0,
					maxTokens: (consciousnessSettings.maxTokens as number) || undefined,
					presencePenalty: (consciousnessSettings.presencePenalty as number) ?? 0,
					frequencyPenalty: (consciousnessSettings.frequencyPenalty as number) ?? 0
				}
			: {};

		let fullContent = '';

		// Tool definitions for OmniVoice speech segments.
		// When the LLM supports function calling, speak_segment provides
		// structured language tags instead of pseudo-calls in the text.
		// Build the language enum from the configured primary + alternative
		// languages so the tool only ever suggests what the user has set up.
		const primaryLang = (displaySpeechSettings.activeLanguage as string)?.toLowerCase() || 'en';
		const altLang = (displaySpeechSettings.altLanguage as string)?.toLowerCase();
		const toolLanguages = Array.from(new Set([primaryLang, altLang].filter(Boolean))) as string[];

		const ttsTools = shouldUseSpeechTools(provider, speechState?.enabled === true, displaySpeechSettings)
			? [
					{
						type: 'function' as const,
						function: {
							name: 'speak_segment',
							description: 'Speak exactly ONE short phrase. Call separately for each phrase. language is REQUIRED.',
							parameters: {
								type: 'object',
								properties: {
									text: { type: 'string', description: 'One short phrase to speak. Max 1 sentence.' },
									language: { type: 'string', enum: toolLanguages,
										description: 'Language of the text. REQUIRED.' }
								},
								required: ['text', 'language']
							}
						}
					},
					{
						type: 'function' as const,
						function: {
							name: 'pause_segment',
							description: 'Insert a short silent pause between spoken phrases.',
							parameters: {
								type: 'object',
								properties: {
									ms: { type: 'integer', description: 'Pause length in milliseconds (100-5000).' }
								},
								required: ['ms']
							}
						}
					},
					{
						type: 'function' as const,
						function: {
							name: 'gesture_segment',
							description: 'Show a small non-verbal gesture before or with the next phrase.',
							parameters: {
								type: 'object',
								properties: {
									type: {
										type: 'string',
										enum: ['smile', 'laugh', 'surprise', 'nod', 'shake_head', 'wave'],
										description: 'The gesture to show.'
									}
								},
								required: ['type']
							}
						}
					}
				]
			: undefined;

		// Speech tools and MCP tools share one OpenAI-shaped tool list.
		const chatTools = [...(ttsTools ?? []), ...mcpTools.map(toOpenAiTool)];
		const sendTools = chatTools.length > 0 ? chatTools : undefined;

		// Tool calls are delivered separately from text and can arrive after the
		// state fence. Speech tools become pseudo-calls; MCP calls are executed
		// after the round and fed back to the model.
		let nativeContent = '';

		const maxRounds = useMcpLoop ? MCP_MAX_ROUNDS : 1;

		for (let round = 0; round < maxRounds; round++) {
			roundText = '';
			roundTextLen = 0;
			ttsFedUntil = 0;
			pendingRaw = '';
			displayCapped = false;
			const roundCalls: McpCollectedToolCall[] = [];

			// Re-budget before every round: tool results from earlier rounds grow
			// the history. Truncation runs per round (not once before the loop)
			// and repairs assistant/tool pairs the cut may have separated.
			if (contextSize && contextSize > 0 && messages.length > 0) {
				messages = ensureToolPairs(
					messages,
					truncateChatHistory(messages, systemPrompt, contextSize, toolSchemaContext)
				);
			}

			const onToolCall = (name: string, args: Record<string, unknown>, id?: string) => {
				roundCalls.push({ id: id ?? `call_${round}_${roundCalls.length}`, name, args });
				// An MCP tool that happens to be named like a speech tool must not
				// be treated as one.
				const pseudo = mcpToolNames.has(name) ? null : pseudoCallFromTool(name, args);
				if (!pseudo) return;
				nativeContent += pseudo + '\n';
				displayCleaner.push(pseudo + '\n');
				chatStore.updateLastMessage(displayCleaner.text);
				if (streamingTTS) ttsStore.feedStreaming(pseudo);
			};

			const isFinalRound = round === maxRounds - 1;
			// The budget is spent: tell the model to answer with what it has.
			// The tools stay defined — providers reject calls for tools that are
			// not offered, so stripping them would turn a stray call into an error.
			if (isFinalRound && useMcpLoop) {
				messages.push({
					role: 'user',
					content:
						'System note: tool budget reached — answer now with the information you already have, without further tool calls.'
				});
			}

			if (isTauri() || providerMeta?.isLocal) {
				// Desktop and local providers call the provider API directly.
				await new Promise<void>((resolve, reject) => {
					streamChatDirect(
						{
							messages,
							provider: provider as LLMProvider,
							model: selectedModel,
							apiKey: apiKey || undefined,
							baseURL,
							systemPrompt,
							tools: sendTools,
							...advancedParams
						},
						(text) => {
							roundText += text;
							onDelta(roundText);
						},
						(error) => reject(new Error(error)),
						() => resolve(),
						onToolCall
					);
				});
			} else {
				// Cloud providers on web go through the SvelteKit server route.
				roundText = await streamServerRoute(
					{
						messages: messages.map((m) => ({
							role: m.role,
							content: toOpenAIContent(m.content),
							...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}),
							...(m.tool_call_id && { tool_call_id: m.tool_call_id })
						})),
						provider,
						model: selectedModel,
						apiKey: apiKey || (providerMeta?.custom ? undefined : 'not-needed'),
						baseURL,
						systemPrompt,
						tools: sendTools,
						...advancedParams
					},
					onDelta,
					onToolCall
				);
			}

			const mcpCalls = mcpCallsOnly(roundCalls, mcpTools);
			// Final round: no MCP calls left, or the round budget is spent.
			if (mcpCalls.length === 0 || round === maxRounds - 1) {
				assembledContent += roundText;
				break;
			}
			// Intermediate round: drop a premature state fence so the final
			// round's block stays the one that gets parsed.
			assembledContent += stripFromStateFence(roundText);

			// Feed the results back and let the model continue. Every call gets
			// a result — the OpenAI protocol requires it — including speech
			// tools, which get a small ack instead of an execution.
			messages.push(buildAssistantToolMessage(stripFromStateFence(roundText), roundCalls));
			// Bound the work one round may trigger: excess calls are answered
			// with an error instead of spawning dozens of processes/requests.
			const { run, skipped } = splitToolCalls(roundCalls);
			// allSettled: one unexpected failure must not abort the whole turn —
			// the model gets an error result and can still answer.
			const settled = await Promise.allSettled(
				run.map(async (call) => {
					if (!mcpToolNames.has(call.name)) {
						// Speech tools (speak/pause/gesture) are acknowledged; a
						// name that is neither speech nor MCP is hallucinated.
						return pseudoCallFromTool(call.name, call.args) !== null
							? { call, content: speechToolAck(call.args) }
							: { call, content: `Error: unknown tool "${call.name}"` };
					}
					if (confirmToolNames.has(call.name)) {
						return {
							call,
							content: `Tool "${call.name}" requires manual user confirmation and was NOT executed. Ask the user how to proceed.`
						};
					}
					const tool = findMcpTool(mcpTools, call.name);
					const server = tool
						? mcpStore.servers.find((s) => s.id === tool.serverId && s.enabled)
						: undefined;
					if (!server) {
						return {
							call,
							content: `Error: no enabled MCP server configured for tool "${call.name}"`
						};
					}
					const result = await callTool(server, call.name, call.args);
					const content = result.isError ? `Error: ${result.content}` : result.content;
					return { call, content: capToolResult(content), injectAsUser: server.injectResultsAsUser };
				})
			);
			const results = [
				...settled.map((entry, index) =>
					entry.status === 'fulfilled'
						? entry.value
						: {
								call: run[index],
								content: `Error: ${
									entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
								}`
							}
				),
				...skipped.map((call) => ({
					call,
					content: `Error: too many tool calls in one round (limit ${MAX_TOOL_CALLS_PER_ROUND}) — this call was not executed.`
				}))
			];
			messages.push(...buildToolResultMessages(results));
		}

		fullContent = assembledContent;

		// Keep native dialogue before the state fence in the saved response.
		// Only transport text goes through onDelta; replaying this assembled
		// response there would synthesize the native calls a second time.
		if (nativeContent) {
			const fenceIndex = fullContent.search(STATE_FENCE_OPEN);
			const insertAt = fenceIndex === -1 ? fullContent.length : fenceIndex;
			fullContent = fullContent.slice(0, insertAt) + '\n' + nativeContent + fullContent.slice(insertAt);
		}

		hooks.setTyping(false);

		if (streamingTTS) {
			// Intentionally fire-and-forget: endStreaming flushes the buffer and
			// waits for the orchestrator to finish, but memory/event/image
			// processing (processCompanionTurn) must not be blocked.
			void ttsStore.endStreaming();
		}

		// For OmniVoice the raw response contains speak({...}) / gesture({...})
		// pseudo-tool-calls (or a JSON state block when native tools are used).
		// Strip them before memory/fact extraction so the data layer only sees
		// clean dialogue.
		// Strip speak()/gesture syntax and non-verbal markers, but keep the
		// ```json state fence: parseResponse() extracts the state updates from
		// it and cuts the dialogue there — models sometimes repeat their
		// whole reply after the block, and without the fence that repeat
		// would survive in the dialogue and duplicate the chat message.
		const cleanedCompanionResponse =
			displayTtsProvider === 'omnivoice'
				? cleanSpeechMarkers(fullContent, { keepStateFences: true })
				: fullContent;

		const turn = await processCompanionTurn({
			userMessage: content,
			companionResponse: cleanedCompanionResponse,
			llm: {
				provider,
				model: selectedModel,
				apiKey: apiKey || undefined,
				baseURL,
				hasImages: images.length > 0
			},
			systemEvent,
			debug: import.meta.env.DEV
		});

		// Schedule a direct fallback only when the LLM did not emit any reminder
		// tag itself. This prevents duplicate reminders when the model correctly
		// schedules one via [reminder:...].
		if (directReminder) {
			const { reminders: llmReminders } = extractReminderTags(fullContent);
			if (llmReminders.length === 0) {
				// ensureSession creates a session on demand, so a reminder phrased right
				// after a reload still gets scheduled without resuming stale sessions.
				const sessionId = await ensureSession();
				if (sessionId) {
					try {
						await reminderStore.addReminder(
							directReminder.content,
							directReminder.triggerAt,
							sessionId
						);
					} catch (e) {
						console.error('[Reminder] Direct scheduling failed:', e);
					}
				}
			}
		}

		hooks.onNewMemory?.(turn.newMemory);
		if (turn.triggeredEvent) hooks.setActiveEvent(turn.triggeredEvent);

		// She's seen the images and responded; keep them as local keepsakes.
		if (images.length > 0) {
			await Promise.all(
				images.map((img) =>
					keepImage(img.id, img.blob, { mimeType: img.mimeType, note: turn.newMemory })
				)
			);
		}

		// turn.dialogue is already clean for OmniVoice because companionResponse
		// was stripped of speak()/gesture() syntax before processCompanionTurn.
		const displayDialogue = turn.dialogue;

		chatStore.updateLastMessage(displayDialogue);
		hooks.setLatestResponse(displayDialogue);

		if (turn.dialogue) {
			// During OmniVoice streaming the avatar is driven by ttsStore.isSpeaking
			// and the real audio analyser, so a text-length estimate would desync.
			// Only fall back to the estimated talking timer for non-streaming paths.
			if (!streamingTTS) {
				vrmStore.startTalking(displayDialogue);
			}

if (speechState?.enabled && !streamingTTS) {
				ttsStore.speak(turn.dialogue, ttsOptions);
			}
		}
	} catch (err) {
		if (streamingTTS) ttsStore.cancelStreaming();
		chatStore.setError(err instanceof Error ? err.message : 'Unknown error');
		hooks.setTyping(false);
	} finally {
		chatStore.setLoading(false);
	}
}
