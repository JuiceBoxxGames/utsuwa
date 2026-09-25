// HTTP calls the OmniVoice settings page makes to the user's local proxy.
// baseUrl is the normalized TTS base (ends in /v1/). The key is sent as Bearer
// for proxies running with OMNIVOICE_AUTH_TOKEN; /health stays open.

export interface OmniVoiceConnection {
	baseUrl: string;
	apiKey?: string;
}

export interface ClonedVoice {
	id: string;
	name: string;
}

export type ProxyStatus = 'connected' | 'connecting' | 'disconnected';

export interface PreviewParams {
	input: string;
	language: string;
	voice?: string;
	instructions?: string;
	speed: number;
	numStep: number;
	positionTemperature: number;
	classTemperature: number;
}

export type PreviewBody = Record<string, string | number>;

function auth(conn: OmniVoiceConnection): Record<string, string> {
	return conn.apiKey ? { Authorization: `Bearer ${conn.apiKey}` } : {};
}

function postJson(conn: OmniVoiceConnection, path: string, body: object): Promise<Response> {
	return fetch(conn.baseUrl + path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...auth(conn) },
		body: JSON.stringify(body)
	});
}

async function failure(res: Response, fallback: string): Promise<Error> {
	const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
	return new Error((err as { detail?: string } | null)?.detail || fallback);
}

export async function checkHealth(baseUrl: string): Promise<ProxyStatus> {
	try {
		const url = baseUrl.replace(/\/v1\/$/, '').replace(/\/+$/, '') + '/health';
		const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
		return res.ok ? 'connected' : res.status === 503 ? 'connecting' : 'disconnected';
	} catch {
		return 'disconnected';
	}
}

/** null when the proxy answered with an error, so callers can keep what they have. */
export async function listClones(conn: OmniVoiceConnection): Promise<ClonedVoice[] | null> {
	const res = await fetch(conn.baseUrl + 'voices', { headers: auth(conn) });
	if (!res.ok) return null;
	const data = (await res.json()) as { clones?: ClonedVoice[] };
	return data.clones || [];
}

export async function initializeProfile(
	conn: OmniVoiceConnection,
	profile: { voice: string; instructions: string; language: string }
): Promise<void> {
	const res = await postJson(conn, 'voices/initialize', profile);
	if (!res.ok) throw await failure(res, `Profile init failed (HTTP ${res.status})`);
}

export async function resetProfile(
	conn: OmniVoiceConnection,
	{ voice, language, instructions }: { voice: string; language: string; instructions?: string }
): Promise<void> {
	const res = await postJson(conn, 'voices/profile/reset', {
		voice,
		language,
		...(instructions ? { instructions } : {})
	});
	if (!res.ok) throw await failure(res, `Profile reset failed (HTTP ${res.status})`);
}

export async function cloneVoice(
	conn: OmniVoiceConnection,
	{ voiceId, refAudio, refText }: { voiceId: string; refAudio: File; refText: string }
): Promise<void> {
	const form = new FormData();
	form.append('voice_id', voiceId);
	form.append('ref_audio', refAudio);
	form.append('ref_text', refText);
	const res = await fetch(conn.baseUrl + 'voices/clone', {
		method: 'POST',
		headers: auth(conn),
		body: form
	});
	if (!res.ok) throw await failure(res, `HTTP ${res.status}`);
}

export async function deleteClone(conn: OmniVoiceConnection, cloneId: string): Promise<void> {
	await fetch(conn.baseUrl + 'voices/clone/' + cloneId, { method: 'DELETE', headers: auth(conn) });
}

export function previewBody(p: PreviewParams): PreviewBody {
	return {
		model: 'omnivoice',
		input: p.input,
		response_format: 'wav',
		language: p.language,
		...(p.voice ? { voice: p.voice } : {}),
		...(p.instructions ? { instructions: p.instructions } : {}),
		speed: p.speed,
		num_step: p.numStep,
		position_temperature: p.positionTemperature,
		class_temperature: p.classTemperature
	};
}

export async function synthesize(conn: OmniVoiceConnection, body: PreviewBody): Promise<ArrayBuffer> {
	const res = await postJson(conn, 'audio/speech', body);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.arrayBuffer();
}
