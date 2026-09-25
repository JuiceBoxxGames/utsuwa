<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { page as routePage } from '$app/state';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { getCompletedEvents } from '$lib/services/storage/events';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { createPersonaPageState } from './persona-page.svelte';
	import AvatarGallery from './AvatarGallery.svelte';
	import StatsPanel from './StatsPanel.svelte';

	const page = createPersonaPageState();
	const view = $derived(routePage.url.searchParams.get('view') === 'state' ? 'state' : 'profile');
	function navigate(next: string) {
		const url = new URL(routePage.url);
		url.searchParams.set('view', next);
		void goto(url, { noScroll: true, keepFocus: true });
	}
	$effect(() => {
		if (page.isDatingSimMode) getCompletedEvents().then(records => { page.completedEventRecords = records; });
	});
	$effect(() => {
		if (characterStore.isReady) { page.formName = personaStore.name; page.formSystemPrompt = personaStore.systemPrompt; }
	});
</script>

<div class="page character-screen">
	<header class="page-header"><h2>Character</h2><p>Shape your companion's identity, or see how they're doing.</p></header>
	<Tabs bind:value={() => view, navigate} items={[{ value: 'profile', label: 'Profile' }, { value: 'state', label: 'State & activity' }]} label="Character views">
		{#snippet children(tab)}
			{#if tab === 'profile'}
				<div class="profile-sections">
					<SettingsSection title="Identity">
						<div class="setting-row"><div class="setting-info"><label class="setting-label" for="character-name">Name</label><span class="setting-desc">What you'll call your companion.</span></div>
							<input id="character-name" class="settings-field name-field" bind:value={page.formName} placeholder="Utsuwa" aria-label="Character name" onblur={page.saveName} />
						</div>
					</SettingsSection>
					<SettingsSection title="Appearance"><AvatarGallery {page} /></SettingsSection>
					<SettingsSection title="Personality" description="How your companion speaks, behaves, and sees the world. Changes save when you leave the field.">
						<label class="sr-only" for="character-personality">Core personality</label>
						<textarea id="character-personality" class="settings-field" bind:value={page.formSystemPrompt} rows="6" onblur={page.saveSystemPrompt} placeholder="Personality, speaking style, and background..."></textarea>
					</SettingsSection>
					<SettingsSection title="Experience">
						<div class="setting-row"><div class="setting-info"><span class="setting-label">Companion mode</span><span class="setting-desc">Dating sim includes relationship progression and events. Companion focuses on everyday conversation.</span></div>
							<SegmentedControl label="App mode" value={page.appMode} onchange={page.requestModeChange} options={[{ value: 'companion', label: 'Companion', icon: 'sparkles' }, { value: 'dating_sim', label: 'Dating sim', icon: 'heart' }]} compact />
						</div>
					</SettingsSection>
				</div>
			{:else}<StatsPanel {page} />{/if}
		{/snippet}
	</Tabs>
</div>

<Dialog.Root open={page.modeConfirmOpen} onOpenChange={(open) => { if (!open) page.cancelModeChange(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="confirm-modal" />
		<Dialog.Content class="confirm-content">
			<Dialog.Title class="confirm-title">Change companion mode?</Dialog.Title>
			<Dialog.Description class="confirm-message">This changes whether relationship progression and events are active. Your companion's name and personality stay the same.</Dialog.Description>
			<div class="confirm-actions"><Dialog.Close class="btn btn-secondary">Cancel</Dialog.Close><button class="btn btn-primary" onclick={page.confirmModeChange}>Change mode</button></div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.profile-sections { display: flex; flex-direction: column; gap: 24px; }
	.name-field { width: min(100%, 260px); }
	textarea { line-height: 1.6; }
	:global(.confirm-modal) { position: fixed; inset: 0; z-index: 1100; }
	:global(.confirm-content) { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1101; width: min(420px, calc(100vw - 32px)); padding: 24px; }
	:global(.confirm-title) { margin: 0; font-size: 18px; font-weight: 500; color: var(--text-primary); }
	:global(.confirm-message) { margin: 12px 0 24px; color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
	.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
