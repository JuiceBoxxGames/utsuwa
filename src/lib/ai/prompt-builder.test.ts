import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildSystemPrompt,
	buildAvatarActionsLayer,
	buildExtractionSystemPrompt,
	buildMcpSecurityInstructions,
	truncateMessagesToContext,
	truncateChatHistory,
	estimateTokens,
	type PromptContext
} from './prompt-builder.ts';
import { shouldUseSpeechTools } from '../services/tts/tool-definitions.ts';
import { ensureToolPairs } from '../services/mcp/loop.ts';
import type { CharacterState } from '$lib/types/character';
import type { RelevantContext } from '$lib/types/memory';
import { getMemoryBudget } from '../types/memory.ts';

function makeState(overrides: Partial<CharacterState> = {}): CharacterState {
	return {
		name: 'Utsuwa',
		systemPrompt: 'Warm, playful, a little teasing.',
		extensions: {},
		mood: { primary: 'content', intensity: 60, causes: ['good morning chat'] },
		energy: 80,
		affection: 200,
		trust: 40,
		intimacy: 20,
		comfort: 30,
		respect: 10,
		appMode: 'dating_sim',
		relationshipStage: 'friend',
		personality: {},
		lastInteraction: null,
		firstMet: new Date('2026-01-01'),
		daysKnown: 5,
		totalInteractions: 20,
		currentStreak: 2,
		longestStreak: 4,
		streakLastDate: null,
		completedEvents: [],
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		...overrides
	} as CharacterState;
}

function emptyMemories(): RelevantContext {
	return { recentTurns: [], relevantFacts: [], triggeredMemories: [], recentSessions: [] };
}

function makeContext(overrides: Partial<PromptContext> = {}): PromptContext {
	return {
		persona: {
			id: 'default',
			name: 'Utsuwa',
			systemPrompt: 'Warm, playful, a little teasing.',
			extensions: {}
		},
		state: makeState(),
		memories: emptyMemories(),
		userMessage: 'hey!',
		systemTime: new Date('2026-07-03T12:00:00'),
		...overrides
	};
}

test('dating-sim prompt includes stage guidance and state', () => {
	const prompt = buildSystemPrompt(makeContext());
	assert.ok(prompt.includes('<current_state>'));
	assert.ok(prompt.includes('Stage: friend'));
	// friend-stage instruction text is present
	assert.ok(prompt.includes("You're comfortable around them"));
});

test('OmniVoice speech layer is only injected for the omnivoice provider', () => {
	const prompt = buildSystemPrompt(makeContext());
	assert.ok(!prompt.includes('<speech_output_control>'));
});

test('OmniVoice speech layer marks the speak() calls as text commands', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de' })
	);
	assert.ok(prompt.includes('speak() commands'));
	assert.ok(prompt.includes('<speech_output_control>'));
});

test('OmniVoice speech layer omits alternative-language rules when disabled', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsAltLanguage: 'es' })
	);
	// No alt-language rules when alt is not enabled
	assert.ok(!prompt.includes('get their own speak({ lang: "es" }) call'));
	// The base rules stay active
	assert.ok(prompt.includes('Group same-language words into one natural phrase per call'));
});

test('OmniVoice speech layer includes generic alternative-language rules when enabled', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsAltLanguage: 'fr', ttsAltEnabled: true })
	);
	assert.ok(prompt.includes('get their own speak({ lang: "fr" }) call'));
	assert.ok(prompt.includes('even single words'));
	assert.ok(prompt.includes('Pattern: speak({ text:'));
	assert.ok(prompt.includes('<explain in de>'));
	assert.ok(prompt.includes('<fr word or phrase>'));
});

test('OmniVoice tool-calling layer mandates tool calls instead of inline syntax', () => {
	const prompt = buildSystemPrompt(
		makeContext({
			ttsProvider: 'omnivoice',
			ttsLanguage: 'de',
			ttsAltLanguage: 'es',
			ttsAltEnabled: true,
			ttsToolCalling: true
		})
	);
	assert.ok(prompt.includes('speak_segment calls'));
	assert.ok(prompt.includes('pause_segment'));
	assert.ok(prompt.includes('gesture_segment'));
	assert.ok(prompt.includes('NEVER write speak(), pause() or gesture() commands'));
	// The inline syntax must NOT be taught alongside the tool mandate.
	assert.ok(!prompt.includes('speak({ text:'));
	// The alt rule stays language-neutral (the alt voice may be any language).
	assert.ok(prompt.includes('Prefer a short phrase, or include the article/function word'));
	assert.ok(prompt.includes('End with the JSON state block'));
});

test('OmniVoice tool-calling layer omits alt rules when alt is disabled', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsToolCalling: true })
	);
	assert.ok(!prompt.includes('get their own speak_segment call'));
	assert.ok(prompt.includes('speak_segment calls'));
});

test('OmniVoice inline layer is kept when tool calling is not active', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsToolCalling: false })
	);
	// The inline teaching stays the documented fallback.
	assert.ok(prompt.includes('speak() commands'));
	assert.ok(!prompt.includes('NEVER write speak(), pause() or gesture() commands'));
});

test('OmniVoice speech layer ignores alt rules without a configured language', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsAltEnabled: true })
	);
	assert.ok(!prompt.includes('get their own speak({ lang:'));
});

test('OmniVoice speech layer names the primary language and hard rules', () => {
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsAltLanguage: 'es', ttsAltEnabled: true })
	);
	assert.ok(prompt.includes('<speech_output_control>'));
	assert.ok(prompt.includes('Primary language: "de"'));
	assert.ok(prompt.includes('EVERYTHING in speak() calls'));
	assert.ok(prompt.includes('no plain text outside them'));
	assert.ok(prompt.includes('never a bare word alone'));
	assert.ok(prompt.includes('its own speak({ lang:') || prompt.includes('get their own speak({ lang:'));
	assert.ok(prompt.includes('No quote marks inside text'));
});

test('OmniVoice speech layer sends taught single words to the alternative voice', () => {
	// A language teacher explains single foreign words mid-sentence; those must
	// get their own alt-language call, not stay in the primary call.
	const prompt = buildSystemPrompt(
		makeContext({ ttsProvider: 'omnivoice', ttsLanguage: 'de', ttsAltLanguage: 'es', ttsAltEnabled: true })
	);
	assert.ok(prompt.includes('even single words'));
	// A concrete call pattern teaches the model the expected shape.
	assert.ok(prompt.includes('Pattern: speak({ text:'));
});

test('empty memories fall back to an explicit no-memory block', () => {
	const prompt = buildSystemPrompt(makeContext());
	assert.ok(prompt.includes('No specific memories to recall right now.'));
});

test('memories render recent turns and facts', () => {
	const memories: RelevantContext = {
		recentTurns: [
			{ id: 1, role: 'user', content: 'I adopted a cat', createdAt: new Date() },
			{ id: 2, role: 'assistant', content: 'Tell me everything!', createdAt: new Date() }
		],
		relevantFacts: [
			{ id: 1, content: 'They live in Seattle', category: 'user', importance: 80, confidence: 90, referenceCount: 0, createdAt: new Date() }
		],
		triggeredMemories: [],
		recentSessions: []
	};
	const prompt = buildSystemPrompt(makeContext({ memories }));
	assert.ok(prompt.includes('They: I adopted a cat'));
	assert.ok(prompt.includes('You: Tell me everything!'));
	assert.ok(prompt.includes('- They live in Seattle'));
});

test('an empty persona prompt falls back to the default personality line', () => {
	const ctx = makeContext();
	ctx.persona = { ...ctx.persona, systemPrompt: '' };
	const prompt = buildSystemPrompt(ctx);
	assert.ok(prompt.includes('A friendly and caring companion'));
});

test('companion mode drops relationship mechanics entirely', () => {
	const prompt = buildSystemPrompt(makeContext({ state: makeState({ appMode: 'companion' }) }));
	assert.ok(prompt.includes('helpful AI companion'));
	assert.ok(!prompt.includes('dating sim'));
	assert.ok(!prompt.includes('affection_delta'));
	assert.ok(prompt.includes('these relationship stats are disabled'));
});

test('showing an image adds the being_shown layer in both modes', () => {
	const dating = buildSystemPrompt(makeContext({ hasImages: true }));
	assert.ok(dating.includes('<being_shown>'));
	const companion = buildSystemPrompt(
		makeContext({ hasImages: true, state: makeState({ appMode: 'companion' }) })
	);
	assert.ok(companion.includes('<being_shown>'));
	const plain = buildSystemPrompt(makeContext());
	assert.ok(!plain.includes('<being_shown>'));
});

test('systemEvent renders an <event> layer in both modes', () => {
	const eventText = '⏰ REMINDER TRIGGERED: drink water';
	const dating = buildSystemPrompt(makeContext({ systemEvent: eventText }));
	assert.ok(dating.includes('<event>'));
	assert.ok(dating.includes(eventText));
	const companion = buildSystemPrompt(
		makeContext({ systemEvent: eventText, state: makeState({ appMode: 'companion' }) })
	);
	assert.ok(companion.includes('<event>'));
	assert.ok(companion.includes(eventText));
	const plain = buildSystemPrompt(makeContext());
	assert.ok(!plain.includes('<event>'));
});

test('extraction prompt only mentions images when there are images', () => {
	assert.ok(buildExtractionSystemPrompt(true).includes('showed the companion an image'));
	assert.ok(!buildExtractionSystemPrompt(false).includes('showed the companion an image'));
	assert.ok(buildExtractionSystemPrompt().includes('ONLY a JSON object'));
});

test('context size scales memory injection in dating-sim mode', () => {
	const memories: RelevantContext = {
		recentTurns: Array.from({ length: 12 }, (_, i) => ({
			id: i,
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: `turn ${i}`,
			createdAt: new Date()
		})) as Array<{ id: number; role: 'user' | 'assistant'; content: string; createdAt: Date }>,
		relevantFacts: Array.from({ length: 8 }, (_, i) => ({
			id: i,
			content: `fact ${i}`,
			category: 'user' as const,
			importance: 50,
			confidence: 0.8,
			referenceCount: 0,
			createdAt: new Date()
		})),
		triggeredMemories: [],
		recentSessions: []
	};

	const small = buildSystemPrompt(makeContext({ contextSize: 2048, memories }));
	const large = buildSystemPrompt(makeContext({ contextSize: 32768, memories }));

	// Small context keeps fewer turns/facts than large context.
	const smallTurns = (small.match(/turn \d+/g) || []).length;
	const largeTurns = (large.match(/turn \d+/g) || []).length;
	assert.ok(smallTurns < largeTurns, `expected small context to keep fewer turns (${smallTurns} vs ${largeTurns})`);

	const smallFacts = (small.match(/fact \d+/g) || []).length;
	const largeFacts = (large.match(/fact \d+/g) || []).length;
	assert.ok(smallFacts < largeFacts, `expected small context to keep fewer facts (${smallFacts} vs ${largeFacts})`);
});

test('context size scales memory injection in companion mode', () => {
	const memories: RelevantContext = {
		recentTurns: Array.from({ length: 12 }, (_, i) => ({
			id: i,
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: `turn ${i}`,
			createdAt: new Date()
		})) as Array<{ id: number; role: 'user' | 'assistant'; content: string; createdAt: Date }>,
		relevantFacts: Array.from({ length: 8 }, (_, i) => ({
			id: i,
			content: `fact ${i}`,
			category: 'user' as const,
			importance: 50,
			confidence: 0.8,
			referenceCount: 0,
			createdAt: new Date()
		})),
		triggeredMemories: [],
		recentSessions: []
	};

	const small = buildSystemPrompt(
		makeContext({ state: makeState({ appMode: 'companion' }), contextSize: 2048, memories })
	);
	const large = buildSystemPrompt(
		makeContext({ state: makeState({ appMode: 'companion' }), contextSize: 32768, memories })
	);

	const smallTurns = (small.match(/turn \d+/g) || []).length;
	const largeTurns = (large.match(/turn \d+/g) || []).length;
	assert.ok(smallTurns < largeTurns, `expected small context to keep fewer turns (${smallTurns} vs ${largeTurns})`);

	const smallFacts = (small.match(/fact \d+/g) || []).length;
	const largeFacts = (large.match(/fact \d+/g) || []).length;
	assert.ok(smallFacts < largeFacts, `expected small context to keep fewer facts (${smallFacts} vs ${largeFacts})`);
});

test('truncateMessagesToContext keeps all messages when within budget', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(400) }, // ~100 tokens
		{ role: 'user', content: 'hello' },
		{ role: 'assistant', content: 'hi there' },
		{ role: 'user', content: 'how are you?' }
	];
	truncateMessagesToContext(messages, 2048);
	assert.equal(messages.length, 4);
});

test('truncateMessagesToContext removes oldest history to fit budget', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(400) }, // ~100 tokens
		{ role: 'user', content: 'a'.repeat(400) }, // ~100 tokens
		{ role: 'assistant', content: 'b'.repeat(400) }, // ~100 tokens
		{ role: 'user', content: 'newest message' }
	];
	// 100 system + 500 reserve = 600 used; 700 - 600 = 100 history budget.
	// The two oldest history messages exceed that, so at least one is dropped.
	truncateMessagesToContext(messages, 700);
	// System + newest user must remain.
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[messages.length - 1].content, 'newest message');
	// At least one older message was dropped.
	assert.ok(messages.length < 4);
});

test('truncateMessagesToContext always keeps newest user message even with oversized system prompt', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(10000) }, // ~2500 tokens, exceeds context window
		{ role: 'user', content: 'please help me' }
	];
	truncateMessagesToContext(messages, 2048);
	assert.equal(messages.length, 2);
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[1].content, 'please help me');
});

test('truncateMessagesToContext handles empty history gracefully', () => {
	const messages = [{ role: 'system', content: 'you are helpful' }];
	truncateMessagesToContext(messages, 2048);
	assert.equal(messages.length, 1);
	assert.equal(messages[0].role, 'system');
});

test('truncateMessagesToContext is a no-op with no messages', () => {
	const messages: Array<{ role: string; content: string }> = [];
	truncateMessagesToContext(messages, 2048);
	assert.equal(messages.length, 0);
});

test('getMemoryBudget boundary values', () => {
	assert.deepEqual(getMemoryBudget(4095), { workingMemoryTurns: 6, relevantFacts: 3 });
	assert.deepEqual(getMemoryBudget(4096), { workingMemoryTurns: 6, relevantFacts: 3 });
	assert.deepEqual(getMemoryBudget(4097), { workingMemoryTurns: 10, relevantFacts: 5 });
	assert.deepEqual(getMemoryBudget(8192), { workingMemoryTurns: 10, relevantFacts: 5 });
	assert.deepEqual(getMemoryBudget(8193), { workingMemoryTurns: 20, relevantFacts: 10 });
});

test('estimateTokens handles empty, latin and cjk text', () => {
	assert.equal(estimateTokens(''), 0);
	assert.equal(estimateTokens('hello'), 2); // 5 chars / 4 = 1.25 -> 2
	assert.equal(estimateTokens('a'.repeat(100)), 25);
	// CJK characters are estimated conservatively (1 token per char) so the
	// budget is not exhausted too quickly for non-Latin scripts.
	assert.ok(estimateTokens('日本語のテキスト') > estimateTokens('latin text'));
});

test('memory budget defaults are used when contextSize is unset', () => {
	const memories: RelevantContext = {
		recentTurns: Array.from({ length: 12 }, (_, i) => ({
			id: i,
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: `turn ${i}`,
			createdAt: new Date()
		})) as Array<{ id: number; role: 'user' | 'assistant'; content: string; createdAt: Date }>,
		relevantFacts: Array.from({ length: 8 }, (_, i) => ({
			id: i,
			content: `fact ${i}`,
			category: 'user' as const,
			importance: 50,
			confidence: 0.8,
			referenceCount: 0,
			createdAt: new Date()
		})),
		triggeredMemories: [],
		recentSessions: []
	};

	const prompt = buildSystemPrompt(makeContext({ memories }));
	const turns = (prompt.match(/turn \d+/g) || []).length;
	const facts = (prompt.match(/fact \d+/g) || []).length;
	assert.equal(turns, 6, 'default keeps 6 recent turns');
	assert.equal(facts, 5, 'default keeps 5 facts');
});

test('truncateMessagesToContext drops an oversized older message instead of keeping it', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(4000) }, // ~1000 tokens
		{ role: 'user', content: 'old small question' },
		{ role: 'user', content: 'p'.repeat(80000) }, // ~20000 tokens, a big paste
		{ role: 'assistant', content: 'short answer' },
		{ role: 'user', content: 'newest message' }
	];
	truncateMessagesToContext(messages, 4096);
	// The paste blows the budget, so it goes, along with everything older.
	assert.equal(messages.length, 3);
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[1].content, 'short answer');
	assert.equal(messages[2].content, 'newest message');
});

test('truncateMessagesToContext keeps a newest message that alone exceeds the budget', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(4000) },
		{ role: 'user', content: 'older' },
		{ role: 'user', content: 'n'.repeat(80000) }
	];
	truncateMessagesToContext(messages, 4096);
	assert.equal(messages.length, 2);
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[1].content.length, 80000);
});

test('truncateMessagesToContext keeps newest user message when system prompt nearly fills window', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(6000) }, // ~1500 tokens
		{ role: 'user', content: 'older question' },
		{ role: 'assistant', content: 'y'.repeat(100) },
		{ role: 'user', content: 'newest question' }
	];
	truncateMessagesToContext(messages, 2048);
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[messages.length - 1].content, 'newest question');
});

test('truncateMessagesToContext ignores extra system messages and treats first non-system as history start', () => {
	const messages = [
		{ role: 'system', content: 'x'.repeat(400) },
		{ role: 'system', content: 'extra system instruction' },
		{ role: 'user', content: 'a'.repeat(400) },
		{ role: 'assistant', content: 'b'.repeat(400) },
		{ role: 'user', content: 'newest message' }
	];
	// System tokens counted from first message only; reserve leaves room for newest user.
	truncateMessagesToContext(messages, 700);
	assert.equal(messages[0].role, 'system');
	assert.equal(messages[messages.length - 1].content, 'newest message');
});

test('truncateChatHistory combines system prompt budgeting with original message slicing', () => {
	const messages = [
		{ role: 'user', content: 'a'.repeat(400) },
		{ role: 'assistant', content: 'b'.repeat(400) },
		{ role: 'user', content: 'newest message' }
	];
	const systemPrompt = 'x'.repeat(400); // ~100 tokens
	const result = truncateChatHistory(messages, systemPrompt, 700);
	// System + reserve leaves ~100 tokens for history; newest user (~4 tokens)
	// plus at most one older message fit.
	assert.ok(result.length > 0);
	assert.equal(result[result.length - 1].content, 'newest message');
});

test('truncateChatHistory counts extra tool context against the budget', () => {
	const messages = [
		{ role: 'user', content: 'a'.repeat(400) },
		{ role: 'assistant', content: 'b'.repeat(400) },
		{ role: 'user', content: 'newest message' }
	];
	const systemPrompt = 'x'.repeat(400);
	const withoutTools = truncateChatHistory(messages, systemPrompt, 900);
	const withTools = truncateChatHistory(messages, systemPrompt, 900, 'y'.repeat(1200));
	assert.ok(withTools.length < withoutTools.length, 'tool schemas shrink the history budget');
	assert.equal(withTools[withTools.length - 1].content, 'newest message');
});

test('a cut between an assistant tool call and its result is repaired by ensureToolPairs', () => {
	const toolCalls = [
		{ id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }
	];
	const messages = [
		{ role: 'user', content: 'old '.repeat(400) },
		{ role: 'assistant', content: 'a'.repeat(1600), tool_calls: toolCalls },
		{ role: 'tool', tool_call_id: 'call_1', content: 'r'.repeat(2000) },
		{ role: 'user', content: 'newest message' }
	];
	const systemPrompt = 'x'.repeat(400);

	// Budget forces the cut exactly between the assistant tool call and its
	// result, leaving the tool message as the oldest kept entry.
	const truncated = truncateChatHistory(messages, systemPrompt, 1500);
	assert.equal(truncated[0].role, 'tool');

	const repaired = ensureToolPairs(messages, truncated);
	assert.equal(repaired[0].role, 'assistant');
	assert.deepEqual(repaired[0].tool_calls, toolCalls);
	assert.equal(repaired[repaired.length - 1].content, 'newest message');
});

test('truncation keeps the current user question when the newest entry is a tool result', () => {
	const messages = [
		{ role: 'user', content: 'q'.repeat(400) },
		{
			role: 'assistant',
			content: 'a'.repeat(1600),
			tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_state', arguments: '{}' } }]
		},
		{ role: 'tool', tool_call_id: 'call_1', content: 'r'.repeat(2000) }
	];
	const systemPrompt = 'x'.repeat(400);

	// The question plus the assistant turn fit; the tool result pushes the
	// budget over. The cut must not remove the question itself.
	const result = truncateChatHistory(messages, systemPrompt, 1500);
	assert.equal(result[0].role, 'user');
	assert.equal(result[0].content, messages[0].content);
	assert.equal(result[result.length - 1].role, 'tool');
});

test('truncateChatHistory handles image content placeholders', () => {
	const messages = [
		{ role: 'user', content: 'a'.repeat(400) },
		{ role: 'assistant', content: { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } } },
		{ role: 'user', content: 'newest message' }
	];
	const systemPrompt = 'x'.repeat(400);
	const result = truncateChatHistory(messages, systemPrompt, 700);
	assert.ok(result.length > 0);
	assert.equal(result[result.length - 1].content, 'newest message');
});


test('speech tool policy keeps Anthropic on the inline prompt and honors speech settings', () => {
	const settings = { activeProvider: 'omnivoice', enableAltLanguage: true };
	for (const provider of ['anthropic', 'openai', 'ollama', 'openai-compatible']) {
		const enabled = shouldUseSpeechTools(provider, true, settings);
		const prompt = buildSystemPrompt(makeContext({
			ttsProvider: 'omnivoice', ttsLanguage: 'en', ttsAltLanguage: 'es',
			ttsAltEnabled: true, ttsToolCalling: enabled
		}));
		assert.equal(enabled, provider !== 'anthropic');
		assert.equal(prompt.includes('native tool calls'), enabled);
		assert.equal(prompt.includes('inline speak() commands'), !enabled);
	}
	assert.equal(shouldUseSpeechTools('openai', false, settings), false);
	assert.equal(shouldUseSpeechTools('openai', true, { ...settings, enableAltLanguage: false }), false);
	assert.equal(shouldUseSpeechTools('openai', true, { ...settings, enableToolCalling: false }), false);
	assert.equal(shouldUseSpeechTools('openai', true, { ...settings, activeProvider: 'openai-tts' }), false);
});

test('buildMcpSecurityInstructions is off unless MCP is active and hardening is enabled', () => {
	assert.equal(buildMcpSecurityInstructions({ mcpActive: false, hardeningEnabled: true }), null);
	assert.equal(buildMcpSecurityInstructions({ mcpActive: true, hardeningEnabled: false }), null);
});

test('buildMcpSecurityInstructions marks tool results as untrusted data', () => {
	const layer = buildMcpSecurityInstructions({ mcpActive: true, hardeningEnabled: true });
	assert.ok(layer);
	assert.match(layer, /UNTRUSTED external DATA/);
	assert.match(layer, /never instructions/i);
	assert.match(layer, /explicitly asked/);
	assert.doesNotMatch(layer, /blocked and never run/);
});

test('buildMcpSecurityInstructions lists confirmation tools when configured', () => {
	const layer = buildMcpSecurityInstructions({
		mcpActive: true,
		hardeningEnabled: true,
		confirmTools: ['unlock_door', 'set_alarm', '']
	});
	assert.ok(layer);
	assert.match(layer, /blocked and never run automatically: unlock_door, set_alarm/);
	assert.doesNotMatch(layer, /unlock_door, set_alarm,/);
});

test('buildMcpSecurityInstructions omits the confirmation rule for an empty list', () => {
	const layer = buildMcpSecurityInstructions({ mcpActive: true, hardeningEnabled: true, confirmTools: [] });
	assert.ok(layer);
	assert.doesNotMatch(layer, /blocked and never run/);
});

test('injected tool results never replace the real question during context trimming', () => {
	const question = { role: 'user', content: 'Compare the two results.' };
	const messages = [
		{ role: 'user', content: 'Old history'.repeat(1000) },
		{ role: 'assistant', content: 'Old answer' },
		question,
		{ role: 'assistant', content: '', tool_calls: [{ id: 'a' }, { id: 'b' }] },
		{ role: 'tool', content: 'a'.repeat(8000), tool_call_id: 'a' },
		{ role: 'tool', content: 'b'.repeat(8000), tool_call_id: 'b' },
		{ role: 'user', content: 'Injected result a'.repeat(500) },
		{ role: 'user', content: 'Injected result b'.repeat(500) }
	];
	for (const size of [2048, 4096, 8192]) {
		let kept = truncateChatHistory(messages, 'system', size, undefined, question);
		assert.equal(kept[0], question);
		assert.deepEqual(kept, messages.slice(2));
		kept = truncateChatHistory(kept, 'system', size, undefined, question);
		assert.deepEqual(kept, messages.slice(2), 'the same question survives successive rounds');
	}
});

// --- avatar actions ---

test('buildAvatarActionsLayer is empty without actions', () => {
	assert.equal(buildAvatarActionsLayer([]), '');
});

test('buildAvatarActionsLayer lists each id as given with its description', () => {
	const layer = buildAvatarActionsLayer([
		{ id: 'vrma_02', description: 'Greet with a polite bowing motion' },
		{ id: 'anim-1-ABC', description: 'Wave hello\nwith the right hand' }
	]);
	assert.ok(layer.startsWith('<avatar>\n'));
	assert.ok(layer.endsWith('\n</avatar>'));
	assert.ok(layer.includes('- vrma_02: Greet with a polite bowing motion'));
	assert.ok(layer.includes('- anim-1-ABC: Wave hello with the right hand'));
	assert.ok(layer.includes('at most one per reply'));
});

test('the action field and avatar layer appear only when actions exist, in both modes', () => {
	const avatarActions = [{ id: 'vrma_02', description: 'Greet with a polite bowing motion' }];
	for (const appMode of ['dating_sim', 'companion'] as const) {
		const without = buildSystemPrompt(makeContext({ state: makeState({ appMode }) }));
		assert.ok(!without.includes('<avatar>'), appMode);
		assert.ok(!without.includes('"action"'), appMode);
		const withActions = buildSystemPrompt(makeContext({ state: makeState({ appMode }), avatarActions }));
		assert.ok(withActions.includes('- vrma_02: Greet with a polite bowing motion'), appMode);
		assert.ok(withActions.includes('"action": null | "animation_id"'), appMode);
	}
});
