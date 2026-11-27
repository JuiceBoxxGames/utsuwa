<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { m } from '$lib/paraglide/messages';
	import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
	import { cycleColorMode, getColorMode, type ColorMode } from '$lib/utils/color-mode';

	// system -> light -> dark. Each domain remembers its own choice.
	let colorMode = $state<ColorMode>('system');

	onMount(() => {
		colorMode = getColorMode();
		// Another tab changed the mode; the layout already re-themes the page
		const onStorage = (event: StorageEvent) => {
			if (event.key === STORAGE_INVENTORY.localStorage.colorMode) colorMode = getColorMode();
		};
		window.addEventListener('storage', onStorage);
		return () => window.removeEventListener('storage', onStorage);
	});

	const iconName = $derived(colorMode === 'light' ? 'sun' : colorMode === 'dark' ? 'moon' : 'monitor');
	const label = $derived(colorMode === 'light' ? m.theme_light() : colorMode === 'dark' ? m.theme_dark() : m.theme_system());
</script>

<button
	type="button"
	class="btn btn-ghost btn-sm"
	onclick={() => (colorMode = cycleColorMode())}
	aria-label={m.theme_label({ mode: label })}
	title={m.theme_label({ mode: label })}
>
	<Icon name={iconName} size={14} />
	<span>{label}</span>
</button>
