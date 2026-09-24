<script lang="ts">
	import SttSettings from '$lib/components/settings/SttSettings.svelte';
	import '../settings-page.css';
</script>

<div class="page">
	<header class="page-header">
		<h2>Voice Input</h2>
		<p>Configure speech-to-text providers and the local server timeout.</p>
	</header>

	<SttSettings />
</div>
