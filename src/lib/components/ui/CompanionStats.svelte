<script lang="ts">
	import { Popover } from 'bits-ui';
	import Icon from './Icon.svelte';
	import CompanionStateSummary from './CompanionStateSummary.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { displayStore } from '$lib/stores/display.svelte';
	import { photomodeStore } from '$lib/stores/photomode.svelte';
	import { localPath } from '$lib/config/links';
	let { onOpenSettings }: { onOpenSettings?: () => void } = $props();
	let open = $state(false);
	let content = $state<HTMLDivElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let restoreTriggerFocus = false;
	const mood = $derived(characterStore.moodInfo);
	$effect(() => {
		void displayStore.chatDisplayMode;
		void photomodeStore.active;
		open = false;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger bind:ref={trigger} class="companion-stats-trigger" aria-label="Companion stats" title="Companion stats">
		<span class="mood-icon" style:color={mood.color}><Icon name={mood.icon} size={15} /></span>
		<span class="trigger-name">{characterStore.state.name}</span>
		<Icon name={open ? 'chevron-down' : 'chevron-up'} size={12} />
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content class="companion-stats-popover" role="dialog" aria-label="Companion stats"
			side="top" align="start" sideOffset={10} collisionPadding={12} bind:ref={content}
			onEscapeKeydown={() => (restoreTriggerFocus = true)}
			onCloseAutoFocus={(event) => {
				if (restoreTriggerFocus) { event.preventDefault(); trigger?.focus({ preventScroll: true }); restoreTriggerFocus = false; }
			}}
			onOpenAutoFocus={(event) => { event.preventDefault(); content?.focus(); }}>
			<header class="stats-header">
				<div><h3>{characterStore.state.name}</h3><p>Companion state</p></div>
				<Popover.Close class="stats-close" aria-label="Close companion stats"><Icon name="x" size={16} /></Popover.Close>
			</header>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (This region must scroll with a keyboard on short screens.) -->
			<div class="stats-body" tabindex="0" role="region" aria-label="Stats details"><CompanionStateSummary /></div>
			<footer><a href={localPath('app', '/settings/persona?view=state')}
				onclick={(event) => { open = false; if (onOpenSettings) { event.preventDefault(); onOpenSettings(); } }}>
				Character settings <Icon name="arrow-right" size={14} />
			</a></footer>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	:global(.companion-stats-trigger) { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; height: 34px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
	:global(.companion-stats-trigger:hover), :global(.companion-stats-trigger[data-state='open']) { background: var(--bg-secondary); color: var(--text-primary); }
	.trigger-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.mood-icon { display: flex; flex-shrink: 0; }
	:global(.companion-stats-trigger > svg) { flex-shrink: 0; }
	:global(.companion-stats-popover) { z-index: 1300; display: flex; flex-direction: column; width: min(360px, calc(100vw - 24px)); max-height: min(620px, var(--bits-popover-content-available-height)); overflow: hidden; outline: none; }
	.stats-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid var(--border-light); }
	.stats-header > div { min-width: 0; }
	h3 { margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--text-primary); font-size: 15px; font-weight: 500; }
	.stats-header p { margin: 3px 0 0; font-size: 12px; color: var(--text-secondary); }
	:global(.stats-close) { display: grid; place-items: center; flex-shrink: 0; width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; }
	:global(.stats-close:hover) { background: var(--bg-secondary); }
	.stats-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px; }
	.stats-body:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	footer { flex-shrink: 0; border-top: 1px solid var(--border-light); }
	footer a { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; color: var(--text-secondary); text-decoration: none; font-size: 13px; }
	footer a:hover { background: var(--bg-secondary); color: var(--text-primary); }
	@media (pointer: coarse) { :global(.companion-stats-trigger), :global(.stats-close) { min-height: 44px; } :global(.stats-close) { min-width: 44px; } }
</style>
