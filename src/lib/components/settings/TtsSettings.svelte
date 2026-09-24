<script lang="ts">
	import Switch from '$lib/components/ui/Switch.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getTTSProvider } from '$lib/services/providers/registry';
	import { ProviderDropdown, ModelDropdown } from '$lib/components/ui';
	import OmniVoiceSettings from './OmniVoiceSettings.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import { checkTTSProviderHealth } from '$lib/services/providers/health-check';
	import type { TtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import './ai-services-settings.css';

	let { state }: { state: TtsSettingsState } = $props();
</script>

<SettingsSection title="Speech (TTS)">
	{#snippet actions()}<Switch checked={state.isTTSEnabled} onchange={state.toggleTTS} label="Speech (TTS)" />{/snippet}
	<div class="ai-fields">
		{#if state.isTTSEnabled}
			<div class="ai-field">
				<span class="settings-label">Provider</span>
				<ProviderDropdown
					type="tts"
					value={state.speechSettings.activeProvider as string}
					onSelect={state.handleTTSProviderChange}
					placeholder="Select TTS provider..."
				/>
			</div>

			{#if state.speechSettings.activeProvider}
				{@const provider = getTTSProvider(state.speechSettings.activeProvider as string)}

				{#if provider?.requiresApiKey}
					<div class="ai-field">
						<label class="settings-label" for="tts-api-key">API key</label>
						<input
							id="tts-api-key"
							type="password"
							class="settings-field"
							class:error={state.ttsFetchError}
							placeholder="API Key" aria-label="API Key"
							value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
							oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
							onblur={state.handleTTSApiKeyBlur}
						/>
					</div>
				{/if}

				{#if !provider?.isLocal}
					<div class="ai-field">
						<span class="settings-label">Model</span>
						<ModelDropdown
							models={state.ttsModels}
							value={state.speechSettings.activeModel as string}
							onSelect={state.handleTTSModelChange}
							placeholder="Select model..."
							isLoading={state.ttsIsLoading}
							onRefresh={state.ttsHasApiKey ? state.fetchTTSModels : undefined}
							disabled={!state.ttsHasApiKey}
							disabledMessage="Enter API key first"
						/>
					</div>
				{/if}

				{#if provider?.id === 'elevenlabs' || provider?.id === 'fish-audio'}
					<div class="ai-field">
						<label class="settings-label" for="tts-voice-id">Voice ID</label>
						<input
							id="tts-voice-id"
							type="text"
							class="settings-field"
							list="{provider.id}-voices"
							placeholder="Voice ID" aria-label="Voice ID"
							value={state.speechSettings.activeVoiceId as string ?? ''}
							onchange={(e) => state.handleTTSVoiceChange(e.currentTarget.value)}
						/>
						<datalist id="{provider.id}-voices">
							{#each provider?.voices ?? [] as voice}
								<option value={voice.id}>{voice.name}</option>
							{/each}
						</datalist>
					</div>
				{/if}

				{#if provider?.isLocal && state.speechSettings.activeProvider !== 'omnivoice'}
					<div class="ai-field">
						<label class="settings-label" for="tts-local-voice">Voice</label>
						<input
							id="tts-local-voice"
							type="text"
							class="settings-field"
							list="local-tts-voices"
							placeholder="Voice (e.g. af_bella)" aria-label="Voice (e.g. af_bella)"
							value={state.speechSettings.activeVoiceId as string ?? ''}
							onchange={(e) => state.handleTTSVoiceChange(e.currentTarget.value)}
						/>
						<datalist id="local-tts-voices">
							{#each provider.voices ?? [] as voice}
								<option value={voice.id}>{voice.name}</option>
							{/each}
						</datalist>
					</div>
					<div class="ai-field">
						<label class="settings-label" for="tts-local-model">Model (optional)</label>
						<input
							id="tts-local-model"
							type="text"
							class="settings-field"
							placeholder="Model (optional, e.g. kokoro)" aria-label="Model (optional, e.g. kokoro)"
							value={state.speechSettings.activeModel as string ?? ''}
							onchange={(e) => state.handleTTSModelChange(e.currentTarget.value)}
						/>
					</div>
					<div class="ai-field">
						<label class="settings-label" for="tts-base-url">Base URL</label>
						<input
							id="tts-base-url"
							type="text"
							class="settings-field"
							placeholder={provider.defaultBaseUrl || 'http://localhost:8880/v1/'} aria-label={provider.defaultBaseUrl || 'http://localhost:8880/v1/'}
							value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
							onchange={(e) => {
								settingsStore.setProviderConfig(provider.id, { baseUrl: e.currentTarget.value });
								checkTTSProviderHealth(provider.id, e.currentTarget.value);
							}}
						/>
					</div>
				{/if}

				{#if provider && state.speechSettings.activeProvider === 'omnivoice'}
					<OmniVoiceSettings {state} {provider} />
				{/if}
			{/if}
		{:else}
			<p class="hint">Turn on speech to pick a voice provider.</p>
		{/if}
	</div>
</SettingsSection>
