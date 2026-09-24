<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { GITHUB_RELEASES } from '$lib/config/site';
	import { localPath, sectionUrl } from '$lib/config/links';
</script>

<div class="cards">
	<div class="card">
		<div class="card-icon">
			<Icon name="globe" size={32} />
		</div>
		<h3 class="card-title">Web</h3>
		<p class="card-desc">
			No installation required. Runs entirely in your browser, on desktop and mobile.
		</p>
		<div class="card-actions">
			<a href={sectionUrl('app')} class="card-btn primary">
				<span>Open App</span>
				<Icon name="arrow-right" size={14} />
			</a>
			<a href={localPath('docs', '/guides/web-guide')} class="card-link">How to use?</a>
		</div>
	</div>

	<div class="card">
		<div class="card-icon">
			<Icon name="monitor" size={32} />
		</div>
		<h3 class="card-title">Desktop</h3>
		<p class="card-desc">
			Desktop app with transparent overlay mode for macOS, Windows, and Linux.
		</p>
		<div class="card-actions">
			<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer" class="card-btn primary">
				<span>Download</span>
				<Icon name="download" size={14} />
			</a>
			<a href={localPath('docs', '/guides/desktop-guide')} class="card-link">Setup guide</a>
		</div>
	</div>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
		margin: 2rem 0;
	}

	.card {
		border: none;
		border-radius: var(--radius-xl);
		padding: 1.75rem;
		background: var(--bg-tertiary);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition:
			transform 0.3s cubic-bezier(0.16, 1, 0.3, 1),
			box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow: var(--shadow-sm);
	}

	.card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-lg);
	}

	.card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 0.875rem;
		background: var(--accent-subtle);
		color: var(--accent);
		margin-bottom: 0.25rem;
	}

	.card-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--docs-text);
		margin: 0;
	}

	.card-desc {
		font-size: 0.875rem;
		color: var(--docs-text-muted);
		line-height: 1.6;
		margin: 0;
		flex: 1;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.75rem;
	}

	.card-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.625rem 1.25rem;
		border-radius: var(--radius-full);
		font-size: 0.8125rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			background 0.2s ease,
			transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
			box-shadow 0.2s ease;
	}

	.card-btn.primary {
		background: var(--accent);
		color: #fff;
		border: 1px solid transparent;
		box-shadow: var(--shadow-sm);
	}

	.card-btn.primary:hover {
		background: var(--accent-hover);
		transform: translateY(-1px);
		box-shadow: var(--shadow-md);
	}

	.card-btn.primary:active {
		transform: translateY(0) scale(0.98);
	}

	.card-link {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		text-decoration: none;
		transition: color 0.15s ease;
		padding: 0.25rem 0;
	}

	.card-link:hover {
		color: var(--text-primary);
	}

	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
