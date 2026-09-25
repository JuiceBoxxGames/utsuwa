<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui';
	import { mcpStore } from '$lib/stores/mcp.svelte';

	const request = $derived(mcpStore.pendingConfirmation);
	const argsText = $derived(request ? JSON.stringify(request.args, null, 2) : '');
</script>

<!-- Escape and outside clicks count as Skip. -->
<Dialog.Root open={request !== null} onOpenChange={(open) => { if (!open) mcpStore.answerConfirmation(false); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="mcp-confirm ui-dialog">
		{#if request}
			<Dialog.Title class="mcp-confirm-title">Run {request.toolName}?</Dialog.Title>
			<Dialog.Description class="mcp-confirm-desc">
				Your companion wants to run a tool from <strong>{request.serverName}</strong> with these
				arguments.
			</Dialog.Description>
			<pre class="mcp-confirm-args">{argsText}</pre>
			<div class="mcp-confirm-actions">
				<Button variant="secondary" onclick={() => mcpStore.answerConfirmation(false)}>Skip</Button>
				<Button onclick={() => mcpStore.answerConfirmation(true)}>Run</Button>
			</div>
		{/if}
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>
	.mcp-confirm {
		--dialog-width: 420px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mcp-confirm :global(.mcp-confirm-title) {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-primary);
		overflow-wrap: anywhere;
	}

	.mcp-confirm :global(.mcp-confirm-desc) {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.mcp-confirm-args {
		margin: 0;
		max-height: 40vh;
		overflow: auto;
		padding: 0.75rem;
		border-radius: var(--radius-md);
		background: var(--bg-tertiary);
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--text-primary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.mcp-confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
