<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { Dialog } from 'bits-ui';

	interface Props {
		onclose: () => void;
	}

	let { onclose }: Props = $props();
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onclose(); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="ar-modal ui-dialog">
  <Dialog.Title class="sr-only">AR mode requirements</Dialog.Title>
  <Dialog.Description class="sr-only">Devices and browsers that support augmented reality.</Dialog.Description>
		<button class="ar-close btn btn-ghost btn-icon" onclick={onclose} aria-label="Close">
			<Icon name="x" size={14} />
		</button>

		<div class="ar-icon-wrap">

			<div class="ar-icon">
				<Icon name="headset" size={34} />
			</div>
		</div>

		<h2>See her in your space</h2>
		<p>
			AR mode puts your companion right on your floor: walk around her, move her wherever you
			like, and resize her with a pinch. It just needs a browser that speaks WebXR.
		</p>

		<div class="ar-devices">
			<div class="ar-device">
				<span class="ar-device-name">Android phone or tablet</span>
				<span class="ar-device-via">Chrome</span>
			</div>
			<div class="ar-device">
				<span class="ar-device-name">Meta Quest</span>
				<span class="ar-device-via">Headset browser</span>
			</div>
		</div>

		<p class="ar-footnote">
			iPhones don't support WebXR yet: open this page on one of the devices above and the AR
			button lights up automatically.
		</p>

		<button class="btn btn-primary" onclick={onclose}>Got it</button>
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>

	.ar-modal {
		--dialog-width: 380px;
		padding: 2.25rem 1.75rem 1.75rem;
		text-align: center;
	}

	.ar-close { position: absolute; top: 12px; right: 12px; }

	.ar-icon-wrap {
		position: relative;
		display: inline-flex;
		margin-bottom: 1.25rem;
	}

	.ar-icon {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		border-radius: var(--radius-full);
		background: var(--accent);
		color: var(--accent-contrast);
	}


	.ar-modal h2 {
		margin: 0 0 0.625rem;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.ar-modal p {
		margin: 0 0 1.25rem;
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	.ar-devices {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.ar-device {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius-md);
		background: var(--bg-tertiary);
	}

	.ar-device-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.ar-device-via {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.ar-footnote {
		font-size: 0.75rem !important;
		color: var(--text-tertiary) !important;
	}

</style>
