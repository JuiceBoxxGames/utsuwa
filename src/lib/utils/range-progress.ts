/** Keep T3's filled track aligned with the thumb, including programmatic resets. */
export function rangeProgress(node: HTMLInputElement, value: number) {
	function paint(value: number) {
		const min = Number(node.min || 0);
		const max = Number(node.max || 100);
		const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
		node.style.setProperty('--settings-slider-progress', `${ratio * 100}%`);
		node.style.setProperty('--settings-slider-fill-offset', `${0.5 - ratio}rem`);
	}
	const input = () => paint(node.valueAsNumber);
	paint(value);
	node.addEventListener('input', input);
	return { update: paint, destroy: () => node.removeEventListener('input', input) };
}
