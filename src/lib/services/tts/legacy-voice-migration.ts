import { modulesStore } from '$lib/stores/modules.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';
import { getTTSProvider } from '$lib/services/providers/registry';
import { legacyVoiceToAdopt } from './provider-utils';

// One-time move of the old ElevenLabs "custom voice id" into the speech
// module's activeVoiceId, which is the slot the pipeline actually reads.
// Runs once per app start after the modules have loaded their state; the
// legacy slot is cleared either way so this can never re-fire later.
export function migrateLegacyElevenLabsVoice(): void {
	const legacy = settingsStore.getProviderConfig('elevenlabs').voiceId;
	if (legacy === undefined) return;

	const speech = modulesStore.getModuleSettings('speech');
	const adopt = legacyVoiceToAdopt(
		speech.activeProvider,
		speech.activeVoiceId,
		legacy,
		getTTSProvider('elevenlabs')
	);
	if (adopt) modulesStore.setModuleSetting('speech', 'activeVoiceId', adopt);
	settingsStore.setProviderConfig('elevenlabs', { voiceId: undefined });
}
