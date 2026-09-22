<script lang="ts">
	import { onDestroy } from 'svelte';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';

	let { text, label = 'Copy' }: { text: string; label?: string } = $props();
	let status = $state<'idle' | 'copying' | 'copied' | 'error'>('idle');
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	onDestroy(() => {
		disposed = true;
		clearTimeout(resetTimer);
	});

	async function copy() {
		clearTimeout(resetTimer);
		status = 'copying';
		try {
			await navigator.clipboard.writeText(text);
			if (!disposed) status = 'copied';
		} catch {
			if (!disposed) status = 'error';
		}
		if (!disposed && status === 'copied') {
			resetTimer = setTimeout(() => (status = 'idle'), 2000);
		}
	}
</script>

<div class="copy-action">
	<Button
		variant="ghost"
		size="sm"
		onclick={copy}
		disabled={status === 'copying'}
		aria-label={label}
		title={status === 'copied' ? 'Copied' : label}
	>
		<Icon name={status === 'copied' ? 'check' : 'copy'} size={13} />
	</Button>
	<span class:copy-error={status === 'error'} class:sr-only={status !== 'error'} role="status">
		{status === 'error'
			? 'Could not copy. Select the message text to copy it manually.'
			: status === 'copied'
				? 'Copied to clipboard.'
				: ''}
	</span>
</div>

<style>
	.copy-action {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		max-width: 100%;
	}
	.copy-action :global(button) {
		width: 28px;
		height: 28px;
		padding: 0;
		border-radius: var(--control-radius, var(--radius-md));
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.copy-error {
		color: var(--text-secondary);
		font-size: 0.75rem;
		max-width: 28ch;
	}
	@media (pointer: coarse) {
		.copy-action :global(button) {
			min-height: 44px;
			min-width: 44px;
		}
	}
</style>
