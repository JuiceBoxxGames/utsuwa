import type { MoodExpressionTarget } from './mood-expression.ts';

export interface MoodFace {
	name: string;
	weight: number;
}

// holdUntil is fixed once the release starts so late speech can't pop it back
export interface FlashFace {
	name: string;
	weight: number;
	t: number;
	holdUntil: number | null;
}

export interface BlinkState {
	timer: number;
	next: number;
	active: boolean;
	progress: number;
}

export interface FaceState {
	mood: MoodFace | null;
	flash: FlashFace | null;
	blink: BlinkState;
}

export interface Visemes {
	aa: number;
	ee: number;
	ih: number;
	oh: number;
	ou: number;
}

export interface ComposeInput {
	delta: number;
	state: FaceState;
	moodTarget: MoodExpressionTarget | null;
	emotePlaying: boolean;
	// Photo-held and emote faces own their expression outright
	held: string | null;
	emote: string | null;
	// The tap reaction's weight this frame, when one is running
	reaction: { name: string; value: number } | null;
	photoActive: boolean;
	speaking: boolean;
	visemes: Visemes;
	random: () => number;
}

export interface ComposeOutput {
	state: FaceState;
	// Applied before the expression update
	face: Map<string, number>;
	// Applied after it, so the mouth lands on the next update
	mouth: Map<string, number>;
}

const BLINK_NAMES = ['blink', 'Blink', 'eyeBlinkLeft', 'eyeBlinkRight'];

const nextBlinkIn = (random: () => number) => random() * 4 + 2;

export function createFaceState(random: () => number = Math.random): FaceState {
	return { mood: null, flash: null, blink: { timer: 0, next: nextBlinkIn(random), active: false, progress: 0 } };
}

// Mood face is the bottom layer: reactions, emotes, and held photo
// expressions all win over it for the expression they touch.
export function composeExpressionWeights(input: ComposeInput): ComposeOutput {
	const { delta, held, emote, reaction } = input;
	const face = new Map<string, number>();

	// === Mood face ===
	// Swapping expressions fades the old one fully out before the new one
	// starts, so two moods never blend into a muddled face
	const moodGoal = input.emotePlaying ? null : input.moodTarget;
	const moodStep = Math.min(1, delta * 1.5);
	let mood = input.state.mood ? { ...input.state.mood } : null;
	if (mood && mood.name !== moodGoal?.name) {
		mood.weight -= mood.weight * moodStep;
		if (mood.weight < 0.01) mood.weight = 0;
	} else if (moodGoal) {
		mood ??= { name: moodGoal.name, weight: 0 };
		mood.weight += (moodGoal.weight - mood.weight) * moodStep;
	}
	if (mood) {
		const name = mood.name;
		if (held !== name && emote !== name) {
			// A tap reaction on the same expression rides on top of the mood
			// instead of dipping it to zero and popping back afterwards
			const floor = reaction?.name === name ? reaction.value : 0;
			face.set(name, Math.max(floor, mood.weight));
		}
		if (mood.weight === 0) mood = null;
	}

	// === Flash face ===
	// Attack 0.25s, hold 2.5s (longer while she speaks, up to 8s), release 0.8s
	let flash = input.state.flash ? { ...input.state.flash } : null;
	if (flash) {
		const name = flash.name;
		const owned = held === name || emote === name || reaction?.name === name;
		if (input.photoActive) {
			if (held !== name) face.set(name, 0);
			flash = null;
		} else {
			flash.t += delta;
			if (flash.holdUntil === null) {
				const holdEnd = input.speaking ? Math.min(8, Math.max(2.5, flash.t + 0.01)) : 2.5;
				if (flash.t >= holdEnd) flash.holdUntil = flash.t;
			}
			const shape =
				flash.holdUntil === null ? Math.min(1, flash.t / 0.25) : 1 - (flash.t - flash.holdUntil) / 0.8;
			if (shape <= 0) {
				if (!owned && mood?.name !== name) face.set(name, 0);
				flash = null;
			} else if (!owned) {
				// Never dip the resting face on the same expression
				face.set(name, Math.max(mood?.name === name ? mood.weight : 0, flash.weight * shape));
			}
		}
	}

	// === Blink (idle only, off during emotes) ===
	const blink = { ...input.state.blink };
	if (!input.emotePlaying) {
		blink.timer += delta;
		if (!blink.active && blink.timer >= blink.next) {
			blink.active = true;
			blink.progress = 0;
		}
		if (blink.active) {
			// ~0.125s: quick close (30%), slow open (70%)
			blink.progress += delta * 8;
			const value = blink.progress < 0.3 ? blink.progress / 0.3 : 1 - (blink.progress - 0.3) / 0.7;
			let weight = Math.max(0, value);
			if (blink.progress >= 1) {
				blink.active = false;
				blink.timer = 0;
				blink.next = nextBlinkIn(input.random);
				weight = 0;
			}
			for (const name of BLINK_NAMES) face.set(name, weight);
		}
	}

	// === Lip sync: VRM 1.0, VRM 0.x, and ARKit names ===
	const v = input.visemes;
	const mouth = new Map<string, number>([
		['aa', v.aa],
		['ee', v.ee],
		['ih', v.ih],
		['oh', v.oh],
		['ou', v.ou],
		['a', v.aa],
		['i', v.ih],
		['u', v.ou],
		['e', v.ee],
		['o', v.oh],
		['jawOpen', v.aa * 0.7]
	]);

	return { state: { mood, flash, blink }, face, mouth };
}

// Emotes wear a happy face; works with any model's naming
export function findHappyExpression(names: readonly string[]): string | null {
	for (const keyword of ['happy', 'joy', 'smile', 'fun', 'cheerful']) {
		const match = names.find((name) => name.toLowerCase().includes(keyword));
		if (match) return match;
	}
	return null;
}
