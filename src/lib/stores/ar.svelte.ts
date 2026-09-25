import { browser } from '$app/environment';

// WebXR immersive-ar is available on Android Chrome and headset browsers.
// Desktop and iOS Safari report unsupported, so the AR button stays hidden there.
function createArStore() {
	let supported = $state(false);
	let active = $state(false);

	// Native check instead of @threlte/xr's getXRSupportState (same logic): a static
	// threlte import here would drag three.js into every page with the top bar.
	if (browser) {
		navigator.xr
			?.isSessionSupported('immersive-ar')
			.then((ok) => (supported = ok))
			.catch(() => (supported = false));
	}

	async function enter() {
		try {
			const { toggleXRSession } = await import('@threlte/xr');
			await toggleXRSession(
				'immersive-ar',
				{
					requiredFeatures: ['hit-test'],
					optionalFeatures: ['dom-overlay'],
					domOverlay: { root: document.body }
				},
				'enter'
			);
		} catch (e) {
			console.error('Failed to start AR session:', e);
		}
	}

	async function exit() {
		try {
			const { toggleXRSession } = await import('@threlte/xr');
			await toggleXRSession('immersive-ar', undefined, 'exit');
		} catch (e) {
			console.error('Failed to end AR session:', e);
		}
	}

	function setActive(value: boolean) {
		active = value;
	}

	return {
		get supported() {
			return supported;
		},
		get active() {
			return active;
		},
		enter,
		exit,
		setActive
	};
}

export const arStore = createArStore();
