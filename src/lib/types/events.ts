import type { Emotion, RelationshipStage, StateUpdates } from './character';

// Event types
export type EventType = 'milestone' | 'random' | 'scheduled' | 'conditional' | 'anniversary';

// Time of day for time-based conditions
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// Event condition types (discriminated union)
export type EventCondition =
	| { type: 'min_affection'; value: number }
	| { type: 'min_trust'; value: number }
	| { type: 'min_intimacy'; value: number }
	| { type: 'min_comfort'; value: number }
	| { type: 'min_respect'; value: number }
	| { type: 'max_energy'; value: number }
	| { type: 'relationship_stage'; value: RelationshipStage }
	| { type: 'relationship_stage_min'; value: RelationshipStage }
	| { type: 'days_known'; value: number }
	| { type: 'total_interactions'; value: number }
	| { type: 'event_completed'; value: string }
	| { type: 'event_not_completed'; value: string }
	| { type: 'time_of_day'; value: TimeOfDay }
	| { type: 'day_of_week'; value: number } // 0 = Sunday, 6 = Saturday
	| { type: 'random_chance'; value: number } // 0-1 probability
	| { type: 'keyword_mentioned'; value: string }
	| { type: 'mood_is'; value: Emotion }
	| { type: 'mood_intensity_min'; value: number }
	| { type: 'consecutive_days'; value: number }
	| { type: 'hours_since_last_interaction_min'; value: number }
	| { type: 'hours_since_last_interaction_max'; value: number };

// Scene choice (for branching events)
export interface SceneChoice {
	text: string; // What the user sees
	response: string; // Companion's response if chosen
	stateChanges: Partial<StateUpdates>; // State changes if chosen
	nextSceneId?: string; // For multi-scene branches
	unlocks?: string[]; // Content/feature unlocks
}

// Scene definition
export interface Scene {
	id: string;
	intro?: string; // Narration before dialogue (optional)
	dialogue?: string; // What the companion says
	choices?: SceneChoice[]; // Branching options (optional)
	outro?: string; // Narration after (optional)
	backgroundChange?: string; // Change background/scene
	expressionOverride?: string; // Force a specific VRM expression
	musicCue?: string; // Play specific music/sound
}

// Full event definition
export interface EventDefinition {
	id: string;
	name: string;
	type: EventType;

	// Trigger conditions (all must be met)
	conditions: EventCondition[];

	// What happens when triggered
	scene?: Scene;
	stateChanges?: Partial<StateUpdates>;
	unlocks?: string[]; // IDs of unlocked content/features
	achievementId?: string; // Link to achievement system (future)

	// Repeat rules
	oneTime: boolean;
	cooldownDays?: number; // Days before can trigger again (if not oneTime)
	lastTriggered?: Date; // Track last trigger (runtime)

	// Priority for when multiple events could trigger
	priority: number; // Higher = checked first
}

// Completed event record (database)
export interface CompletedEventRecord {
	id?: number;
	eventId: string;
	eventType: EventType;
	choiceIndex?: number;
	outcome?: string;
	stateChanges?: Partial<StateUpdates>;
	completedAt: Date;
}

// Event check result
export interface EventCheckResult {
	triggered: boolean;
	event?: EventDefinition;
	failedConditions?: EventCondition[];
}
