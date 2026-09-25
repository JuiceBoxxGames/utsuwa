import type { EventDefinition } from '$lib/types/events';

// Developer-tools events. The developer page triggers one and navigates home;
// it opens right away if a page is listening, otherwise when the next one mounts.
let pendingEvent: EventDefinition | null = null;
let listener: ((event: EventDefinition) => void) | null = null;

export const debugEventsStore = {
	trigger(event: EventDefinition) {
		if (listener) listener(event);
		else pendingEvent = event;
	},

	listen(fn: (event: EventDefinition) => void): () => void {
		listener = fn;
		const event = pendingEvent;
		pendingEvent = null;
		if (event) fn(event);
		return () => {
			if (listener === fn) listener = null;
		};
	}
};

// Sample test events for debugging
export const testEvents: EventDefinition[] = [
	{
		id: 'test_milestone',
		name: 'Test Milestone',
		type: 'milestone',
		conditions: [],
		scene: {
			id: 'test_milestone_scene',
			intro: 'A special moment is happening...',
			dialogue:
				"Wow, this is a test milestone event! The styling looks great, doesn't it? I love how the modal matches the rest of the app now."
		},
		stateChanges: { affectionDelta: 5 },
		oneTime: false,
		priority: 100
	},
	{
		id: 'test_anniversary',
		name: 'Test Anniversary',
		type: 'anniversary',
		conditions: [],
		scene: {
			id: 'test_anniversary_scene',
			intro: 'Today marks a special occasion...',
			dialogue:
				"Happy anniversary! Well, not really, but this is what an anniversary event looks like. Pretty cute, right?"
		},
		stateChanges: { affectionDelta: 10, trustDelta: 5 },
		oneTime: false,
		priority: 80
	},
	{
		id: 'test_conditional',
		name: 'Test Conditional',
		type: 'conditional',
		conditions: [],
		scene: {
			id: 'test_conditional_scene',
			intro: 'Something feels different today...',
			dialogue: "I wanted to talk to you about something important...",
			choices: [
				{
					text: "I'm listening.",
					response:
						"Thank you for being here. This is just a test, but your choice was recorded!",
					stateChanges: { trustDelta: 10 }
				},
				{
					text: 'What is it?',
					response:
						"Oh, it's nothing really. Just testing the choice system! Your selection works perfectly.",
					stateChanges: { affectionDelta: 5 }
				}
			]
		},
		oneTime: false,
		priority: 70
	},
	{
		id: 'test_random',
		name: 'Test Random Event',
		type: 'random',
		conditions: [],
		scene: {
			id: 'test_random_scene',
			dialogue:
				"*yawns* Oh, hi there! I was just daydreaming. Random events like this can happen anytime!"
		},
		stateChanges: { comfortDelta: 3 },
		oneTime: false,
		priority: 30
	}
];
