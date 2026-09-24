<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { GITHUB_RELEASES } from '$lib/config/site';
	import { localPath, sectionUrl } from '$lib/config/links';
</script>

<div class="cards">
	<div class="card">
		<div class="card-icon">
			<Icon name="globe" size={20} />
		</div>
		<h3 class="card-title">Web</h3>
		<p class="card-desc">
			No installation required. Runs entirely in your browser, on desktop and mobile.
		</p>
		<div class="card-actions">
			<a href={sectionUrl('app')} class="btn btn-primary btn-sm">
				<span>Open App</span>
				<Icon name="arrow-right" size={14} />
			</a>
			<a href={localPath('docs', '/guides/web-guide')} class="btn btn-ghost btn-sm">How to use?</a>
		</div>
	</div>

	<div class="card">
		<div class="card-icon">
			<Icon name="monitor" size={20} />
		</div>
		<h3 class="card-title">Desktop</h3>
		<p class="card-desc">
			Desktop app with transparent overlay mode for macOS, Windows, and Linux.
		</p>
		<div class="card-actions">
			<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">
				<span>Download</span>
				<Icon name="download" size={14} />
			</a>
			<a href={localPath('docs', '/guides/desktop-guide')} class="btn btn-ghost btn-sm">Setup guide</a>
		</div>
	</div>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border-radius: var(--radius-lg);
		background: var(--bg-primary);
	}

	.card-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		margin-bottom: 4px;
		border-radius: var(--control-radius);
		background: var(--control-bg);
		color: var(--text-primary);
	}

	.card-title {
		margin: 0;
		color: var(--text-primary);
		font-size: 16px;
		font-weight: 600;
		line-height: 24px;
		letter-spacing: normal;
	}

	.card-desc {
		flex: 1;
		margin: 0;
		color: var(--text-secondary);
		font-size: 14px;
		line-height: 20px;
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	@media (max-width: 640px) {
		.cards {
			grid-template-columns: 1fr;
		}
	}
</style>
