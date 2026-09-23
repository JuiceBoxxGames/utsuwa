import type { Emotion, MoodState } from '../types/character.ts';

export interface MoodExpressionTarget {
	name: string;
	weight: number;
}

// Candidates cover VRM 1.0 presets and VRM 0.x legacy names, in priority order.
// scale is the weight at full intensity; faces read strong fast, so keep it low.
const MOOD_FACES: Record<Emotion, { candidates: string[]; scale: number } | null> = {
	happy: { candidates: ['happy', 'joy'], scale: 0.6 },
	excited: { candidates: ['happy', 'joy'], scale: 0.8 },
	playful: { candidates: ['happy', 'fun', 'joy'], scale: 0.5 },
	affectionate: { candidates: ['happy', 'relaxed', 'joy'], scale: 0.5 },
	content: { candidates: ['relaxed', 'fun'], scale: 0.5 },
	sad: { candidates: ['sad', 'sorrow'], scale: 0.6 },
	melancholy: { candidates: ['sad', 'sorrow'], scale: 0.45 },
	anxious: { candidates: ['sad', 'sorrow'], scale: 0.3 },
	frustrated: { candidates: ['angry'], scale: 0.5 },
	curious: { candidates: ['surprised'], scale: 0.3 },
	flustered: { candidates: ['surprised'], scale: 0.4 },
	neutral: null
};

// Picks the VRM expression that best represents a mood, or null for neutral / no match.
export function moodExpressionTarget(
	mood: MoodState | undefined,
	available: readonly string[]
): MoodExpressionTarget | null {
	const face = mood && MOOD_FACES[mood.primary];
	if (!face) return null;
	const intensity = Math.max(0, Math.min(100, mood.intensity));
	const weight = Math.round(((face.scale * intensity) / 100) * 1000) / 1000;
	if (!(weight > 0)) return null;
	for (const candidate of face.candidates) {
		const name = available.find((n) => n.toLowerCase() === candidate);
		if (name) return { name, weight };
	}
	return null;
}
