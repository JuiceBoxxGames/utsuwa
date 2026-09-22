<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from '$lib/components/ui';
	import { pop, fadeFast } from '$lib/utils/motion';
	import { isTauri } from '$lib/services/platform/platform';
	import { updaterStore } from '$lib/stores/updater.svelte';

	// Quiet check on launch — only surfaces if an update is actually waiting.
	onMount(() => {
		if (isTauri()) updaterStore.check({ silent: true });
	});

	const status = $derived(updaterStore.status);

	const visible = $derived(
		isTauri() &&
			!updaterStore.dismissed &&
			(status === 'available' ||
				status === 'downloading' ||
				status === 'ready' ||
				(status === 'error' && !!updaterStore.availableVersion))
	);
</script>

{#if visible}
	<div
		class="update-banner"
		transition:pop={{ base: 'translateX(-50%)', y: -14, duration: 260 }}
		role="status"
		aria-live="polite"
	>
		<div class="banner-icon">
			{#key status}
				<span class="banner-swap" in:fadeFast={{ duration: 200 }}>
					{#if status === 'error'}
						<Icon name="x" size={18} />
					{:else if status === 'ready'}
						<Icon name="check" size={18} />
					{:else}
						<Icon name="download" size={18} />
					{/if}
				</span>
			{/key}
		</div>

		<div class="banner-body">
			{#key status}
				<div class="banner-body-inner" in:fadeFast={{ duration: 200 }}>
					{#if status === 'available'}
						<span class="banner-title">Update available</span>
						<span class="banner-sub">Utsuwa {updaterStore.availableVersion} is ready to install</span>
					{:else if status === 'downloading'}
						<span class="banner-title">Downloading update…</span>
						<div class="progress-track">
							<div class="progress-fill" style="width: {updaterStore.progress}%"></div>
						</div>
					{:else if status === 'ready'}
						<span class="banner-title">Update installed</span>
						<span class="banner-sub">Restarting…</span>
					{:else if status === 'error'}
						<span class="banner-title">Update failed</span>
						<span class="banner-sub">{updaterStore.errorMessage ?? 'Please try again later.'}</span>
					{/if}
				</div>
			{/key}
		</div>

		{#if status === 'available'}
			<div class="banner-actions">
				<button class="btn btn-ghost" onclick={() => updaterStore.dismiss()}>Later</button>
				<button class="btn btn-primary" onclick={() => updaterStore.install()}>
					<span>Install &amp; Restart</span>
				</button>
			</div>
		{:else if status === 'error'}
			<div class="banner-actions">
				<button class="btn btn-ghost" onclick={() => updaterStore.dismiss()}>Dismiss</button>
				<button class="btn btn-primary" onclick={() => updaterStore.install()}>
					<span>Retry</span>
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.update-banner {
		position: fixed;
		top: calc(1.25rem + env(safe-area-inset-top, 0));
		left: 50%;
		transform: translateX(-50%);
		z-index: 900;
		display: flex;
		align-items: center;
		gap: 0.875rem;
		max-width: min(540px, calc(100vw - 2rem));
		padding: 0.875rem 1rem;
		border-radius: var(--radius-lg);
		background: var(--bg-primary);
		border: 1px solid var(--border-light);
		box-shadow: var(--shadow-lg);
	}

	.banner-swap {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.banner-body-inner {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.banner-icon {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 38px;
		height: 38px;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		background: var(--bg-secondary);
	}

	.banner-body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		flex: 1;
	}

	.banner-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.banner-sub {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-track {
		margin-top: 0.35rem;
		width: 200px;
		max-width: 100%;
		height: 6px;
		border-radius: var(--radius-full);
		background: var(--bg-tertiary);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: var(--radius-full);
		background: var(--accent);
		transition: width 0.2s ease-out;
	}

	.banner-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	@media (max-width: 520px) {
		.update-banner {
			flex-wrap: wrap;
			max-width: calc(100vw - 1.5rem);
		}

		.banner-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
