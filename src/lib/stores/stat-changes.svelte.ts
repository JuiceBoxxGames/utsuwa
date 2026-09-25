// Store for tracking stat change events (for floating indicators)

export interface StatChangeEvent {
	id: string;
	stat: string;
	delta: number;
	color: string;
	icon: string;
	timestamp: number;
}

// Stat configuration for colors and icons (uses CSS variables from theme)
const STAT_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
	affection: { color: 'var(--ctp-pink)', icon: 'heart', label: 'Affection' },
	trust: { color: 'var(--ctp-green)', icon: 'shield', label: 'Trust' },
	intimacy: { color: 'var(--ctp-pink)', icon: 'sparkles', label: 'Intimacy' },
	comfort: { color: 'var(--ctp-mauve)', icon: 'cloud', label: 'Comfort' },
	respect: { color: 'var(--ctp-peach)', icon: 'star', label: 'Respect' },
	energy: { color: 'var(--ctp-blue)', icon: 'zap', label: 'Energy' }
};

// Queue of active stat change indicators
let changes = $state<StatChangeEvent[]>([]);

// Counter for unique IDs
let idCounter = 0;

function createStatChangesStore() {
	return {
		get changes() {
			return changes;
		},

		// Emit a stat change event
		emit(stat: string, delta: number) {
			const config = STAT_CONFIG[stat];
			if (!config || delta === 0) return;

			const event: StatChangeEvent = {
				id: `${stat}-${idCounter++}-${Date.now()}`,
				stat,
				delta,
				color: config.color,
				icon: config.icon,
				timestamp: Date.now()
			};

			changes = [...changes, event];

			// Auto-remove after animation completes (2.5 seconds)
			setTimeout(() => {
				this.remove(event.id);
			}, 2500);
		},

		// Remove a completed event
		remove(id: string) {
			changes = changes.filter((c) => c.id !== id);
		},

		// Clear all events
		clear() {
			changes = [];
		}
	};
}

export const statChangesStore = createStatChangesStore();
