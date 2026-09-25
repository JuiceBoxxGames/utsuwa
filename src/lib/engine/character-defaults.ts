import type { CharacterState, MoodState, PersonalityProfile } from '../types/character.ts';
import { DEFAULT_SYSTEM_PROMPT } from '../types/character.ts';

// Default values for creating new state
function createDefaultPersonality(): PersonalityProfile {
	return {
		openness: 0,
		warmth: 20,
		assertiveness: -10,
		playfulness: 10,
		sensitivity: 20,
		likesTeasing: 0,
		prefersDirectness: -10,
		romanticStyle: 'slow_burn'
	};
}

function createDefaultMood(): MoodState {
	return {
		primary: 'neutral',
		intensity: 50,
		causes: []
	};
}

export function createDefaultCharacterState(): Omit<CharacterState, 'id'> {
	const now = new Date();
	return {
		// Persona fields
		name: 'Utsuwa',
		systemPrompt: DEFAULT_SYSTEM_PROMPT,
		extensions: {},

		// Character state
		mood: createDefaultMood(),
		energy: 100,
		affection: 0,
		trust: 0,
		intimacy: 0,
		comfort: 0,
		respect: 0,
		appMode: 'dating_sim',
		relationshipStage: 'stranger',
		personality: createDefaultPersonality(),
		lastInteraction: null,
		lastDecayAt: null,
		firstMet: now,
		daysKnown: 0,
		totalInteractions: 0,
		currentStreak: 0,
		longestStreak: 0,
		streakLastDate: null,
		completedEvents: [],
		createdAt: now,
		updatedAt: now
	};
}
