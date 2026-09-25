<script lang="ts">
	import { goto } from '$app/navigation';
	import { localPath } from '$lib/config/links';
	import { Button, Icon } from '$lib/components/ui';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { animationLibraryStore, type AnimationEntry } from '$lib/stores/animation-library.svelte';
	import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from '$lib/stores/animation-library-parser';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { removeAnimation } from '$lib/services/animation-actions';

	let { entry }: { entry: AnimationEntry } = $props();

	// Settings has no avatar, so preview on the companion page
	function play() {
		vrmStore.setCurrentAnimation(entry.url);
		void goto(localPath('app'));
	}

	async function remove() {
		if (!confirm(`Delete "${entry.name}"? This can't be undone.`)) return;
		await removeAnimation(entry.id);
	}

	function rename(input: HTMLInputElement) {
		animationLibraryStore.update(entry.id, { name: input.value });
		// A blank name is ignored, so put the saved one back
		input.value = animationLibraryStore.get(entry.id)?.name ?? input.value;
	}
</script>

<div class="anim-row">
	<div class="anim-head">
		{#if entry.kind === 'custom'}
			<input
				class="settings-field anim-name"
				aria-label="Animation name"
				maxlength={MAX_NAME_LENGTH}
				value={entry.name}
				onchange={(e) => rename(e.currentTarget)}
			/>
		{:else}
			<span class="setting-label">{entry.name}</span>
		{/if}
		{#if entry.durationSec !== undefined}<span class="duration">{entry.durationSec.toFixed(1)} s</span>{/if}
		<div class="anim-actions">
			<Button variant="secondary" size="sm" onclick={play} aria-label="Play {entry.name}">
				<Icon name="play" size={14} />Play
			</Button>
			{#if entry.kind === 'custom'}
				<Button variant="ghost" size="sm" onclick={remove} aria-label="Delete {entry.name}">
					<Icon name="trash" size={14} />Delete
				</Button>
			{/if}
		</div>
	</div>
	<textarea
		class="settings-field"
		rows="2"
		maxlength={MAX_DESCRIPTION_LENGTH}
		placeholder="What does this motion look like?"
		aria-label="Description of {entry.name}"
		value={entry.description}
		onchange={(e) => animationLibraryStore.update(entry.id, { description: e.currentTarget.value })}
	></textarea>
	<div class="anim-foot">
		<span class="setting-desc">Companion can use</span>
		<Switch
			label="Companion can use {entry.name}"
			checked={entry.llmEnabled}
			onchange={(checked) => animationLibraryStore.update(entry.id, { llmEnabled: checked })}
		/>
	</div>
</div>

<style>
	.anim-row { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; min-width: 0; }
	.anim-row:first-child { padding-top: 0; }
	.anim-row:last-child { padding-bottom: 0; }
	:global(.anim-row) + .anim-row { border-top: 1px solid var(--border-subtle); }
	.anim-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
	.anim-name { flex: 1; min-width: 0; max-width: 320px; }
	.duration { font-size: 13px; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
	.anim-actions { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
	.anim-actions :global(.btn) { display: inline-flex; align-items: center; gap: 6px; }
	.anim-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	@media (max-width: 480px) {
		.anim-head { flex-wrap: wrap; }
		.anim-name { flex-basis: 100%; max-width: none; }
	}
</style>
