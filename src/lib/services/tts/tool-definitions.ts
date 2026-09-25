import type { ToolCall } from './speech-compiler.ts';
import type { SpeechSettings } from '../modules/settings.ts';

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

export const TOOL_DEFINITIONS = [
	{
		name: 'speak',
		description: 'Speak the given text in the specified language. Omit lang for the primary language.',
		parameters: {
			type: 'object',
			properties: {
				text: { type: 'string', description: 'The text to speak' },
				lang: { type: 'string', description: 'ISO 639-1 language code (e.g. de, en, es, fr)' }
			},
			required: ['text']
		}
	},
	{
		name: 'pause',
		description: 'Insert a pause between speech segments.',
		parameters: {
			type: 'object',
			properties: {
				ms: { type: 'number', description: 'Pause duration in milliseconds (100–5000)' }
			},
			required: ['ms']
		}
	},
	{
		name: 'gesture',
		description: 'Trigger an avatar expression.',
		parameters: {
			type: 'object',
			properties: {
				type: { type: 'string', description: 'smile, laugh, surprise, nod, shake_head, wave' }
			},
			required: ['type']
		}
	}
] as const;

/** Validate and parse a tool call's arguments. Returns null for unknown tools. */
export function parseToolCall(call: ToolCall): ToolCall | null {
	if (!TOOL_DEFINITIONS.some((t) => t.name === call.name)) return null;

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
