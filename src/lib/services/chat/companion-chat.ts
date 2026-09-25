// The one companion send/stream pipeline, shared by the main app and the
// desktop overlay. Both pages used to carry ~180 near-identical lines each,
// which had already drifted (the overlay forgot to filter empty messages). This
// centralizes prompt building, streaming (direct vs. server route), the
// post-turn processing, keepsakes, TTS, and the talking animation. Pages provide
// a small set of hooks to sync their own reactive state.
import { characterStore } from '$lib/stores/character.svelte';
import type { ThinkingPhase } from './chat-phase';
import { chatStore, type Message } from '$lib/stores/chat.svelte';
import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { modulesStore } from '$lib/stores/modules.svelte';
import { ttsStore } from '$lib/stores/tts.svelte';
import { personaStore } from '$lib/stores/persona.svelte';
import { vrmStore } from '$lib/stores/vrm.svelte';
import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
import { getTTSProvider } from '$lib/services/providers/registry';
import { buildTTSOptions } from '$lib/services/tts/tts-options';
import { cleanSpeechMarkers } from '$lib/services/tts/chat-text';
import { streamChat } from '$lib/services/llm/transport';
import { RETRY_DELAYS_MS } from '$lib/services/llm/retry';
import { missingLLMMessage, resolveActiveLLM } from '$lib/services/llm/active-llm';

import { processCompanionTurn } from '$lib/services/chat/companion-turn';
import { retrieveRelevantContext } from '$lib/engine/memory';
import { buildSystemPrompt, buildMcpSecurityInstructions, truncateChatHistory, type PromptContext } from '$lib/ai/prompt-builder';
import { keepImage, type PreparedImage } from '$lib/services/storage/keepsakes';
import { extractReminderTags, tryExtractReminderFromUserMessage } from '$lib/utils/reminders';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { getWorkingMemory, ensureSession } from '$lib/engine/memory-session';
import { buildAdvancedParams, buildMessages, type ChatLoopMessage } from '$lib/services/chat/turn-context';
import { TurnStream } from '$lib/services/chat/turn-stream';
import { pseudoCallFromTool } from '$lib/services/tts/speech-compiler';
import { buildSpeechTools, shouldUseSpeechTools } from '$lib/services/tts/tool-definitions';
import { env as publicEnv } from '$env/dynamic/public';
import { isMcpHardeningEnabled, parseToolNameList } from '$lib/services/mcp/protocol';
import { mcpStore } from '$lib/stores/mcp.svelte';
import { chatHintStore } from '$lib/stores/chat-hint.svelte';
import { callTool } from '$lib/services/mcp/capability';
import {
	MCP_MAX_ROUNDS,
	buildAssistantToolMessage,
	buildSendTools,
	buildToolResultMessages,
	capToolResult,
	collectToolResults,
	ensureToolPairs,
	findMcpTool,
	mcpCallsOnly,
	splitToolCalls,
	speechToolAck,
	stripFromStateFence,
	toOpenAiTool,
	type ToolResultEntry
} from '$lib/services/mcp/loop';
import type { McpCollectedToolCall, McpTool } from '$lib/types/mcp';
import type { TTSProvider } from '$lib/types';
import type { EventDefinition } from '$lib/types/events';

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
		ttsProvider: speechEnabled ? speechSettings.activeProvider : undefined,
		ttsLanguage: speechSettings.activeLanguage || undefined,
		ttsAltLanguage: speechSettings.altLanguage || undefined,
		ttsAltEnabled: speechSettings.enableAltLanguage,
		// Same gate as the ttsTools injection in sendCompanionMessage: the
		// speech layer must mandate tool calls exactly when the tools are sent.
		ttsToolCalling: shouldUseSpeechTools(llmProvider, speechEnabled, speechSettings),
		// An undescribed upload still gets its name, so the id means something
		avatarActions: animationLibraryStore.enabledForLlm.map((a) => ({
			id: a.id,
			description: a.description.trim() || a.name
		}))
	};
	return buildSystemPrompt(context);
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
	/** Give up when the model sends nothing for this long. */
	stallTimeoutMs?: number;
	/** Hard cap on the whole turn. */
	turnTimeoutMs?: number;
}

let activeTurn: AbortController | null = null;

/** Stop the reply in flight, if any. */
export function cancelActiveTurn() {
	activeTurn?.abort(new Error('Stopped'));
}

export async function sendCompanionMessage(
	content: string,
	images: PreparedImage[],
	hooks: CompanionChatHooks,
	options: SendCompanionMessageOptions = {}
): Promise<void> {
	const { systemEvent = false, stallTimeoutMs = 90_000, turnTimeoutMs = 600_000 } = options;
	if ((!content.trim() && images.length === 0) || chatStore.isLoading) return;

	if (!modulesStore.isModuleEnabled('consciousness')) {
		chatStore.setError('Chat is disabled. Enable it in Settings > LLM Model.');
		return;
	}

	const shown = images.map((img) => ({ id: img.id, url: URL.createObjectURL(img.blob) }));

	let sent: Message | undefined;
	if (!systemEvent) {
		sent = chatStore.addMessage('user', content, shown.length ? shown : undefined);
		hooks.onShownImages?.(shown);
	}

	// Client fallback: if the user phrases a reminder naturally and the LLM
	// fails to emit a [reminder:...] tag, schedule it after the turn.
	const directReminder = systemEvent ? null : tryExtractReminderFromUserMessage(content);

	chatStore.setLoading(true);
	chatStore.setError(null);

	const guard = startTurnGuard(stallTimeoutMs, turnTimeoutMs);
	const { signal, untilAborted, bumpStall } = guard;
	hooks.setTyping(true);
	vrmStore.setThinking(true);
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
		const llm = resolveActiveLLM();
		if (!llm) throw new Error(missingLLMMessage());
		const { provider } = llm;

		const contextSize = consciousnessSettings.contextSize || undefined;

		let systemPrompt = await untilAborted(buildCompanionPrompt(
			content,
			images.length > 0,
			provider,
			contextSize,
			systemEvent ? content : undefined
		));

		// Prompt building (memory retrieval) is done; the model call starts now
		hooks.setPhase?.(images.length > 0 ? 'seeing' : 'thinking');

		chatStore.addMessage('assistant', '');
		let messages: ChatLoopMessage[] = buildMessages(chatStore.messages.slice(0, -1), images);
		const currentQuestion = [...messages].reverse().find((message) => message.role === 'user');

		// Snapshot speech settings at turn start so mid-stream changes cannot
		// corrupt an ongoing TTS session, then start OmniVoice streaming before
		// the LLM call so the first sentence can be synthesised while the model
		// is still generating the rest of the reply.
		const displaySpeechSettings = modulesStore.getModuleSettings('speech');
		const displayTtsProvider = displaySpeechSettings.activeProvider as TTSProvider;
		const speechState = modulesStore.getModuleState('speech');

		const ttsConfig = settingsStore.getProviderConfig(displayTtsProvider);
		const ttsMeta = getTTSProvider(displayTtsProvider);
		const ttsOptions = buildTTSOptions(displaySpeechSettings, displayTtsProvider, ttsConfig, ttsMeta);

		streamingTTS =
			speechState?.enabled && displayTtsProvider === 'omnivoice'
				? await ttsStore.beginStreaming(ttsOptions)
				: false;
		const stream = new TurnStream(displayTtsProvider === 'omnivoice', {
			show: (text) => chatStore.updateLastMessage(text),
			speak: streamingTTS ? (chunk) => ttsStore.feedStreaming(chunk) : undefined
		});

		const onRetry = (attempt: number, delayMs: number) => {
			bumpStall();
			const wait = delayMs >= 1000 ? ` in ${Math.round(delayMs / 1000)}s` : '';
			chatHintStore.showHint(`The model is busy, retrying${wait} (${attempt}/${RETRY_DELAYS_MS.length})`);
		};

		const onDelta = (roundFull: string) => {
			if (signal.aborted) return;
			bumpStall();
			if (roundFull) vrmStore.setThinking(false);
			stream.delta(roundFull);
		};

		const { mcpTools, mcpToolNames, confirmToolNames, security } = await prepareMcpTurn(provider);
		const useMcpLoop = mcpTools.length > 0;
		// Added before truncation so the layer counts against the context budget.
		if (security) systemPrompt += '\n\n' + security;

		// Tool schemas are sent with every round; count them against the context
		// budget so large MCP schemas cannot silently overflow the window.
		const toolSchemaContext =
			mcpTools.length > 0 ? JSON.stringify(mcpTools.map(toOpenAiTool)) : undefined;

		const advancedParams = buildAdvancedParams(llm.custom, consciousnessSettings);

		const sendTools = buildSendTools(
			buildSpeechTools(provider, speechState?.enabled === true, displaySpeechSettings),
			mcpTools
		);

		const maxRounds = useMcpLoop ? MCP_MAX_ROUNDS : 1;

		for (let round = 0; round < maxRounds; round++) {
			stream.startRound();
			const roundCalls: McpCollectedToolCall[] = [];

			// Re-budget before every round: tool results from earlier rounds grow
			// the history. Truncation runs per round (not once before the loop)
			// and repairs assistant/tool pairs the cut may have separated.
			if (contextSize && contextSize > 0 && messages.length > 0) {
				messages = ensureToolPairs(
					messages,
					truncateChatHistory(messages, systemPrompt, contextSize, toolSchemaContext, currentQuestion)
				);
			}

			const onToolCall = (name: string, args: Record<string, unknown>, id?: string) => {
				if (signal.aborted) return;
				bumpStall();
				roundCalls.push({ id: id ?? `call_${round}_${roundCalls.length}`, name, args });
				// An MCP tool that happens to be named like a speech tool must not
				// be treated as one.
				const pseudo = mcpToolNames.has(name) ? null : pseudoCallFromTool(name, args);
				if (pseudo) stream.toolCall(pseudo);
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

			bumpStall();
			const roundText = await untilAborted(
				streamChat(
					{ ...llm, messages, systemPrompt, tools: sendTools, signal, onRetry, ...advancedParams },
					onDelta,
					onToolCall
				)
			);
			guard.pauseStall();

			// Final round: no MCP calls left, or the round budget is spent.
			const final = mcpCallsOnly(roundCalls, mcpTools).length === 0 || round === maxRounds - 1;
			stream.endRound(roundText, final);
			if (final) break;

			// Feed the results back and let the model continue. Every call gets
			// a result — the OpenAI protocol requires it — including speech
			// tools, which get a small ack instead of an execution.
			messages.push(buildAssistantToolMessage(stripFromStateFence(roundText), roundCalls));
			// Bound the work one round may trigger: excess calls are answered
			// with an error instead of spawning dozens of processes/requests.
			const { run, skipped } = splitToolCalls(roundCalls);
			// allSettled: one unexpected failure must not abort the whole turn —
			// the model gets an error result and can still answer.
			const settled = await untilAborted(Promise.allSettled(
				run.map((call) => runToolCall(call, mcpTools, mcpToolNames, confirmToolNames))
			));
			messages.push(...buildToolResultMessages(collectToolResults(settled, run, skipped)));
		}

		// Native dialogue is kept in the saved response here, not replayed
		// through onDelta, which would synthesize the native calls a second time.
		const fullContent = stream.content;

		hooks.setTyping(false);
		vrmStore.setThinking(false);

		if (streamingTTS) {
			// Intentionally fire-and-forget: endStreaming flushes the buffer and
			// waits for the orchestrator to finish, but memory/event/image
			// processing (processCompanionTurn) must not be blocked.
			void ttsStore.endStreaming();
		}

		// For OmniVoice the raw response contains speak({...}) / gesture({...})
		// pseudo-tool-calls. Strip them and non-verbal markers before
		// memory/fact extraction, but keep the ```json state fence: parseResponse() extracts the state updates from
		// it and cuts the dialogue there — models sometimes repeat their
		// whole reply after the block, and without the fence that repeat
		// would survive in the dialogue and duplicate the chat message.
		const cleanedCompanionResponse =
			displayTtsProvider === 'omnivoice'
				? cleanSpeechMarkers(fullContent, { keepStateFences: true })
				: fullContent;

		const turn = await untilAborted(processCompanionTurn({
			userMessage: content,
			companionResponse: cleanedCompanionResponse,
			llm: { ...llm, hasImages: images.length > 0 },
			systemEvent,
			debug: import.meta.env.DEV
		}));

		if (directReminder) await scheduleReminderFallback(directReminder, fullContent);

		hooks.onNewMemory?.(turn.newMemory);
		if (turn.triggeredEvent) hooks.setActiveEvent(turn.triggeredEvent);

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

		await keepShownImages(images, turn.newMemory);
	} catch (err) {
		if (streamingTTS) ttsStore.cancelStreaming();
		if (signal.aborted) {
			chatHintStore.showHint(signal.reason instanceof Error ? signal.reason.message : 'Stopped');
		} else {
			chatStore.setError(err instanceof Error ? err.message : 'Unknown error');
			if (sent) bounceBack(sent, images);
		}
		hooks.setTyping(false);
		vrmStore.setThinking(false);
	} finally {
		guard.dispose();
		chatStore.setLoading(false);
	}
}

// Stop, stall and the hard cap all abort the same controller. Awaits that
// may hang are raced against it, so the turn always settles promptly.
function startTurnGuard(stallTimeoutMs: number, turnTimeoutMs: number) {
	const controller = new AbortController();
	activeTurn = controller;
	const { signal } = controller;
	const timeOut = () => controller.abort(new Error('Reply timed out'));
	const aborted = new Promise<never>((_, reject) =>
		signal.addEventListener('abort', () => reject(signal.reason), { once: true })
	);
	aborted.catch(() => {});
	const turnTimer = setTimeout(timeOut, turnTimeoutMs);
	let stallTimer: ReturnType<typeof setTimeout> | undefined;
	return {
		signal,
		untilAborted: <T>(work: Promise<T>) => Promise.race([work, aborted]),
		// ponytail: counts visible text and tool calls only, so a reasoning model that
		// thinks silently past the stall limit gets cut off; bump on raw bytes if that bites.
		bumpStall: () => {
			clearTimeout(stallTimer);
			stallTimer = setTimeout(timeOut, stallTimeoutMs);
		},
		pauseStall: () => clearTimeout(stallTimer),
		dispose: () => {
			clearTimeout(turnTimer);
			clearTimeout(stallTimer);
			if (activeTurn === controller) activeTurn = null;
		}
	};
}

// MCP tools for this turn (client-side loop). Without configured servers
// the whole path is skipped: no probe, no request fields, so users who
// never touch MCP see the exact same chat behavior as before.
// Anthropic requests carry no tool definitions at all, so MCP stays out
// of that path.
async function prepareMcpTurn(provider: string) {
	const mcpConfigured = mcpStore.servers.some((s) => s.enabled);
	if (mcpConfigured) {
		try {
			await mcpStore.ensureTools();
		} catch {
			// Tool discovery must never break the chat turn; MCP stays off.
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
	// Hardening is on unless opted out: tool results are untrusted data and
	// state-changing actions need an explicit user request.
	const confirmToolNames = new Set(parseToolNameList(publicEnv.PUBLIC_MCP_CONFIRM_TOOLS));
	const security =
		mcpTools.length > 0
			? buildMcpSecurityInstructions({
					mcpActive: true,
					hardeningEnabled: isMcpHardeningEnabled(publicEnv.PUBLIC_MCP_PROMPT_HARDENING),
					confirmTools: [...confirmToolNames]
				})
			: '';
	return { mcpTools, mcpToolNames: new Set(mcpTools.map((tool) => tool.name)), confirmToolNames, security };
}

async function runToolCall(
	call: McpCollectedToolCall,
	mcpTools: McpTool[],
	mcpToolNames: Set<string>,
	confirmToolNames: Set<string>
): Promise<ToolResultEntry> {
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
	if (
		server.askBeforeRun !== false &&
		!(await mcpStore.confirmToolCall({ serverName: server.name, toolName: call.name, args: call.args }))
	) {
		return {
			call,
			content: `The user declined to run tool "${call.name}"; it was NOT executed. Do not retry it unless the user asks.`
		};
	}
	const result = await callTool(server, call.name, call.args);
	const content = result.isError ? `Error: ${result.content}` : result.content;
	return { call, content: capToolResult(content), injectAsUser: server.injectResultsAsUser };
}

// Schedule the direct fallback only when the LLM did not emit any reminder
// tag itself. This prevents duplicate reminders when the model correctly
// schedules one via [reminder:...].
async function scheduleReminderFallback(
	directReminder: NonNullable<ReturnType<typeof tryExtractReminderFromUserMessage>>,
	fullContent: string
) {
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

// A turn that failed before she said anything goes back into the composer, so
// the user can just resend and the history doesn't end up with the question twice.
function bounceBack(sent: Message, images: PreparedImage[]) {
	const [before, last] = chatStore.messages.slice(-2);
	const unanswered =
		last?.id === sent.id || (before?.id === sent.id && last.role === 'assistant' && !last.content);
	if (!unanswered || chatDraftStore.draft.trim() || chatDraftStore.pending.length) return;
	chatStore.removeMessage(sent.id);
	chatDraftStore.draft = sent.content;
	for (const image of images) chatDraftStore.addPending(image, URL.createObjectURL(image.blob));
}

// She's seen the images and responded; keep them as local keepsakes.
// A failed save (quota, decode) must not fail a turn that already landed.
async function keepShownImages(images: PreparedImage[], note: string | undefined) {
	if (images.length === 0) return;
	try {
		await Promise.all(
			images.map((img) => keepImage(img.id, img.blob, { mimeType: img.mimeType, note }))
		);
	} catch (e) {
		console.debug('[Keepsake] save failed:', e);
		chatHintStore.showHint("Couldn't save that photo to the board.");
	}
}
