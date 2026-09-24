// Generated event moments. The static scene is both the template the model
// rewrites and the fallback: structure and state effects always come from it,
// only the words change.
import type { AppMode, MoodState, RelationshipStage } from '$lib/types/character';
import type { EventType, Scene } from '$lib/types/events';
// Relative import keeps this module runnable under the node test runner
import { STAGE_INSTRUCTIONS } from './stages.ts';

export interface MomentContext {
	companionName: string;
	personality: string;
	mode: AppMode;
	stage: RelationshipStage;
	mood: MoodState;
	daysKnown: number;
	totalInteractions: number;
	memories: string[];
	recentUserLines: string[];
	eventName: string;
	eventType: EventType;
}

const SCOPE_RULE =
	'You may reference only the facts and shared experiences listed above. If none fits, stay general. Never invent specific past events, names, places, or dates.';

const OUTPUT_SHAPE =
	'{ "intro": string | null, "dialogue": string, "choices": [{ "text": string, "response": string }] | null, "outro": string | null }';

function templateJson(scene: Scene) {
	return {
		intro: scene.intro ?? null,
		dialogue: scene.dialogue ?? null,
		choices: scene.choices?.length ? scene.choices.map((c) => ({ text: c.text, response: c.response })) : null,
		outro: scene.outro ?? null
	};
}

export function buildMomentPrompt(scene: Scene, ctx: MomentContext): { system: string; user: string } {
	const name = ctx.companionName;
	const memories = ctx.memories.length > 0 ? ctx.memories.map((m) => `- ${m}`).join('\n') : 'None yet.';
	const language =
		ctx.recentUserLines.length > 0
			? `Write every field in the language the user writes in. Their recent messages:\n${ctx.recentUserLines.map((l) => `> ${l}`).join('\n')}`
			: 'Write every field in English.';

	const system = `You write a short story moment for ${name}, a companion character, marking "${ctx.eventName}" (${ctx.eventType}).

Who ${name} is:
${ctx.personality.trim() || 'A friendly and caring companion.'}

Where things stand:
- Mode: ${ctx.mode === 'companion' ? 'companion' : 'dating sim'}
- Relationship: ${STAGE_INSTRUCTIONS[ctx.stage]}
- Mood: ${ctx.mood.primary} (intensity ${ctx.mood.intensity}/100)
- Days known: ${ctx.daysKnown}
- Conversations so far: ${ctx.totalInteractions}

Facts and shared experiences ${name} knows:
${memories}

Rewrite the template scene from the user message as ${name}. Keep its emotional purpose and its beats. "intro" and "outro" are brief third-person narration about ${name}; "dialogue" is ${name} speaking to the user in first person. Keep the same number of choices in the same order: each "text" is something the user might say, each "response" is what ${name} answers. Keep lengths close to the template.

${language}

${SCOPE_RULE}

Output ONLY a JSON object with this shape, and use null wherever the template has null:
${OUTPUT_SHAPE}`;

	const user = `Template scene:\n${JSON.stringify(templateJson(scene), null, 2)}`;
	return { system, user };
}

// First balanced {...} in the text, skipping braces inside strings.
function extractObject(raw: string): string | null {
	const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const text = fenced ? fenced[1] : raw;
	const start = text.indexOf('{');
	if (start === -1) return null;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i++) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === '\\') escaped = true;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if (ch === '{') depth++;
		else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
	}
	return null;
}

const CAPS = { narration: 400, dialogue: 1200, choiceText: 160, response: 800 };

// Trimmed non-empty string, undefined when absent or blank, null when over cap.
function field(value: unknown, cap: number): string | undefined | null {
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const text = value.trim();
	return text.length > cap ? null : text;
}

export function parseMoment(raw: string, template: Scene): Scene | null {
	const json = extractObject(raw);
	if (!json) return null;
	let data: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(json);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		data = parsed as Record<string, unknown>;
	} catch {
		return null;
	}

	const dialogue = field(data.dialogue, CAPS.dialogue);
	if (!dialogue) return null;

	// Narration the template has must come back too, or an English intro would
	// lead into dialogue in another language. Missing or over cap means fallback.
	const intro = template.intro ? field(data.intro, CAPS.narration) : undefined;
	const outro = template.outro ? field(data.outro, CAPS.narration) : undefined;
	if ((template.intro && !intro) || (template.outro && !outro)) return null;

	let choices = template.choices;
	if (template.choices?.length) {
		const given = data.choices;
		if (!Array.isArray(given) || given.length !== template.choices.length) return null;
		const next = [];
		for (let i = 0; i < given.length; i++) {
			const item: unknown = given[i];
			if (!item || typeof item !== 'object') return null;
			const { text, response } = item as Record<string, unknown>;
			const t = field(text, CAPS.choiceText);
			const r = field(response, CAPS.response);
			if (!t || !r) return null;
			next.push({ ...template.choices[i], text: t, response: r });
		}
		choices = next;
	}

	return {
		...template,
		intro: intro ?? template.intro,
		dialogue,
		choices,
		outro: outro ?? template.outro
	};
}

const PREFERRED = new Set(['shared_experience', 'relationship']);

export function selectMomentMemories(
	facts: { content: string; category: string; importance: number; createdAt: Date }[],
	max = 8
): string[] {
	const ranked = [...facts].sort(
		(a, b) =>
			Number(PREFERRED.has(b.category)) - Number(PREFERRED.has(a.category)) ||
			b.importance - a.importance ||
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
	);
	const picked: string[] = [];
	for (const fact of ranked) {
		const content = fact.content.trim();
		if (content && !picked.includes(content)) picked.push(content);
		if (picked.length >= max) break;
	}
	return picked;
}
