<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { onMount } from 'svelte';
	import { Dialog } from 'bits-ui';
	import { DOCS_URL } from '$lib/config/site';
	import { isTauri } from '$lib/services/platform/platform';
	import { updaterStore } from '$lib/stores/updater.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	const version = `v${import.meta.env.VITE_APP_VERSION}`;

	const updateStatusText = $derived.by(() => {
		switch (updaterStore.status) {
			case 'checking':
				return 'Checking for updates…';
			case 'uptodate':
				return "You're on the latest version";
			case 'available':
				return `Update available: Utsuwa ${updaterStore.availableVersion}`;
			case 'downloading':
				return `Downloading… ${updaterStore.progress}%`;
			case 'ready':
				return 'Update installed. Restarting…';
			case 'error':
				return updaterStore.errorMessage ?? 'Update check failed';
			default:
				return '';
		}
	});

	const updateBusy = $derived(
		updaterStore.status === 'checking' || updaterStore.status === 'downloading'
	);

	// System info
	let sttSupport = $state('Checking...');
	let webglSupport = $state('Checking...');
	let storageStatus = $state('Checking...');

	onMount(() => {
		const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		sttSupport = SpeechRecognition ? 'Supported' : 'Unsupported';

		try {
			const canvas = document.createElement('canvas');
			const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
			webglSupport = gl ? 'Supported' : 'Unsupported';
		} catch {
			webglSupport = 'Unsupported';
		}

		storageStatus = 'indexedDB' in window ? 'Available' : 'Unavailable';
	});

	// Always open the docs subdomain; on desktop route it to the system browser.
	function handleDocsClick(e: MouseEvent) {
		if (isTauri()) {
			e.preventDefault();
			import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(DOCS_URL));
		}
	}
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="modal-container ui-dialog">
  <Dialog.Title class="sr-only">About Utsuwa</Dialog.Title>
  <Dialog.Description class="sr-only">App information, documentation, and device support.</Dialog.Description>
		<button class="close-btn btn btn-ghost btn-icon" onclick={onClose} aria-label="Close">
			<Icon name="x" size={16} />
		</button>

		<!-- Hero -->
		<div class="hero">
			<span class="app-logo" role="img" aria-label="Utsuwa"></span>
			<p id="modal-title" class="tagline">Open-source AI companion</p>
			<div class="hero-meta">
				<span class="ui-badge">{version}</span>
				{#if isTauri()}
					<button
						class="btn btn-ghost btn-sm"
						onclick={() =>
							updaterStore.status === 'available' ? updaterStore.install() : updaterStore.check()}
						disabled={updateBusy}
					>
						<Icon name={updaterStore.status === 'available' ? 'download' : 'refresh-cw'} size={12} />
						<span>{updaterStore.status === 'available' ? 'Install & restart' : 'Check for updates'}</span>
					</button>
				{/if}
			</div>
			{#if isTauri() && updateStatusText}
				<span class="update-status">{updateStatusText}</span>
			{/if}
		</div>

		<!-- Links -->
		<nav class="link-list">
			<a
				href="https://github.com/JuiceBoxxGames/utsuwa"
				target="_blank"
				rel="noopener"
				class="link-row"
			>
				<span class="row-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
						<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
					</svg>
				</span>
				<span class="row-label">GitHub</span>
				<span class="row-ext"><Icon name="external-link" size={14} /></span>
			</a>
			<a
				href={DOCS_URL}
				target="_blank"
				rel="noopener"
				onclick={handleDocsClick}
				class="link-row"
			>
				<span class="row-icon"><Icon name="file-text" size={18} /></span>
				<span class="row-label">Documentation</span>
				<span class="row-ext"><Icon name="external-link" size={14} /></span>
			</a>
		</nav>

		<!-- System -->
		<p class="sys-label">System</p>
		<div class="sys-list">
			<div class="sys-row">
				<span class="sys-name">Speech recognition</span>
				<span class="sys-val" class:ok={sttSupport === 'Supported'} class:bad={sttSupport === 'Unsupported'}>
					<span class="dot"></span>{sttSupport}
				</span>
			</div>
			<div class="sys-row">
				<span class="sys-name">3D graphics</span>
				<span class="sys-val" class:ok={webglSupport === 'Supported'} class:bad={webglSupport === 'Unsupported'}>
					<span class="dot"></span>{webglSupport}
				</span>
			</div>
			<div class="sys-row">
				<span class="sys-name">Local storage</span>
				<span class="sys-val" class:ok={storageStatus === 'Available'} class:bad={storageStatus === 'Unavailable'}>
					<span class="dot"></span>{storageStatus}
				</span>
			</div>
		</div>
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>

	.modal-container { --dialog-width: 340px; padding: 1.5rem; }

	.close-btn { position: absolute; top: 12px; right: 12px; }

	/* Hero */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
		padding: 0.75rem 0 1.25rem;
	}

	.app-logo {
		display: block;
		height: 30px;
		aspect-ratio: 1530 / 257;
		background-color: var(--text-primary);
		-webkit-mask: url('/brand-assets/logo.svg') no-repeat center / contain;
		mask: url('/brand-assets/logo.svg') no-repeat center / contain;
	}

	.tagline {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.hero-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		justify-content: center;
	}




	.update-status {
		font-size: 0.7rem;
		color: var(--text-tertiary);
	}

	/* Link rows */
	.link-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.link-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.75rem;
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--text-primary);
		transition: background 0.15s ease;
	}

	.link-row:hover {
		background: var(--bg-secondary);
	}

	.row-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
		flex-shrink: 0;
	}

	.row-label {
		flex: 1;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.row-ext {
		display: flex;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	/* System list */
	.sys-label {
		margin: 1.25rem 0 0.25rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-tertiary);
	}

	.sys-list {
		display: flex;
		flex-direction: column;
	}

	.sys-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.75rem;
		font-size: 0.85rem;
	}

	.sys-row + .sys-row {
		border-top: 1px solid var(--border-subtle);
	}

	.sys-name {
		color: var(--text-secondary);
	}

	.sys-val {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.sys-val .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-tertiary);
		transition: background 0.25s ease;
	}

	.sys-val.ok .dot {
		background: var(--color-success);
	}

	.sys-val.bad .dot {
		background: var(--color-error);
	}
</style>
