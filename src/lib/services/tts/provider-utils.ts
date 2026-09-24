// Pure TTS provider helpers, dependency-free so they run under node --test.

// Voice ids are provider-specific (a Kokoro voice id means nothing to
// ElevenLabs), so provider switches reset the voice to the new provider's
// first declared voice. Empty means "let the provider use its own default".
export function defaultVoiceForProvider(
	provider?: { voices?: Array<{ id: string }> } | null
): string {
	return provider?.voices?.[0]?.id ?? '';
}

// Until 0.13.1 the ElevenLabs "custom voice id" box wrote to the provider
// config while the pipeline read the speech module's activeVoiceId, which the
// provider switch had already set to the first declared voice. Returns the
// legacy id to move across when it was never in effect, otherwise null.
export function legacyVoiceToAdopt(
	activeProvider: string | undefined,
	activeVoiceId: string | undefined,
	legacyVoiceId: string | undefined,
	provider?: { voices?: Array<{ id: string }> } | null
): string | null {
	if (activeProvider !== 'elevenlabs') return null;
	const legacy = legacyVoiceId?.trim();
	if (!legacy) return null;
	const current = activeVoiceId ?? '';
	if (current !== '' && current !== defaultVoiceForProvider(provider)) return null;
	return legacy;
}

const MAX_DETAIL_LENGTH = 160;

// Builds a human-readable error out of a TTS API failure, keeping the API's
// own explanation (e.g. ElevenLabs' "voice_not_found") instead of just the
// status code, so the failure is self-diagnosing in the UI and the console.
export function providerErrorMessage(provider: string, status: number, body?: unknown): string {
	const detail = extractDetail(body);
	return detail ? `${provider} error ${status}: ${detail}` : `${provider} error ${status}`;
}

function extractDetail(body: unknown): string {
	if (!body) return '';
	if (typeof body === 'string') return body.slice(0, MAX_DETAIL_LENGTH);
	if (typeof body !== 'object') return '';

	const record = body as Record<string, unknown>;

	// ElevenLabs: { detail: { message, status, ... } }
	const detail = record.detail;
	if (detail && typeof detail === 'object') {
		const message = (detail as Record<string, unknown>).message;
		if (typeof message === 'string') return message.slice(0, MAX_DETAIL_LENGTH);
		const statusText = (detail as Record<string, unknown>).status;
		if (typeof statusText === 'string') return statusText.slice(0, MAX_DETAIL_LENGTH);
	}

	// OpenAI-style: { error: { message } }
	const error = record.error;
	if (error && typeof error === 'object') {
		const message = (error as Record<string, unknown>).message;
		if (typeof message === 'string') return message.slice(0, MAX_DETAIL_LENGTH);
	}

	// Generic: { message }
	if (typeof record.message === 'string') return record.message.slice(0, MAX_DETAIL_LENGTH);

	return '';
}

// A local engine that rejects the page origin fails as a thrown fetch, same as
// a refused connection. Web builds get one retry through /api/tts/local; the
// desktop build has no server routes, and an abort is not a failure to retry.
export function shouldProxyLocalTts(opts: {
	isLocal: boolean;
	isTauri: boolean;
	directFailedAtNetwork: boolean;
}): boolean {
	return opts.isLocal && !opts.isTauri && opts.directFailedAtNetwork;
}
