<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Select from '$lib/components/ui/Select.svelte';
	import { Tooltip, Icon } from '$lib/components/ui';
	import SettingsSection from './SettingsSection.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import type { TtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import type { ProviderMetadata } from '$lib/services/providers/registry';
	import { getSharedAudioContext } from '$lib/services/tts';
	import { getTTSBaseUrl } from '$lib/services/providers/local-endpoints';
	import { buildPresetInstructions } from '$lib/stores/ai-services-settings-logic';
	import { getFocusableElements, handleModalKeydown } from './tts-modal-a11y';
	import './ai-services-settings.css';

	let {
		state: settings,
		provider
	}: {
		state: TtsSettingsState;
		provider: ProviderMetadata;
	} = $props();

	const languages = [
		{ code: 'en', name: 'English' },
		{ code: 'de', name: 'German' },
		{ code: 'es', name: 'Spanish' },
		{ code: 'fr', name: 'French' },
		{ code: 'it', name: 'Italian' },
		{ code: 'pt', name: 'Portuguese' },
		{ code: 'ja', name: 'Japanese' },
		{ code: 'ko', name: 'Korean' },
		{ code: 'zh', name: 'Chinese' },
		{ code: 'ru', name: 'Russian' },
		{ code: 'ar', name: 'Arabic' },
		{ code: 'nl', name: 'Dutch' },
		{ code: 'pl', name: 'Polish' },
		{ code: 'tr', name: 'Turkish' },
		{ code: 'sv', name: 'Swedish' }
	];

	const TEST_PHRASES: Record<string, string> = {
		en: 'Hello, this is a test of OmniVoice text to speech.',
		de: 'Hallo, dies ist ein Test von OmniVoice.',
		es: 'Hola, esta es una prueba de OmniVoice.',
		fr: 'Bonjour, ceci est un test de OmniVoice.',
		it: 'Ciao, questo è un test di OmniVoice.',
		pt: 'Olá, este é um teste do OmniVoice.',
		ja: 'こんにちは、これはOmniVoiceのテストです。',
		ko: '안녕하세요, OmniVoice 테스트입니다.',
		zh: '你好，这是OmniVoice的测试。',
		ru: 'Здравствуйте, это тест OmniVoice.',
		ar: 'مرحباً، هذا اختبار لـ OmniVoice.',
		nl: 'Hallo, dit is een test van OmniVoice.',
		pl: 'Cześć, to jest test OmniVoice.',
		tr: 'Merhaba, bu OmniVoice bir testidir.',
		sv: 'Hej, detta är ett test av OmniVoice.'
	};

	const DEFAULT_PRESET_VOICE = 'alloy';

	// ── Local UI state ───────────────────────────────────────────────────────

	let previewLoading = $state(false);
	let previewError = $state('');
	let regenerating = $state(false);
	let profileError = $state('');

	let showCloneModal = $state(false);
	let cloneVoiceId = $state('');
	let cloneRefText = $state('');
	let cloneRefAudio: File | null = $state(null);
	let cloneFileName = $state('');
	let cloneLoading = $state(false);
	let cloneError = $state('');
	let cloneModalCard: HTMLDivElement | null = $state(null);
	let clonedVoices = $state<Array<{ id: string; name: string }>>([]);
	let cloneDeleting = $state('');

	let proxyStatus = $state<'connected' | 'connecting' | 'disconnected' | 'checking'>('checking');
	let proxyCheckTimer: ReturnType<typeof setInterval> | undefined;

	// ── Derived voice state ──────────────────────────────────────────────────

	const activeVoiceId = $derived.by(() => (settings.speechSettings.activeVoiceId as string) || '');
	const isClone = $derived.by(() => activeVoiceId.startsWith('clone:'));
	const activeLanguage = $derived.by(() => {
		const lang = settings.speechSettings.activeLanguage as string;
		return languages.some((l) => l.code === lang) ? lang : 'en';
	});

	function baseUrl(): string {
		return getTTSBaseUrl('omnivoice', settingsStore.getProviderConfig(provider.id).baseUrl);
	}

	// Mirrors the Bearer auth openai-tts.ts sends, for proxies running with
	// OMNIVOICE_AUTH_TOKEN. Health stays unauthenticated (the endpoint is open).
	function authHeaders(): Record<string, string> {
		const apiKey = settingsStore.getProviderConfig(provider.id).apiKey;
		return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
	}

	const PRESET_ATTRIBUTES: Record<string, { gender: string; age: string; pitch: string; accent: string }> =
		{
			alloy: { gender: 'female', age: 'young adult', pitch: 'moderate', accent: 'american' },
			ash: { gender: 'male', age: 'young adult', pitch: 'low', accent: 'american' },
			ballad: { gender: 'male', age: 'middle-aged', pitch: 'low', accent: 'british' },
			cedar: { gender: 'male', age: 'middle-aged', pitch: 'low', accent: 'american' },
			coral: { gender: 'female', age: 'young adult', pitch: 'high', accent: 'australian' },
			echo: { gender: 'male', age: 'middle-aged', pitch: 'moderate', accent: 'canadian' },
			fable: { gender: 'female', age: 'middle-aged', pitch: 'moderate', accent: 'british' },
			marin: { gender: 'female', age: 'middle-aged', pitch: 'moderate', accent: 'canadian' },
			nova: { gender: 'female', age: 'young adult', pitch: 'high', accent: 'american' },
			onyx: { gender: 'male', age: 'middle-aged', pitch: 'very low', accent: 'british' },
			sage: { gender: 'female', age: 'elderly', pitch: 'low', accent: 'british' },
			shimmer: { gender: 'female', age: 'young adult', pitch: 'very high', accent: 'american' },
			verse: { gender: 'male', age: 'young adult', pitch: 'moderate', accent: 'british' }
		};

	function deriveInstructions(voiceId: string, language: string): string {
		return buildPresetInstructions(voiceId || DEFAULT_PRESET_VOICE, language, PRESET_ATTRIBUTES);
	}

	function handlePresetChange(voiceId: string) {
		if (!voiceId) return;
		const language = activeLanguage;
		const instructions = deriveInstructions(voiceId, language);
		settings.handleTTSInstructionsChange(instructions);
		settings.handleTTSVoiceChange(voiceId);
	}

	function handleLanguageChange(language: string) {
		settings.handleTTSLanguageChange(language);
		if (isClone) return;
		const voiceId = activeVoiceId || DEFAULT_PRESET_VOICE;
		const instructions = deriveInstructions(voiceId, language);
		settings.handleTTSInstructionsChange(instructions);
		settings.handleTTSVoiceChange(voiceId);
	}

	function parseSpeed(value: string): number | undefined {
		const parsed = parseFloat(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	function parseNumber(value: string): number | undefined {
		const parsed = parseFloat(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}

	// ── Profile initialization & regeneration ────────────────────────────────

	async function initializeProfile(voice: string, instructions: string, language: string) {
		try {
			const res = await fetch(baseUrl() + 'voices/initialize', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify({ voice, instructions, language })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
				profileError = (err as { detail?: string }).detail || `Profile init failed (HTTP ${res.status})`;
			}
		} catch (err) {
			profileError = err instanceof Error ? err.message : 'Profile initialization failed';
		}
	}

	async function regenerateProfile() {
		regenerating = true;
		profileError = '';
		try {
			const voiceId = activeVoiceId || DEFAULT_PRESET_VOICE;
			const voice = isClone ? voiceId.replace('clone:', '') : voiceId;
			const instructions = isClone
				? undefined
				: (settings.speechSettings.instructions as string) || deriveInstructions(voiceId, activeLanguage);
			const language = activeLanguage;

			const body: Record<string, unknown> = { voice, language };
			if (instructions) body.instructions = instructions;

			const res = await fetch(baseUrl() + 'voices/profile/reset', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...authHeaders() },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
				throw new Error(
					(err as { detail?: string }).detail || `Profile reset failed (HTTP ${res.status})`
				);
			}
		} catch (err) {
			profileError = err instanceof Error ? err.message : 'Profile reset failed';
		} finally {
			regenerating = false;
		}
	}

	// ── Proxy health & clone list ────────────────────────────────────────────

	async function checkProxyHealth() {
		proxyStatus = 'connecting';
		try {
			const healthUrl = baseUrl().replace(/\/v1\/$/, '').replace(/\/+$/, '') + '/health';
			const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
			proxyStatus = res.ok ? 'connected' : res.status === 503 ? 'connecting' : 'disconnected';
		} catch {
			proxyStatus = 'disconnected';
		}
	}

	function startHealthPolling() {
		proxyStatus = 'checking';
		checkProxyHealth();
		proxyCheckTimer = setInterval(checkProxyHealth, 5000);
	}

	function stopHealthPolling() {
		clearInterval(proxyCheckTimer);
		proxyCheckTimer = undefined;
	}

	async function fetchClonedVoices() {
		try {
			const res = await fetch(baseUrl() + 'voices', { headers: authHeaders() });
			if (!res.ok) return;
			const data = await res.json();
			clonedVoices = (data.clones || []) as Array<{ id: string; name: string }>;
		} catch (err) {
			clonedVoices = [];
			if (import.meta.env.DEV) {
				console.debug('Clone list fetch failed:', err);
			}
		}
	}

	// Default settings initialization: runs when speech settings change.
	$effect(() => {
		if (!languages.some((l) => l.code === settings.speechSettings.activeLanguage)) {
			settings.handleTTSLanguageChange('en');
		}
		if (!activeVoiceId && !isClone) {
			settings.handleTTSVoiceChange(DEFAULT_PRESET_VOICE);
			settings.handleTTSInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, activeLanguage));
		}
		if (!(settings.speechSettings.instructions as string) && !isClone) {
			settings.handleTTSInstructionsChange(
				deriveInstructions(activeVoiceId || DEFAULT_PRESET_VOICE, activeLanguage)
			);
		}
	});

	// Health polling and clone list: only depends on the proxy endpoint.
	$effect(() => {
		const url = baseUrl();
		fetchClonedVoices();
		startHealthPolling();
		return () => {
			stopHealthPolling();
		};
	});

	// Profile initialization: runs when the active synthetic voice or language changes.
	$effect(() => {
		if (isClone) return;
		const voice = activeVoiceId || DEFAULT_PRESET_VOICE;
		const instructions =
			(settings.speechSettings.instructions as string) || deriveInstructions(voice, activeLanguage);
		initializeProfile(voice, instructions, activeLanguage);
	});

	// ── Preview ──────────────────────────────────────────────────────────────

	async function playPreviewAudio(body: Record<string, unknown>) {
		const res = await fetch(baseUrl() + 'audio/speech', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...authHeaders() },
			body: JSON.stringify(body)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);

		const arrayBuffer = await res.arrayBuffer();
		const ctx = getSharedAudioContext();
		if (ctx.state === 'suspended') await ctx.resume();
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
		const source = ctx.createBufferSource();
		source.buffer = audioBuffer;
		source.connect(ctx.destination);
		source.start(0);
	}

	async function handlePreview() {
		previewLoading = true;
		previewError = '';
		try {
			const lang = activeLanguage;
			const text = TEST_PHRASES[lang] || TEST_PHRASES.en;
			const instructions = isClone
				? undefined
				: (settings.speechSettings.instructions as string) ||
				  deriveInstructions(activeVoiceId || DEFAULT_PRESET_VOICE, lang);

			const body: Record<string, unknown> = {
				model: 'omnivoice',
				input: text,
				response_format: 'wav',
				language: lang
			};
			if (activeVoiceId) body.voice = activeVoiceId;
			if (instructions) body.instructions = instructions;
			const speed = (settings.speechSettings.speed as number) ?? 1;
			if (speed != null) body.speed = speed;
			const ns = (settings.speechSettings.numStep as number) ?? 32;
			if (ns != null) body.num_step = ns;
			const pt = settings.speechSettings.positionTemperature as number;
			if (pt != null) body.position_temperature = pt;
			const ct = settings.speechSettings.classTemperature as number;
			if (ct != null) body.class_temperature = ct;

			await playPreviewAudio(body);
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Preview failed';
		} finally {
			previewLoading = false;
		}
	}

	// ── Alternative voice ────────────────────────────────────────────────────

	const altEnabled = $derived.by(() => (settings.speechSettings.enableAltLanguage as boolean) ?? false);
	const toolCallingEnabled = $derived.by(() => (settings.speechSettings.enableToolCalling as boolean) ?? true);
	const altLanguage = $derived.by(() => {
		const lang = settings.speechSettings.altLanguage as string;
		return languages.some((l) => l.code === lang) ? lang : '';
	});
	const altVoiceId = $derived.by(() => (settings.speechSettings.altVoiceId as string) || '');
	const altIsClone = $derived.by(() => altVoiceId.startsWith('clone:'));

	function altLangOrDefault(): string {
		return altLanguage || 'es';
	}

	function handleAltLanguageChange(language: string) {
		settings.handleTTSAltLanguageChange(language);
		if (altIsClone) return;
		const voiceId = altVoiceId || DEFAULT_PRESET_VOICE;
		settings.handleTTSAltInstructionsChange(deriveInstructions(voiceId, language));
	}

	function handleAltPresetChange(voiceId: string) {
		if (!voiceId) return;
		settings.handleTTSAltInstructionsChange(deriveInstructions(voiceId, altLangOrDefault()));
		settings.handleTTSAltVoiceChange(voiceId);
	}

	function switchAltToSynthetic() {
		settings.handleTTSAltVoiceChange(DEFAULT_PRESET_VOICE);
		settings.handleTTSAltInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, altLangOrDefault()));
	}

	function switchAltToClone() {
		if (altIsClone) return;
		const first = clonedVoices[0];
		if (first) {
			settings.handleTTSAltVoiceChange(first.id);
		} else {
			openCloneModal();
		}
	}

	// Defaults: picking sensible values the first time the alt voice is enabled.
	$effect(() => {
		if (!altEnabled) return;
		const lang = altLangOrDefault();
		if (!altLanguage) settings.handleTTSAltLanguageChange(lang);
		if (!altVoiceId) {
			settings.handleTTSAltVoiceChange(DEFAULT_PRESET_VOICE);
			settings.handleTTSAltInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, lang));
		}
	});

	// Profile initialization: pre-warm the alternative-language profile so the
	// first foreign word in a chat does not stall on on-demand generation.
	$effect(() => {
		if (!altEnabled || altIsClone || !altLanguage) return;
		const voice = altVoiceId || DEFAULT_PRESET_VOICE;
		const instructions =
			(settings.speechSettings.altInstructions as string) ||
			deriveInstructions(voice, altLanguage);
		initializeProfile(voice, instructions, altLanguage);
	});

	async function handleAltPreview() {
		previewLoading = true;
		previewError = '';
		try {
			const lang = altLangOrDefault();
			const text = TEST_PHRASES[lang] || TEST_PHRASES.en;
			const instructions = altIsClone
				? undefined
				: (settings.speechSettings.altInstructions as string) ||
				  deriveInstructions(altVoiceId || DEFAULT_PRESET_VOICE, lang);

			const body: Record<string, unknown> = {
				model: 'omnivoice',
				input: text,
				response_format: 'wav',
				language: lang
			};
			if (altVoiceId) body.voice = altVoiceId;
			if (instructions) body.instructions = instructions;
			const speed = (settings.speechSettings.altSpeed as number) ?? 1;
			if (speed != null) body.speed = speed;
			const ns = (settings.speechSettings.altNumStep as number) ?? 32;
			if (ns != null) body.num_step = ns;
			const apt = settings.speechSettings.altPositionTemperature as number;
			if (apt != null) body.position_temperature = apt;
			const act = settings.speechSettings.altClassTemperature as number;
			if (act != null) body.class_temperature = act;

			await playPreviewAudio(body);
		} catch (err) {
			previewError = err instanceof Error ? err.message : 'Preview failed';
		} finally {
			previewLoading = false;
		}
	}

	// ── Clone voice modal ────────────────────────────────────────────────────

	function openCloneModal() {
		cloneVoiceId = '';
		cloneRefText = '';
		cloneRefAudio = null;
		cloneFileName = '';
		cloneError = '';
		showCloneModal = true;
		requestAnimationFrame(() => {
			cloneModalCard?.focus();
		});
	}

	function closeCloneModal() {
		showCloneModal = false;
	}

	function handleCloneModalKeydown(e: KeyboardEvent) {
		if (!cloneModalCard) return;
		handleModalKeydown(
			e,
			getFocusableElements(cloneModalCard),
			document.activeElement,
			closeCloneModal
		);
	}

	async function handleCloneVoice() {
		cloneError = '';
		if (!cloneVoiceId.trim() || !cloneRefAudio || !cloneRefText.trim()) {
			cloneError = 'Please provide a voice name, reference audio, and reference text.';
			return;
		}
		cloneLoading = true;
		try {
			const formData = new FormData();
			formData.append('voice_id', cloneVoiceId.trim());
			formData.append('ref_audio', cloneRefAudio);
			formData.append('ref_text', cloneRefText.trim());

			const res = await fetch(baseUrl() + 'voices/clone', {
				method: 'POST',
				headers: authHeaders(),
				body: formData
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
				throw new Error((err as { detail?: string }).detail || `HTTP ${res.status}`);
			}
			settings.handleTTSVoiceChange('clone:' + cloneVoiceId.trim());
			closeCloneModal();
			cloneVoiceId = '';
			cloneRefText = '';
			cloneRefAudio = null;
			cloneFileName = '';
			await fetchClonedVoices();
		} catch (err) {
			cloneError = err instanceof Error ? err.message : 'Clone failed';
		} finally {
			cloneLoading = false;
		}
	}

	// ── Delete clone ─────────────────────────────────────────────────────────

	async function deleteClone(cloneId: string, target: 'primary' | 'alt' = 'primary') {
		cloneDeleting = cloneId;
		try {
			await fetch(baseUrl() + 'voices/clone/' + cloneId, {
				method: 'DELETE',
				headers: authHeaders()
			});
			if (target === 'primary') {
				if (activeVoiceId === 'clone:' + cloneId) {
					settings.handleTTSVoiceChange(DEFAULT_PRESET_VOICE);
					settings.handleTTSInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, activeLanguage));
				}
			} else if (altVoiceId === 'clone:' + cloneId) {
				settings.handleTTSAltVoiceChange(DEFAULT_PRESET_VOICE);
				settings.handleTTSAltInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, altLangOrDefault()));
			}
			await fetchClonedVoices();
		} catch {
			/* ignore */
		}
		cloneDeleting = '';
	}

	function switchToSynthetic() {
		settings.handleTTSVoiceChange(DEFAULT_PRESET_VOICE);
		settings.handleTTSInstructionsChange(deriveInstructions(DEFAULT_PRESET_VOICE, activeLanguage));
	}

	function switchToClone() {
		if (isClone) return;
		const first = clonedVoices[0];
		if (first) {
			settings.handleTTSVoiceChange(first.id);
		} else {
			openCloneModal();
		}
	}
</script>

<svelte:window onkeydown={handleCloneModalKeydown} />

<!-- Shared voice selector field: Synthetic mode lists the presets, Cloned
     mode lists the cloned voices with clone management buttons. Used
     identically for primary and alternative voice. -->
{#snippet voiceSelect(opts: {
	voiceId: string;
	isClone: boolean;
	selectId: string;
	onVoiceChange: (id: string) => void;
	onDeleteClone: (cloneId: string) => void;
})}
	<div class="omnivoice-field">
		<label class="omnivoice-label" for={opts.selectId}>Voice</label>
		{#if opts.isClone}
			<div class="omnivoice-voice-row" style="flex-wrap:wrap;">
				<Select id={opts.selectId} label={opts.selectId.includes('alt') ? 'Alternative voice' : 'Primary voice'} style="flex:1;min-width:0;" value={opts.voiceId} onchange={opts.onVoiceChange} placeholder="No cloned voices yet"
					options={[
						...clonedVoices.map(v => ({ value: v.id, label: v.name })),
						...(opts.voiceId && !clonedVoices.some(v => v.id === opts.voiceId) ? [{ value: opts.voiceId, label: `cloned ${opts.voiceId.replace('clone:', '')} (loading)` }] : [])
					]} />
				<button class="btn btn-sm btn-secondary" onclick={openCloneModal}>Clone New</button>
				{#if opts.voiceId}
					{@const cloneId = opts.voiceId.replace('clone:', '')}
					<button
						class="btn btn-sm btn-danger"
						onclick={() => opts.onDeleteClone(cloneId)}
						disabled={cloneDeleting === cloneId}
					>
						{#if cloneDeleting === cloneId}...{:else}Delete{/if}
					</button>
				{/if}
			</div>
		{:else}
			<Select id={opts.selectId} label={opts.selectId.includes('alt') ? 'Alternative voice' : 'Primary voice'} value={opts.voiceId || DEFAULT_PRESET_VOICE} onchange={opts.onVoiceChange} options={(provider.voices ?? []).map(voice => ({ value: voice.id, label: voice.name }))} />
		{/if}
	</div>
{/snippet}

<!-- Proxy card -->
<div class="omnivoice-card">
	<div class="omnivoice-field">
		<label class="omnivoice-label" for="omnivoice-base-url">
			<span>OmniVoice Proxy</span>
			<span class="omnivoice-proxy-status">
				{#if proxyStatus === 'connected'}
					<span class="omnivoice-dot omnivoice-dot-ok"></span> Connected
				{:else if proxyStatus === 'connecting'}
					<span class="omnivoice-dot omnivoice-dot-warn"></span> Connecting...
				{:else if proxyStatus === 'disconnected'}
					<span class="omnivoice-dot omnivoice-dot-err"></span> Not reachable
				{:else}
					<span class="omnivoice-dot"></span> Checking...
				{/if}
			</span>
		</label>
		<input
			id="omnivoice-base-url"
			type="text"
			class="api-key-input"
			placeholder={provider.defaultBaseUrl || 'http://localhost:8881/v1/'}
			value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
			onchange={(e) => settingsStore.setProviderConfig(provider.id, { baseUrl: e.currentTarget.value })}
		/>
	</div>
</div>

{#if profileError || previewError}
	<div class="omnivoice-error" role="alert">
		{profileError || previewError}
		<button
			class="omnivoice-error-close btn btn-ghost btn-sm"
			onclick={() => {
				profileError = '';
				previewError = '';
			}}
			aria-label="Dismiss error"><Icon name="x" size={14} /></button
		>
	</div>
{/if}

<!-- Primary voice card -->
<SettingsSection title="Primary voice" outlined>

	<div class="omnivoice-design-grid-2">
		<div class="omnivoice-field">
			<label class="omnivoice-label" for="omnivoice-language">Language</label>
			<Select id="omnivoice-language" label="Language" value={activeLanguage} onchange={handleLanguageChange} options={languages.map(lang => ({ value: lang.code, label: lang.name }))} />
		</div>

		{@render voiceSelect({
			voiceId: activeVoiceId,
			isClone,
			selectId: 'omnivoice-voice',
			onVoiceChange: (id) => {
				if (isClone) settings.handleTTSVoiceChange(id);
				else handlePresetChange(id);
			},
			onDeleteClone: (cloneId) => deleteClone(cloneId, 'primary')
		})}
	</div>

	<div class="omnivoice-voice-row">
		<span class="omnivoice-design-label" style="width:auto;flex-shrink:0;">Mode</span>
		<label class="omnivoice-radio">
			<input
				type="radio"
				name="ov-mode"
				value="synth"
				checked={!isClone}
				onchange={switchToSynthetic}
			/>
			Synthetic
		</label>
		<label class="omnivoice-radio">
			<input
				type="radio"
				name="ov-mode"
				value="clone"
				checked={isClone}
				onchange={switchToClone}
			/>
			Cloned
		</label>
		<span style="flex:1;"></span>
		<button class="btn btn-sm btn-secondary" onclick={regenerateProfile} disabled={regenerating || isClone}
			title={isClone ? 'Profile regeneration is only available for synthetic voices' : ''}>
			{#if regenerating}
				<span class="omnivoice-spinner"></span> Regenerating...
			{:else}
				<Icon name="refresh-cw" size={14} /> Regenerate
			{/if}
		</button>
		<button class="btn btn-sm btn-primary" onclick={handlePreview} disabled={previewLoading}>
			{#if previewLoading}
				<span class="omnivoice-spinner"></span> Testing...
			{:else}
				<Icon name="play" size={14} /> Test
			{/if}
		</button>
	</div>

	<div class="omnivoice-design-grid-2">
		<div class="omnivoice-design-row">
			<label class="omnivoice-design-label" for="omnivoice-speed">Speed</label>
			<input id="omnivoice-speed"
				type="range" use:rangeProgress={(settings.speechSettings.speed as number) ?? 1}
				min="0.5"
				max="2.0"
				step="0.1"
				class="settings-range omnivoice-slider"
				value={(settings.speechSettings.speed as number) ?? 1}
				oninput={(e) => settings.handleTTSSpeedChange(parseSpeed(e.currentTarget.value))}
			/>
			<span class="omnivoice-slider-val">{(settings.speechSettings.speed as number) ?? 1}</span>
		</div>
		<div class="omnivoice-design-row">
			<label class="omnivoice-design-label" for="omnivoice-num-step">Num Step</label>
			<input id="omnivoice-num-step"
				type="range" use:rangeProgress={(settings.speechSettings.numStep as number) ?? 32}
				min="4"
				max="64"
				step="1"
				class="settings-range omnivoice-slider"
				value={(settings.speechSettings.numStep as number) ?? 32}
				oninput={(e) => settings.handleTTSNumStepChange(parseNumber(e.currentTarget.value))}
			/>
			<span class="omnivoice-slider-val">{(settings.speechSettings.numStep as number) ?? 32}</span>
		</div>
	</div>

	<div class="omnivoice-design-grid-2">
		<div class="omnivoice-advanced-slider">
			<label class="omnivoice-advanced-label" for="omnivoice-position-temperature">Position Temperature</label>
			<div class="omnivoice-advanced-row">
				<input id="omnivoice-position-temperature"
					type="range" use:rangeProgress={(settings.speechSettings.positionTemperature as number) ?? 1}
					min="0"
					max="2"
					step="0.1"
					class="settings-range omnivoice-slider"
					value={(settings.speechSettings.positionTemperature as number) ?? 1}
					oninput={(e) =>
						settings.handleTTSPositionTemperatureChange(parseNumber(e.currentTarget.value))}
				/>
				<span class="omnivoice-slider-val">
					{(settings.speechSettings.positionTemperature as number) ?? 1}
				</span>
			</div>
		</div>
		<div class="omnivoice-advanced-slider">
			<label class="omnivoice-advanced-label" for="omnivoice-class-temperature">Class Temperature</label>
			<div class="omnivoice-advanced-row">
				<input id="omnivoice-class-temperature"
					type="range" use:rangeProgress={(settings.speechSettings.classTemperature as number) ?? 0.2}
					min="0"
					max="2"
					step="0.1"
					class="settings-range omnivoice-slider"
					value={(settings.speechSettings.classTemperature as number) ?? 0.2}
					oninput={(e) =>
						settings.handleTTSClassTemperatureChange(parseNumber(e.currentTarget.value))}
				/>
				<span class="omnivoice-slider-val">
					{(settings.speechSettings.classTemperature as number) ?? 0.2}
				</span>
			</div>
		</div>
	</div>
</SettingsSection>

<!-- Alternative voice card -->
<SettingsSection title="Alternative voice" outlined>

	<div class="omnivoice-voice-row">
		<label class="omnivoice-radio">
			<input
				type="checkbox"
				checked={altEnabled}
				onchange={(e) => settings.handleTTSEnableAltLanguageChange(e.currentTarget.checked)}
			/>
			Speak foreign words with a second voice
		</label>
		<span style="flex:1;"></span>
		{#if altEnabled}
			<button
				class="btn btn-sm btn-primary"
				onclick={handleAltPreview}
				disabled={previewLoading}
			>
				{#if previewLoading}
					<span class="omnivoice-spinner"></span> Testing...
				{:else}
					<Icon name="play" size={14} /> Test Alt Voice
				{/if}
			</button>
		{/if}
	</div>

	{#if altEnabled}
		<div class="omnivoice-design-grid-2">
			<div class="omnivoice-field">
				<label class="omnivoice-label" for="omnivoice-alt-language">Language</label>
				<Select id="omnivoice-alt-language" label="Alternative language" value={altLanguage} onchange={handleAltLanguageChange} placeholder="Select a language..." options={languages.filter(lang => lang.code !== activeLanguage).map(lang => ({ value: lang.code, label: lang.name }))} />
			</div>

			{@render voiceSelect({
				voiceId: altVoiceId,
				isClone: altIsClone,
				selectId: 'omnivoice-alt-voice',
				onVoiceChange: (id) => {
					if (altIsClone) settings.handleTTSAltVoiceChange(id);
					else handleAltPresetChange(id);
				},
				onDeleteClone: (cloneId) => deleteClone(cloneId, 'alt')
			})}
		</div>

		<div class="omnivoice-voice-row">
		<label class="omnivoice-radio">
			<input
				type="checkbox"
				checked={toolCallingEnabled}
				onchange={(e) => settings.handleTTSEnableToolCallingChange(e.currentTarget.checked)}
			/>
			<span>Force language per segment</span>
			</label>
		<Tooltip content="More reliable; needs LLM tool support"><Icon name="info" size={16} /></Tooltip>
		</div>

		<div class="omnivoice-voice-row">
			<span class="omnivoice-design-label" style="width:auto;flex-shrink:0;">Mode</span>
			<label class="omnivoice-radio">
				<input
					type="radio"
					name="ov-alt-mode"
					value="synth"
					checked={!altIsClone}
					onchange={switchAltToSynthetic}
				/>
				Synthetic
			</label>
			<label class="omnivoice-radio">
				<input
					type="radio"
					name="ov-alt-mode"
					value="clone"
					checked={altIsClone}
					onchange={switchAltToClone}
				/>
				Cloned
			</label>
		</div>

		<div class="omnivoice-design-grid-2">
			<div class="omnivoice-design-row">
				<label class="omnivoice-design-label" for="omnivoice-alt-speed">Alt Speed</label>
				<input id="omnivoice-alt-speed"
					type="range" use:rangeProgress={(settings.speechSettings.altSpeed as number) ?? 1}
					min="0.5"
					max="2.0"
					step="0.1"
					class="settings-range omnivoice-slider"
					value={(settings.speechSettings.altSpeed as number) ?? 1}
					oninput={(e) => settings.handleTTSAltSpeedChange(parseSpeed(e.currentTarget.value))}
				/>
				<span class="omnivoice-slider-val">{(settings.speechSettings.altSpeed as number) ?? 1}</span>
			</div>
			<div class="omnivoice-design-row">
				<label class="omnivoice-design-label" for="omnivoice-alt-num-step">Alt Num Step</label>
				<input id="omnivoice-alt-num-step"
					type="range" use:rangeProgress={(settings.speechSettings.altNumStep as number) ?? 32}
					min="4"
					max="64"
					step="1"
					class="settings-range omnivoice-slider"
					value={(settings.speechSettings.altNumStep as number) ?? 32}
					oninput={(e) => settings.handleTTSAltNumStepChange(parseNumber(e.currentTarget.value))}
				/>
				<span class="omnivoice-slider-val">{(settings.speechSettings.altNumStep as number) ?? 32}</span>
			</div>
		</div>

		<div class="omnivoice-design-grid-2">
			<div class="omnivoice-advanced-slider">
				<label class="omnivoice-advanced-label" for="omnivoice-alt-position-temperature">Alt Position Temperature</label>
				<div class="omnivoice-advanced-row">
					<input id="omnivoice-alt-position-temperature"
						type="range" use:rangeProgress={(settings.speechSettings.altPositionTemperature as number) ?? 1}
						min="0"
						max="2"
						step="0.1"
						class="settings-range omnivoice-slider"
						value={(settings.speechSettings.altPositionTemperature as number) ?? 1}
						oninput={(e) =>
							settings.handleTTSAltPositionTemperatureChange(parseNumber(e.currentTarget.value))}
					/>
					<span class="omnivoice-slider-val">
						{(settings.speechSettings.altPositionTemperature as number) ?? 1}
					</span>
				</div>
			</div>
			<div class="omnivoice-advanced-slider">
				<label class="omnivoice-advanced-label" for="omnivoice-alt-class-temperature">Alt Class Temperature</label>
				<div class="omnivoice-advanced-row">
					<input id="omnivoice-alt-class-temperature"
						type="range" use:rangeProgress={(settings.speechSettings.altClassTemperature as number) ?? 0.2}
						min="0"
						max="2"
						step="0.1"
						class="settings-range omnivoice-slider"
						value={(settings.speechSettings.altClassTemperature as number) ?? 0.2}
						oninput={(e) =>
							settings.handleTTSAltClassTemperatureChange(parseNumber(e.currentTarget.value))}
					/>
					<span class="omnivoice-slider-val">
						{(settings.speechSettings.altClassTemperature as number) ?? 0.2}
					</span>
				</div>
			</div>
		</div>
	{/if}
</SettingsSection>

{#if showCloneModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="omnivoice-modal-backdrop"
		onclick={closeCloneModal}
		role="button"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			bind:this={cloneModalCard}
			class="omnivoice-modal-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="clone-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<h3 id="clone-modal-title" class="omnivoice-modal-title">Clone New Voice</h3>

			<div class="omnivoice-modal-field">
				<label class="omnivoice-modal-label" for="clone-audio">Reference Audio (3–10s)</label>
				<div class="omnivoice-file-row">
					<label class="btn btn-sm btn-secondary" for="clone-audio">
						{cloneFileName || 'Choose file...'}
					</label>
					<input
						type="file"
						accept="audio/*"
						id="clone-audio"
						class="omnivoice-hidden-input"
						onchange={(e) => {
							cloneRefAudio = e.currentTarget.files?.[0] ?? null;
							cloneFileName = cloneRefAudio?.name ?? '';
						}}
					/>
					{#if cloneFileName}
						<span class="omnivoice-file-name">{cloneFileName}</span>
					{/if}
				</div>
			</div>

			<div class="omnivoice-modal-field">
				<label class="omnivoice-modal-label" for="clone-name">Voice Name</label>
				<input
					type="text"
					id="clone-name"
					class="api-key-input"
					placeholder="e.g. my_voice"
					bind:value={cloneVoiceId}
				/>
			</div>

			<div class="omnivoice-modal-field">
				<label class="omnivoice-modal-label" for="clone-text">Reference Text</label>
				<textarea
					id="clone-text"
					class="api-key-input omnivoice-clone-textarea"
					placeholder="Write the sentence you have recorded in the audio file"
					rows="4"
					bind:value={cloneRefText}
				></textarea>
			</div>

			{#if cloneError}
				<p class="omnivoice-modal-error">{cloneError}</p>
			{/if}

			<div class="omnivoice-modal-actions">
				<button class="btn btn-sm btn-secondary" onclick={closeCloneModal}>Cancel</button>
				<button
					class="btn btn-sm btn-primary"
					onclick={handleCloneVoice}
					disabled={cloneLoading}
				>
					{cloneLoading ? 'Cloning...' : 'Clone Voice'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.omnivoice-card {
		background: var(--bg-primary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		padding: 1rem;
		margin-top: 0.25rem;
	}


	.omnivoice-field {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.omnivoice-field:last-child {
		margin-bottom: 0;
	}

	.omnivoice-label {
		flex-wrap: wrap;
		gap: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.omnivoice-proxy-status {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
	}

	.omnivoice-dot {
		width: 8px;
		height: 8px;
		border-radius: var(--radius-full);
		background: var(--text-tertiary);
		flex-shrink: 0;
	}

	.omnivoice-dot-ok {
		background: var(--color-success);
	}

	.omnivoice-dot-warn {
		background: var(--color-warning);
	}

	.omnivoice-dot-err {
		background: var(--color-error);
	}

	/* ── Voice row ──────────────────────────────────────── */

	.omnivoice-voice-row {
		flex-wrap: wrap;
		display: flex;
		gap: 0.4rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.omnivoice-voice-row:last-child {
		margin-bottom: 0;
	}

	.omnivoice-voice-row .btn {
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* ── Voice Design ──────────────────────────────────── */

	.omnivoice-design-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-bottom: 0.3rem;
		flex-wrap: wrap;
	}

	.omnivoice-design-row:last-child {
		margin-bottom: 0;
	}

	.omnivoice-design-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
		width: auto;
		flex-shrink: 0;
		text-align: left;
	}

	.omnivoice-radio {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		font-size: 0.875rem;
		color: var(--text-secondary);
		cursor: pointer;
		white-space: normal;
	}

	.omnivoice-radio input {
		accent-color: var(--accent);
		margin: 0;
	}


	.omnivoice-slider {
		flex: 1;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.omnivoice-slider-val {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		width: 2.2em;
		text-align: center;
		font-family: var(--font-mono);
	}

	.omnivoice-design-grid-2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: start;
		gap: 0.75rem;
	}

	.omnivoice-design-grid-2 + .omnivoice-design-grid-2 {
		margin-top: 0.4rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border-subtle);
	}

	.omnivoice-design-grid-2 .omnivoice-design-row {
		flex-wrap: wrap;
		min-width: 0;
		margin-bottom: 0;
	}

	.omnivoice-design-grid-2 .omnivoice-design-label {
		width: auto;
		min-width: auto;
	}

	.omnivoice-advanced-slider {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.omnivoice-advanced-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
	}

	.omnivoice-advanced-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.omnivoice-advanced-row .omnivoice-slider {
		flex: 1;
		min-width: 0;
	}

	/* ── Spinner ────────────────────────────────────────── */

	.omnivoice-spinner {
		display: inline-block;
		width: 12px;
		height: 12px;
		border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: ov-spin 0.6s linear infinite;
		vertical-align: middle;
		margin-right: 0.25rem;
	}

	@keyframes ov-spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Error ──────────────────────────────────────────── */

	.omnivoice-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-top: 0.5rem;
		background: var(--color-error-bg, rgba(239, 68, 68, 0.12));
		color: var(--color-error);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-lg);
		font-size: 0.8rem;
	}

	.omnivoice-error-close {
		background: transparent;
		border: none;
		color: inherit;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.2rem;
	}

	/* ── Cloned voices ──────────────────────────────────── */


	/* ── Modal ──────────────────────────────────────────── */

	.omnivoice-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.omnivoice-modal-card {
		background: var(--bg-primary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg);
		padding: 1.25rem;
		width: 480px;
		max-width: calc(100vw - 32px);
		max-height: calc(100dvh - 32px);
		overflow-y: auto;
	}

	.omnivoice-modal-title {
		margin: 0 0 1rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.omnivoice-modal-field {
		margin-bottom: 0.75rem;
	}

	.omnivoice-modal-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
		margin-bottom: 0.3rem;
	}

	.omnivoice-modal-error {
		color: var(--color-error);
		font-size: 0.8rem;
		margin: 0.25rem 0;
	}

	.omnivoice-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.omnivoice-clone-textarea {
		resize: vertical;
		min-height: 5em;
		width: 100%;
		font-family: inherit;
	}

	.omnivoice-file-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.omnivoice-file-name {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.omnivoice-hidden-input {
		display: none;
	}

	@media (max-width: 640px) {
		.omnivoice-design-grid-2 { grid-template-columns: minmax(0, 1fr); gap: 0.75rem; }
		.omnivoice-field {
		min-width: 0; min-width: 0; }
		.omnivoice-voice-row .btn { min-height: 44px; }
	}
	@media (prefers-reduced-motion: reduce) { .omnivoice-spinner { animation: none; } }
</style>
