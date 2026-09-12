export type WakeStatus = 'unsupported' | 'off' | 'requesting' | 'active' | 'inactive';
export interface ScreenLock {
	readonly released: boolean;
	release(): Promise<void>;
	addEventListener(type: 'release', callback: () => void, options?: { once: boolean }): void;
}

// Own one lock. A late request must never keep the screen on after disabling
// the option, hiding the document, or navigating out of the application.
export function createScreenWakeLock(
	request: (() => Promise<ScreenLock>) | undefined,
	onStatus: (status: WakeStatus) => void
) {
	let enabled = false;
	let visible = true;
	let disposed = false;
	let generation = 0;
	let lock: ScreenLock | undefined;
	const report = (status: WakeStatus) => {
		if (!disposed) onStatus(status);
	};

	function release(previous: ScreenLock | undefined) {
		if (!previous || previous.released) return;
		void previous.release().catch(() => {
			// Keep the UI truthful if the platform refuses a release.
			if (!previous.released && !lock && !disposed) {
				lock = previous;
				report('active');
			}
		});
	}
	async function reconcile() {
		const version = ++generation;
		if (!request) {
			report('unsupported');
			return;
		}
		if (!enabled || !visible || disposed) {
			const previous = lock;
			lock = undefined;
			release(previous);
			report(enabled ? 'inactive' : 'off');
			return;
		}
		if (lock && !lock.released) {
			report('active');
			return;
		}
		report('requesting');
		try {
			const acquired = await request();
			if (disposed || version !== generation || !enabled || !visible) {
				release(acquired);
				return;
			}
			lock = acquired;
			acquired.addEventListener(
				'release',
				() => {
					if (lock !== acquired) return;
					lock = undefined;
					report(enabled ? 'inactive' : 'off');
				},
				{ once: true }
			);
			report(acquired.released ? 'inactive' : 'active');
		} catch {
			if (version === generation) report(enabled ? 'inactive' : 'off');
		}
	}
	onStatus(request ? 'off' : 'unsupported');
	return {
		setEnabled(value: boolean) {
			if (enabled !== value) {
				enabled = value;
				void reconcile();
			}
		},
		setVisible(value: boolean) {
			if (visible !== value) {
				visible = value;
				void reconcile();
			}
		},
		retry() {
			if (!disposed) void reconcile();
		},
		dispose() {
			disposed = true;
			void reconcile();
		}
	};
}
