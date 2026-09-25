import type { ToolCall } from './speech-compiler.ts';
import type { SpeechSettings } from '../modules/settings.ts';
import type { OpenAiToolDefinition } from '../mcp/loop.ts';
import { buildSpeechToolLanguages } from './tts-options.ts';

/** Both the prompt and request must use the transport's supported speech format. */
export function shouldUseSpeechTools(
	llmProvider: string,
	speechEnabled: boolean,
	settings: Partial<Pick<SpeechSettings, 'activeProvider' | 'enableAltLanguage' | 'enableToolCalling'>>
): boolean {
	// Anthropic requests currently use text only; keep the inline speak() fallback.
	return llmProvider !== 'anthropic'
		&& speechEnabled
		&& settings.activeProvider === 'omnivoice'
		&& settings.enableAltLanguage === true
		&& settings.enableToolCalling !== false;
}

/**
 * Native speech tools for OmniVoice. With function calling, speak_segment
 * carries a structured language tag instead of a pseudo-call in the text.
 */
export function buildSpeechTools(
	llmProvider: string,
	speechEnabled: boolean,
	settings: Pick<SpeechSettings, 'activeProvider' | 'enableAltLanguage' | 'enableToolCalling' | 'activeLanguage' | 'altLanguage'>
): OpenAiToolDefinition[] | undefined {
	const languages = buildSpeechToolLanguages(settings);
	if (!shouldUseSpeechTools(llmProvider, speechEnabled, settings)) return undefined;
	return [
		{
			type: 'function',
			function: {
				name: 'speak_segment',
				description: 'Speak exactly ONE short phrase. Call separately for each phrase. language is REQUIRED.',
				parameters: {
					type: 'object',
					properties: {
						text: { type: 'string', description: 'One short phrase to speak. Max 1 sentence.' },
						language: { type: 'string', enum: languages, description: 'Language of the text. REQUIRED.' }
					},
					required: ['text', 'language']
				}
			}
		},
		{
			type: 'function',
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
			type: 'function',
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
	];
}

export interface SpeakParams {
	text: string;
	lang?: string;
}

export interface PauseParams {
	ms: number;
}

export interface GestureParams {
	type: string;
}

/** Validate and parse a tool call's arguments. Returns null for unknown tools. */
export function parseToolCall(call: ToolCall): ToolCall | null {
	if (call.name === 'speak') {
		const a = call.arguments as Partial<SpeakParams>;
		return {
			name: 'speak',
			arguments: {
				text: typeof a.text === 'string' ? a.text : '',
				lang:
					typeof a.lang === 'string' && a.lang.length >= 2 && a.lang.length <= 20
						? a.lang.toLowerCase()
						: undefined
			}
		};
	}

	if (call.name === 'pause') {
		const a = call.arguments as Partial<PauseParams>;
		const ms = typeof a.ms === 'number' ? Math.round(a.ms) : 500;
		return {
			name: 'pause',
			arguments: { ms: Math.max(100, Math.min(5000, ms)) }
		};
	}

	if (call.name === 'gesture') {
		const a = call.arguments as Partial<GestureParams>;
		const VALID = new Set(['smile', 'laugh', 'surprise', 'nod', 'shake_head', 'wave']);
		const type = String(a.type ?? '').toLowerCase();
		return VALID.has(type)
			? { name: 'gesture', arguments: { type } }
			: null;
	}

	return null;
}
