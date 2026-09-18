<script lang="ts">
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<!-- App Mode Toggle -->
<div class="mode-section">
	<span class="settings-label">App Mode</span>
	<SegmentedControl label="App mode" value={page.appMode} onchange={page.requestModeChange}
		options={[{ value: 'companion', label: 'Companion', icon: 'sparkles' }, { value: 'dating_sim', label: 'Dating Sim', icon: 'heart' }]} />
</div>

<style>
	/* Mode Section */
	.mode-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-light);
	}

</style>
