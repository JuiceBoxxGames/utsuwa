// Feature vignettes cycle through a few states. The current state rides on the
// node's data-step attribute and CSS does the rest.

/** Which step is showing `elapsed` ms into a loop of steps with these durations. */
export function stepAt(elapsed: number, durations: number[]): number {
	const total = durations.reduce((sum, d) => sum + d, 0);
	if (durations.length < 2 || total <= 0 || elapsed <= 0) return 0;
	let t = elapsed % total;
	for (let i = 0; i < durations.length; i++) {
		if (t < durations[i]) return i;
		t -= durations[i];
	}
	return 0;
}

/**
 * Svelte action: steps data-step on the node while it is on screen. Reduced
 * motion holds the last step, which shows the finished state.
 */
export function stepLoop(node: HTMLElement, durations: number[]) {
	const last = String(durations.length - 1);
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
		node.dataset.step = last;
		return;
	}
	node.dataset.step = '0';
	let frame = 0;
	let start = 0;
	let pausedAt = 0;
	const tick = (now: number) => {
		if (!start) start = now;
		node.dataset.step = String(stepAt(now - start, durations));
		frame = requestAnimationFrame(tick);
	};
	const observer = new IntersectionObserver(([entry]) => {
		if (entry.isIntersecting && !frame) {
			if (pausedAt) start += performance.now() - pausedAt;
			frame = requestAnimationFrame(tick);
		} else if (!entry.isIntersecting && frame) {
			cancelAnimationFrame(frame);
			frame = 0;
			pausedAt = performance.now();
		}
	});
	observer.observe(node);
	return {
		destroy() {
			observer.disconnect();
			cancelAnimationFrame(frame);
		}
	};
}
