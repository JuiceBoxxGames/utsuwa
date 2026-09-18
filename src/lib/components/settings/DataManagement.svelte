<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import Button from '$lib/components/ui/Button.svelte';
	import { pop, slideOpen } from '$lib/utils/motion';
	import {
		exportSave,
		importSave,
		validateSaveFile,
		getSaveFilePreview,
		downloadSaveFile,
		clearAllData,
		type SaveFile,
		type SaveFilePreview,
		type LegacySaveFile
	} from '$lib/db/export';

	let isExporting = $state(false);
	let isImporting = $state(false);
	let isClearing = $state(false);
	let showClearConfirm = $state(false);

	let importFile = $state<File | null>(null);
	let importPreview = $state<SaveFilePreview | null>(null);
	let importMode = $state<'merge' | 'replace'>('replace');
	let importError = $state<string | null>(null);
	let importSuccess = $state<{ imported: number; skipped: number } | null>(null);
	let exportMessage = $state<{ kind: 'success' | 'error'; text: string } | null>(null);

	let fileInput: HTMLInputElement;

	async function handleExport() {
		isExporting = true;
		exportMessage = null;
		try {
			const saveFile = await exportSave();
			const { filename, savedToDownloads } = await downloadSaveFile(saveFile);
			// The browser shows its own download UI; the desktop app writes silently,
			// so tell the user where the file went.
			if (savedToDownloads) {
				exportMessage = { kind: 'success', text: `Saved to your Downloads folder as ${filename}` };
			}
		} catch (e) {
			console.error('Export failed:', e);
			exportMessage = { kind: 'error', text: `Export failed: ${e instanceof Error ? e.message : String(e)}` };
		} finally {
			isExporting = false;
		}
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (!file) return;

		importFile = file;
		importError = null;
		importSuccess = null;
		importPreview = null;

		const reader = new FileReader();
		reader.onload = (e) => {
			try {
				const json = JSON.parse(e.target?.result as string);
				const validated = validateSaveFile(json);

				if (!validated) {
					importError = 'Invalid save file format';
					importFile = null;
					return;
				}

				importPreview = getSaveFilePreview(validated);
			} catch {
				importError = 'Failed to parse JSON file';
				importFile = null;
			}
		};
		reader.readAsText(file);
	}

	async function handleImport() {
		if (!importFile || !importPreview) return;

		isImporting = true;
		importError = null;

		try {
			const reader = new FileReader();
			const saveFile = await new Promise<SaveFile | LegacySaveFile>((resolve, reject) => {
				reader.onload = (e) => {
					try {
						const json = JSON.parse(e.target?.result as string);
						const validated = validateSaveFile(json);
						if (!validated) reject(new Error('Invalid save file'));
						else resolve(validated);
					} catch {
						reject(new Error('Failed to parse file'));
					}
				};
				reader.onerror = () => reject(new Error('Failed to read file'));
				reader.readAsText(importFile!);
			});

			const result = await importSave(saveFile, importMode);
			importSuccess = result;
			importFile = null;
			importPreview = null;

			// Refresh the page after a short delay to reload stores
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (e) {
			importError = e instanceof Error ? e.message : 'Import failed';
		} finally {
			isImporting = false;
		}
	}

	function cancelImport() {
		importFile = null;
		importPreview = null;
		importError = null;
		importSuccess = null;
		if (fileInput) fileInput.value = '';
	}

	async function handleClear() {
		if (!showClearConfirm) {
			showClearConfirm = true;
			return;
		}

		isClearing = true;
		try {
			await clearAllData();
			showClearConfirm = false;
			// Refresh to reset stores
			setTimeout(() => {
				window.location.reload();
			}, 500);
		} catch (e) {
			console.error('Clear failed:', e);
		} finally {
			isClearing = false;
		}
	}

	function formatDate(date: Date): string {
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div class="data-management">
	<h2 class="section-title">Data Management</h2>
	<p class="section-description">
		Export your data as a save file or import a previous save. All data is stored locally in your
		browser.
	</p>

	<div class="actions">
		<!-- Export -->
		<div class="action-card">
			<div class="action-header">
				<Icon name="download" size={20} />
				<h3>Export Save</h3>
			</div>
			<p class="action-description">
				Download all your data as a JSON file. Includes character states, memories, conversation
				history, and milestones.
			</p>
			<Button onclick={handleExport} disabled={isExporting}>
				{#snippet children()}
					{#if isExporting}
						Exporting...
					{:else}
						<Icon name="download" size={16} />
						Download Save File
					{/if}
				{/snippet}
			</Button>
			{#if exportMessage}
				<div
					class={exportMessage.kind === 'error' ? 'error-message' : 'success-message'}
					transition:pop={{ duration: 200, y: 6 }}
				>
					<Icon name={exportMessage.kind === 'error' ? 'alert' : 'check-circle'} size={16} />
					<span>{exportMessage.text}</span>
				</div>
			{/if}
		</div>

		<!-- Import -->
		<div class="action-card">
			<div class="action-header">
				<Icon name="upload" size={20} />
				<h3>Import Save</h3>
			</div>
			<p class="action-description">Restore data from a previously exported save file.</p>

			<input
				type="file"
				accept=".json"
				onchange={handleFileSelect}
				bind:this={fileInput}
				class="file-input"
			/>

			{#if importError}
				<div class="error-message" transition:pop={{ duration: 200, y: 6 }}>
					<Icon name="warning" size={16} />
					{importError}
				</div>
			{/if}

			{#if importSuccess}
				<div class="success-message" transition:pop={{ duration: 200, y: 6 }}>
					<Icon name="check" size={16} />
					Imported {importSuccess.imported} records
					{#if importSuccess.skipped > 0}
						(skipped {importSuccess.skipped})
					{/if}
					- Reloading...
				</div>
			{/if}

			{#if importPreview && !importSuccess}
				<div class="import-preview" transition:slideOpen>
					<div class="preview-header">
						<Icon name="file" size={16} />
						<span>Save File Preview</span>
					</div>
					<div class="preview-details">
						<div class="preview-row">
							<span class="label">Exported:</span>
							<span class="value">{formatDate(importPreview.exportedAt)}</span>
						</div>
						<div class="preview-row">
							<span class="label">Character:</span>
							<span class="value">{importPreview.characterName || 'Unknown'}</span>
						</div>
						<div class="preview-row">
							<span class="label">Records:</span>
							<span class="value">
								{importPreview.counts.facts} facts, {importPreview.counts.conversationTurns} messages
							</span>
						</div>
					</div>

					<div class="import-mode">
						<label class="mode-option">
							<input type="radio" bind:group={importMode} value="replace" />
							<span class="mode-label">Replace</span>
							<span class="mode-description">Clear existing data and import</span>
						</label>
						<label class="mode-option">
							<input type="radio" bind:group={importMode} value="merge" />
							<span class="mode-label">Merge</span>
							<span class="mode-description">Add to existing data (skip duplicates)</span>
						</label>
					</div>

					<div class="import-actions">
						<Button variant="secondary" onclick={cancelImport}>
							{#snippet children()}Cancel{/snippet}
						</Button>
						<Button onclick={handleImport} disabled={isImporting}>
							{#snippet children()}
								{#if isImporting}
									Importing...
								{:else}
									<Icon name="upload" size={16} />
									Import
								{/if}
							{/snippet}
						</Button>
					</div>
				</div>
			{/if}
		</div>

		<!-- Clear Data -->
		<div class="action-card danger">
			<div class="action-header">
				<Icon name="trash" size={20} />
				<h3>Clear All Data</h3>
			</div>
			<p class="action-description">
				Permanently delete all saved data. This cannot be undone. Consider exporting first.
			</p>

			{#if showClearConfirm}
				<div class="confirm-message" transition:pop={{ duration: 200, y: 6 }}>
					<Icon name="warning" size={16} />
					Are you sure? This will delete all your data permanently.
				</div>
				<div class="confirm-actions">
					<Button variant="secondary" onclick={() => (showClearConfirm = false)}>
						{#snippet children()}Cancel{/snippet}
					</Button>
					<Button variant="danger" onclick={handleClear} disabled={isClearing}>
						{#snippet children()}
							{#if isClearing}
								Clearing...
							{:else}
								Yes, Delete Everything
							{/if}
						{/snippet}
					</Button>
				</div>
			{:else}
				<Button variant="danger" onclick={handleClear}>
					{#snippet children()}
						<Icon name="trash" size={16} />
						Clear All Data
					{/snippet}
				</Button>
			{/if}
		</div>
	</div>
</div>

<style>
	.data-management {
		padding: 0;
	}

	.section-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 0.25rem;
	}

	.section-description {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: 0 0 1.5rem;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.action-card {
		background: var(--bg-primary);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		box-shadow: var(--shadow-sm);
		transition: box-shadow 0.15s ease, border-color 0.15s ease;
	}

	.action-card:hover {
		box-shadow: var(--shadow-md);
	}

	.action-card.danger {
		background: color-mix(in srgb, var(--color-error) 5%, var(--bg-primary));
	}

	.action-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		color: var(--accent);
	}

	.action-card.danger .action-header {
		color: var(--color-error);
	}

	.action-header h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0;
		color: var(--text-primary);
	}

	.action-description {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 1rem;
	}

	.file-input {
		display: block;
		width: 100%;
		padding: 0.875rem 1rem;
		font-size: 0.875rem;
		border: 1.5px dashed var(--border-light);
		border-radius: var(--radius-md);
		background: var(--bg-secondary);
		color: var(--text-secondary);
		cursor: pointer;
		margin-bottom: 1rem;
		transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
	}

	.file-input:hover {
		border-color: var(--accent);
		background: var(--accent-subtle);
		color: var(--text-primary);
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		background: color-mix(in srgb, var(--color-error) 10%, transparent);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.error-message :global(svg) {
		color: var(--color-error);
		flex-shrink: 0;
	}

	.success-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		background: color-mix(in srgb, var(--color-success) 10%, transparent);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.success-message :global(svg) {
		color: var(--color-success);
		flex-shrink: 0;
	}

	.import-preview {
		background: var(--bg-secondary);
		border-radius: var(--radius-md);
		padding: 1rem;
		margin-bottom: 1rem;
	}

	.preview-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		color: var(--accent);
		margin-bottom: 0.75rem;
	}

	.preview-details {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.preview-row {
		display: flex;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.preview-row .label {
		color: var(--text-tertiary);
		min-width: 80px;
	}

	.preview-row .value {
		color: var(--text-secondary);
	}

	.import-mode {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.mode-option {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		gap: 0.25rem 0.75rem;
		cursor: pointer;
		padding: 0.75rem;
		background: var(--bg-primary);
		border-radius: var(--radius-md);
		transition: background 0.15s ease, border-color 0.15s ease;
	}

	.mode-option:hover {
		background: color-mix(in srgb, var(--bg-primary), var(--text-primary) 4%);
	}

	.mode-option:has(input:checked) {
		background: var(--accent-muted);
	}

	.mode-option input {
		grid-row: span 2;
		margin: 0;
		margin-top: 0.25rem;
		accent-color: var(--accent);
	}

	.mode-label {
		font-weight: 500;
		color: var(--text-primary);
	}

	.mode-description {
		font-size: 0.8rem;
		color: var(--text-tertiary);
	}

	.import-actions {
		flex-wrap: wrap;
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.confirm-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		background: color-mix(in srgb, var(--color-warning) 12%, transparent);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.confirm-message :global(svg) {
		color: var(--color-warning);
		flex-shrink: 0;
	}

	.confirm-actions {
		flex-wrap: wrap;
		display: flex;
		gap: 0.75rem;
	}

	@media (max-width: 640px) { .action-card { padding: 1rem; } }
</style>
