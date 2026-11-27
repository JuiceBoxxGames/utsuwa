<script lang="ts" module>
	export interface Pillar {
		id: string;
		label: string;
		note: string;
		title: string;
		body: string;
		image: string;
		alt: string;
		/** Cutouts sit on the panel fill; screenshots fill the frame. */
		fit: 'cutout' | 'cover';
	}
</script>

<script lang="ts">
	// Numbered tabs on the left, one large panel on the right. Arrow keys move
	// between tabs (roving tabindex). Phones stack every pillar instead.
	let { pillars, label }: { pillars: Pillar[]; label: string } = $props();

	let active = $state(0);
	const tabs = $state<HTMLButtonElement[]>([]);

	function onKey(event: KeyboardEvent, index: number) {
		const last = pillars.length - 1;
		const next =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? index === last ? 0 : index + 1
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? index === 0 ? last : index - 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? last
							: -1;
		if (next < 0) return;
		event.preventDefault();
		active = next;
		tabs[next]?.focus();
	}
</script>

<div class="pillars">
	<div class="tablist" role="tablist" aria-label={label} aria-orientation="vertical">
		{#each pillars as pillar, i (pillar.id)}
			<button
				bind:this={tabs[i]}
				type="button"
				role="tab"
				id="pillar-tab-{pillar.id}"
				aria-selected={active === i}
				aria-controls="pillar-panel-{pillar.id}"
				tabindex={active === i ? 0 : -1}
				class="tab"
				onclick={() => (active = i)}
				onkeydown={(e) => onKey(e, i)}
			>
				<span class="tab-no">{String(i + 1).padStart(2, '0')}</span>
				<span>{pillar.label}</span>
			</button>
		{/each}
	</div>

	{#each pillars as pillar, i (pillar.id)}
		<div
			class="panel site-panel"
			class:is-active={active === i}
			role="tabpanel"
			id="pillar-panel-{pillar.id}"
			aria-labelledby="pillar-tab-{pillar.id}"
		>
			<div class="panel-copy">
				<p class="site-eyebrow">{pillar.note}</p>
				<h3 class="panel-title">{pillar.title}</h3>
				<p class="panel-body">{pillar.body}</p>
			</div>
			<div class="panel-media" class:cover={pillar.fit === 'cover'}>
				<img src={pillar.image} alt={pillar.alt} loading="lazy" />
			</div>
		</div>
	{/each}
</div>

<style>
	.pillars {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 32px;
		align-items: start;
	}

	.tablist {
		display: flex;
		flex-direction: column;
		gap: 6px;
		position: sticky;
		top: 88px;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		padding: 0 14px;
		border: none;
		border-radius: 12px;
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: 15px;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.tab:hover {
		color: var(--text-primary);
	}

	.tab[aria-selected='true'] {
		background: var(--bg-primary);
		color: var(--text-primary);
	}

	.tab-no {
		display: inline-grid;
		place-items: center;
		min-width: 26px;
		height: 22px;
		border-radius: 6px;
		background: var(--control-bg);
		color: var(--text-secondary);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}

	.tab[aria-selected='true'] .tab-no {
		background: var(--accent);
		color: var(--accent-contrast);
	}

	.panel {
		grid-column: 2;
		grid-row: 1;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		min-height: 520px;
		visibility: hidden;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.panel.is-active {
		visibility: visible;
		opacity: 1;
	}

	.panel-copy {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 12px;
		padding: clamp(28px, 4vw, 48px);
	}

	.panel-title {
		margin: 0;
		font-size: clamp(24px, 2.4vw, 32px);
		font-weight: 500;
		letter-spacing: -0.015em;
		line-height: 1.15;
		text-wrap: balance;
	}

	.panel-body {
		margin: 0;
		color: var(--text-secondary);
		font-size: 16px;
		line-height: 1.55;
	}

	.panel-media {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		min-height: 0;
		padding-top: 32px;
		overflow: hidden;
		background: var(--bg-secondary);
	}

	.panel-media img {
		max-width: 100%;
		max-height: 500px;
		object-fit: contain;
	}

	.panel-media.cover {
		padding: 0;
	}

	.panel-media.cover img {
		width: 100%;
		height: 100%;
		max-height: none;
		object-fit: cover;
		object-position: center top;
	}

	@media (max-width: 900px) {
		.pillars {
			grid-template-columns: 1fr;
			gap: 16px;
		}

		.tablist {
			display: none;
		}

		/* Phones read the pillars as a stack, so the tabs are not needed */
		.panel {
			grid-column: 1;
			grid-row: auto;
			grid-template-columns: 1fr;
			min-height: 0;
			visibility: visible;
			opacity: 1;
		}

		.panel-media {
			height: 340px;
		}

		.panel-media img {
			max-height: 100%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel {
			transition: none;
		}
	}
</style>
