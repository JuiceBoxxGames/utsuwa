import { createScreenWakeLock, type WakeStatus } from '$lib/services/screen-wake-lock';

let status = $state<WakeStatus>('unsupported');
let enabled = false;
let controller: ReturnType<typeof createScreenWakeLock> | undefined;
export const wakeLockStore = {
	get status() {
		return status;
	},
	setEnabled(value: boolean) {
		enabled = value;
		controller?.setEnabled(value);
	},
	retry() {
		controller?.retry();
	},
	start() {
		controller = createScreenWakeLock(
			'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : undefined,
			(value) => {
				status = value;
			}
		);
		const visibility = () => controller?.setVisible(document.visibilityState === 'visible');
		const hide = () => controller?.setVisible(false);
		visibility();
		controller.setEnabled(enabled);
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('pagehide', hide);
		window.addEventListener('pageshow', visibility);
		return () => {
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('pagehide', hide);
			window.removeEventListener('pageshow', visibility);
			controller?.dispose();
			controller = undefined;
			status = 'off';
		};
	}
};
