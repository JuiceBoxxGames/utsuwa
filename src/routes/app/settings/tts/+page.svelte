<script lang="ts">
	import { createTtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import TtsSettings from '$lib/components/settings/TtsSettings.svelte';
	import '../settings-page.css';

	const state = createTtsSettingsState();
</script>

<div class="page">
	<header class="page-header">
		<h2>Text-to-Speech</h2>
		<p>Configure the voice provider and speech settings.</p>
	</header>

	<TtsSettings {state} />
</div>
