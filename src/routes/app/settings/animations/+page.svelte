<script lang="ts">
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import AnimationRow from '$lib/components/settings/AnimationRow.svelte';
	import { Button, Icon } from '$lib/components/ui';
	import { animationLibraryStore } from '$lib/stores/animation-library.svelte';

	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	let uploadError = $state('');
	const customEntries = $derived(animationLibraryStore.entries.filter((e) => e.custom));
	const builtinEntries = $derived(animationLibraryStore.entries.filter((e) => !e.custom));

	async function handleFile(input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploading = true;
		uploadError = '';
		try {
			await animationLibraryStore.addFromFile(file);
		} catch (e) {
			uploadError = e instanceof Error ? e.message : "Couldn't add that animation.";
		} finally {
			uploading = false;
		}
	}
</script>

<div class="page">
	<header class="page-header">
		<h2>Animations</h2>
		<p>Motions she can perform. Describe each one so she knows when to use it.</p>
		<p>Play switches back to your companion to show the motion.</p>
	</header>
	<SettingsSection title="Your animations">
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => fileInput?.click()} disabled={uploading}>
				<Icon name="upload" size={14} />{uploading ? 'Checking...' : 'Upload'}
			</Button>
			<input bind:this={fileInput} type="file" accept=".vrma" hidden onchange={(e) => handleFile(e.currentTarget)} />
		{/snippet}
		{#if uploadError}<p class="hint error" role="alert">{uploadError}</p>{/if}
		{#each customEntries as entry (entry.id)}
			<AnimationRow {entry} />
		{:else}
			<p class="hint">No custom animations yet. Upload a .vrma file to add one.</p>
		{/each}
	</SettingsSection>
	<SettingsSection title="Built-in emotes">
		{#each builtinEntries as entry (entry.id)}
			<AnimationRow {entry} />
		{/each}
	</SettingsSection>
</div>

<style>
	.hint { margin: 0; color: var(--text-secondary); }
	.hint.error { margin-bottom: 12px; color: var(--color-error); }
	.page :global(header .btn) { display: inline-flex; align-items: center; gap: 6px; }
</style>
