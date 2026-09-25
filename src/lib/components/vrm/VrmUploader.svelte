<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { isTauri } from '$lib/services/platform/platform';

	interface Props {
		onUpload: (file: File) => void | Promise<void>;
	}

	let { onUpload }: Props = $props();
	let isDragging = $state(false);
	let uploadError = $state('');

	async function upload(file: File) {
		uploadError = '';
		try {
			await onUpload(file);
		} catch (e) {
			uploadError = e instanceof Error ? e.message : "Couldn't add that model.";
		}
	}
	let fileInput: HTMLInputElement;

	// Tauri's webview intercepts native drag-and-drop, so dataTransfer.files
	// is empty. Use Tauri's own drag-drop event + fs plugin to read the file.
	$effect(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let unlisten: (() => void) | undefined;

		(async () => {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			if (cancelled) return;

			unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
				if (event.payload.type === 'over') {
					isDragging = true;
				} else if (event.payload.type === 'leave') {
					isDragging = false;
				} else if (event.payload.type === 'drop') {
					isDragging = false;
					const vrmPath = event.payload.paths.find((p) => /\.vrm$/i.test(p));
					if (!vrmPath) return;

					const { readFile } = await import('@tauri-apps/plugin-fs');
					const contents = await readFile(vrmPath);
					const fileName = vrmPath.split(/[/\\]/).pop() || 'model.vrm';
					const file = new File([contents], fileName, { type: 'application/octet-stream' });
					void upload(file);
				}
			});
		})();

		return () => {
			cancelled = true;
			unlisten?.();
		};
	});

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;

		const file = e.dataTransfer?.files[0];
		if (file && /\.vrm$/i.test(file.name)) {
			void upload(file);
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file && /\.vrm$/i.test(file.name)) {
			void upload(file);
		}
		// Reset input
		input.value = '';
	}

	function handleClick() {
		fileInput?.click();
	}
</script>

<div
	class="uploader"
	class:dragging={isDragging}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
	<input
		type="file"
		accept=".vrm"
		bind:this={fileInput}
		onchange={handleFileSelect}
		style="display: none;"
	/>

	<div class="icon">
		<Icon name="upload" size={32} strokeWidth={1.5} />
	</div>
	<span class="label">Upload VRM</span>
	{#if uploadError}
		<span class="hint error" role="alert">{uploadError}</span>
	{:else}
		<span class="hint">Drag & drop or click to browse</span>
	{/if}
</div>

<style>
	.uploader {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		aspect-ratio: 1;
		background: var(--bg-secondary);
		border: 1px dashed var(--border-light);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
	}

	.uploader:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
	}

	.uploader.dragging {
		border-color: var(--accent);
		background: var(--accent-subtle);
		box-shadow: none;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 56px;
		height: 56px;
		background: var(--bg-tertiary);
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		transition: background 0.15s, color 0.15s;
	}

	.uploader:hover .icon,
	.uploader.dragging .icon {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.hint {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		transition: color 0.15s;
	}

	.hint.error {
		color: var(--color-error);
		text-align: center;
	}

	.uploader:hover .hint:not(.error),
	.uploader.dragging .hint:not(.error) {
		color: var(--accent-text);
	}
</style>
