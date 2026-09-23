<script lang="ts">
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { DEFAULT_STT_TIMEOUT_MS, resolveSttTimeoutMs } from '$lib/services/stt/openai-stt';
	import SettingsSection from './SettingsSection.svelte';
	import './ai-services-settings.css';
</script>

<SettingsSection
	title="Cloud providers"
	description="A local server is used first, then Groq, then OpenAI, then the browser's built-in recognition. Required on desktop, which has no built-in recognition."
>
	<div class="ai-fields">
		<div class="ai-field">
			<label class="settings-label" for="stt-groq-key">Groq API key</label>
			<input
				id="stt-groq-key"
				type="password"
				class="settings-field"
				placeholder="Groq API Key" aria-label="Groq API Key"
				value={settingsStore.getProviderConfig('groq-stt').apiKey ?? ''}
				oninput={(e) => {
					const v = e.currentTarget.value;
					settingsStore.setProviderConfig('groq-stt', { apiKey: v });
					if (v) settingsStore.markProviderAdded('groq-stt');
					else settingsStore.removeProvider('groq-stt');
				}}
			/>
		</div>
		<div class="ai-field">
			<label class="settings-label" for="stt-openai-key">OpenAI API key (Whisper)</label>
			<input
				id="stt-openai-key"
				type="password"
				class="settings-field"
				placeholder="OpenAI API Key" aria-label="OpenAI API Key"
				value={settingsStore.getProviderConfig('openai-stt').apiKey ?? ''}
				oninput={(e) => {
					const v = e.currentTarget.value;
					settingsStore.setProviderConfig('openai-stt', { apiKey: v });
					if (v) settingsStore.markProviderAdded('openai-stt');
					else settingsStore.removeProvider('openai-stt');
				}}
			/>
		</div>
	</div>
</SettingsSection>

<SettingsSection
	title="Local server"
	description="Speaches, faster-whisper-server, whisper.cpp, or any OpenAI-compatible transcription endpoint."
>
	<div class="ai-fields">
		<div class="ai-field">
			<label class="settings-label" for="stt-local-url">Server URL</label>
			<input
				id="stt-local-url"
				type="text"
				class="settings-field"
				placeholder="http://localhost:8000/v1/" aria-label="http://localhost:8000/v1/"
				value={settingsStore.getProviderConfig('local-stt').baseUrl ?? ''}
				oninput={(e) => {
					const v = e.currentTarget.value.trim();
					settingsStore.setProviderConfig('local-stt', { baseUrl: v });
					if (v) settingsStore.markProviderAdded('local-stt');
					else settingsStore.removeProvider('local-stt');
				}}
			/>
		</div>
		<div class="ai-field">
			<label class="settings-label" for="stt-local-model">Model</label>
			<input
				id="stt-local-model"
				type="text"
				class="settings-field"
				placeholder="Model (e.g. Systran/faster-whisper-large-v3)" aria-label="Model (e.g. Systran/faster-whisper-large-v3)"
				value={settingsStore.getProviderConfig('local-stt').modelId ?? ''}
				oninput={(e) => {
					settingsStore.setProviderConfig('local-stt', { modelId: e.currentTarget.value.trim() });
				}}
			/>
		</div>
		<div class="ai-field">
			<label class="settings-label" for="stt-local-timeout">Transcription timeout (seconds)</label>
			<input
				id="stt-local-timeout"
				type="number"
				class="settings-field"
				min="5"
				max="600"
				step="5"
				value={Math.round((settingsStore.getProviderConfig('local-stt').timeoutMs ?? DEFAULT_STT_TIMEOUT_MS) / 1000)}
				onchange={(e) => {
					// change, not input: clamping per keystroke would fight the user mid-typing
					const timeoutMs = resolveSttTimeoutMs(e.currentTarget.valueAsNumber);
					settingsStore.setProviderConfig('local-stt', { timeoutMs });
					e.currentTarget.value = String(timeoutMs / 1000);
				}}
			/>
			<p class="hint">How long to wait for the server to transcribe. Raise this for slow or CPU-only machines.</p>
		</div>
	</div>
</SettingsSection>
