<script lang="ts">
	import { Popover } from 'bits-ui';
	import Icon from './Icon.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { photomodeStore } from '$lib/stores/photomode.svelte';
	import { localPath } from '$lib/config/links';

	let open = $state(false);
	let content = $state<HTMLDivElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let restoreTriggerFocus = false;
	const character = $derived(characterStore.state);
	const mood = $derived(characterStore.moodInfo);
	const companionMode = $derived(characterStore.appMode === 'companion');
	const relationship = $derived([
		{ label: 'Affection', value: characterStore.affectionPercent },
		{ label: 'Trust', value: character.trust },
		{ label: 'Intimacy', value: character.intimacy },
		{ label: 'Comfort', value: character.comfort },
		{ label: 'Respect', value: character.respect }
	]);
	const activity = $derived([
		{ label: 'Days together', value: character.daysKnown },
		{ label: 'Interactions', value: character.totalInteractions },
		{ label: 'Day streak', value: character.currentStreak },
		{ label: 'Best streak', value: character.longestStreak }
	]);

	// A portal must not outlive the composer when its layout is hidden.
	$effect(() => {
		void displayStore.chatDisplayMode;
		void photomodeStore.active;
		open = false;
	});
</script>

{#snippet metric(label: string, value: number)}
	<div class="metric">
		<dt>{label}</dt>
		<div class="track" aria-hidden="true">
			<span style:width={`${Math.max(0, Math.min(100, value))}%`}></span>
		</div>
		<dd>{Math.round(value)}%</dd>
	</div>
{/snippet}

<Popover.Root bind:open>
	<Popover.Trigger
		bind:ref={trigger}
		class="companion-stats-trigger"
		aria-label="Companion stats"
		title="Companion stats"
	>
		<span class="mood-icon" style:color={mood.color}><Icon name={mood.icon} size={15} /></span>
		<span class="trigger-name">{character.name}</span>
		<Icon name={open ? 'chevron-down' : 'chevron-up'} size={12} />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			class="companion-stats-popover"
			role="dialog"
			aria-label="Companion stats"
			side="top"
			align="start"
			sideOffset={10}
			collisionPadding={12}
			bind:ref={content}
			onEscapeKeydown={() => (restoreTriggerFocus = true)}
			onCloseAutoFocus={(event) => {
				// Safari does not focus a button on pointer activation.
				if (restoreTriggerFocus) {
					event.preventDefault();
					trigger?.focus({ preventScroll: true });
					restoreTriggerFocus = false;
				}
			}}
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				content?.focus();
			}}
		>
			<header class="stats-header">
				<div>
					<h3>{character.name}</h3>
					<p>{characterStore.stageInfo.name}</p>
				</div>
				<span class="mood-badge"
					><span style:color={mood.color}><Icon name={mood.icon} size={14} /></span
					>{mood.name}</span
				>
			</header>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll this region on short screens.) -->
			<div class="stats-body" tabindex="0" role="region" aria-label="Stats details">
				<section aria-label="Character stats">
					<h4>Character</h4>
					<dl>
						{@render metric('Energy', character.energy)}
						{@render metric('Mood intensity', character.mood.intensity)}
					</dl>
					<p class="mood-description">{mood.description}</p>
				</section>
				{#if !companionMode}
					<section aria-label="Relationship stats">
						<h4>Relationship</h4>
						<dl>
							{#each relationship as stat}{@render metric(stat.label, stat.value)}{/each}
						</dl>
					</section>
				{/if}
				<section aria-label="Activity stats">
					<h4>Activity</h4>
					<dl class="activity">
						{#each activity as stat}<div>
								<dt>{stat.label}</dt>
								<dd>{stat.value.toLocaleString()}</dd>
							</div>{/each}
					</dl>
				</section>
			</div>
			<footer>
				<a href={localPath('app', '/settings/persona')} onclick={() => (open = false)}
					>Character settings <Icon name="arrow-right" size={13} /></a
				>
			</footer>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	:global(.companion-stats-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
		min-width: 0;
		height: 34px;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.8125rem;
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	:global(.companion-stats-trigger:hover),
	:global(.companion-stats-trigger[data-state='open']) {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}
	:global(.companion-stats-trigger:focus-visible),
	.stats-body:focus-visible,
	footer a:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.trigger-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mood-icon {
		display: flex;
		flex-shrink: 0;
	}
	:global(.companion-stats-trigger > svg) {
		flex-shrink: 0;
	}
	:global(.companion-stats-popover) {
		z-index: 80;
		display: flex;
		flex-direction: column;
		width: min(360px, calc(100vw - 24px));
		max-height: min(620px, var(--bits-popover-content-available-height));
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		overflow: hidden;
		outline: none;
		transform-origin: var(--bits-popover-content-transform-origin);
		animation: stats-in 0.18s ease-out;
	}
	.stats-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		border-bottom: 1px solid var(--border-subtle);
	}
	.stats-header > div {
		min-width: 0;
	}
	h3 {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.stats-header p {
		margin: 0.125rem 0 0;
		color: var(--text-tertiary);
		font-size: 0.75rem;
	}
	.mood-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.mood-badge > span {
		display: flex;
	}
	.stats-body {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0 1rem;
	}
	section {
		padding: 0.75rem 0;
	}
	section + section {
		border-top: 1px solid var(--border-subtle);
	}
	h4 {
		margin: 0 0 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-tertiary);
	}
	dl {
		margin: 0;
	}
	.metric {
		display: grid;
		grid-template-columns: 100px minmax(0, 1fr) 36px;
		align-items: center;
		gap: 0.75rem;
		padding: 0.25rem 0;
		font-size: 0.8125rem;
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}
	.metric dd {
		text-align: right;
		font-size: 0.75rem;
	}
	.track {
		height: 4px;
		background: var(--bg-tertiary);
		border-radius: var(--radius-full);
		overflow: hidden;
	}
	.track span {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: inherit;
	}
	.mood-description {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		margin: 0.5rem 0 0;
	}
	.activity {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.875rem 1rem;
	}
	.activity dt {
		font-size: 0.75rem;
	}
	.activity dd {
		font-size: 1rem;
		font-weight: 500;
		margin-top: 0.2rem;
	}
	footer {
		flex-shrink: 0;
		border-top: 1px solid var(--border-subtle);
		padding: 0.5rem;
	}
	footer a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 36px;
		padding: 0.5rem;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		text-decoration: none;
		border-radius: var(--radius-md);
	}
	footer a:hover {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}
	@keyframes stats-in {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@media (pointer: coarse) {
		:global(.companion-stats-trigger),
		footer a {
			min-height: 44px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.companion-stats-popover) {
			animation: none;
		}
		:global(.companion-stats-trigger) {
			transition: none;
		}
	}
</style>
