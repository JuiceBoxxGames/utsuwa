<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { cycleColorMode, getColorMode, type ColorMode } from '$lib/utils/color-mode';

	// system -> light -> dark. Each domain remembers its own choice.
	let colorMode = $state<ColorMode>('system');

	onMount(() => {
		colorMode = getColorMode();
	});

	const iconName = $derived(colorMode === 'light' ? 'sun' : colorMode === 'dark' ? 'moon' : 'monitor');
	const label = $derived(colorMode === 'light' ? 'Light' : colorMode === 'dark' ? 'Dark' : 'System');
</script>

<button
	type="button"
	class="btn btn-ghost btn-sm"
	onclick={() => (colorMode = cycleColorMode())}
	aria-label={`Theme: ${label}`}
	title={`Theme: ${label}`}
>
	<Icon name={iconName} size={14} />
	<span>{label}</span>
</button>
