// Turns raw provider failures into short, readable messages. A misconfigured
// base URL usually points at a website, so the failure body is a full HTML
// page — never show that to the user.

const HTML_MARKERS = ['<!doctype', '<html', '<head>', '<body'];
const MAX_ERROR_LENGTH = 240;

export function looksLikeHtml(text: string | null | undefined): boolean {
	if (!text) return false;
	const head = text.slice(0, 500).trim().toLowerCase();
	return HTML_MARKERS.some((marker) => head.includes(marker));
}

export function htmlEndpointError(baseURL?: string): string {
	const at = baseURL ? ` at ${baseURL}` : '';
	return `The endpoint${at} returned a web page instead of an API response. Double-check the base URL (for OpenAI it's https://api.openai.com/v1/).`;
}

/** The provider's own message from a failed response body, whatever its shape. */
export function providerBodyMessage(status: number, body: string): string {
	try {
		const parsed = JSON.parse(body);
		// Gemini's OpenAI endpoint wraps the error in an array
		const err = Array.isArray(parsed) ? parsed[0] : parsed;
		const message = err?.error?.message ?? (typeof err?.error === 'string' ? err.error : err?.message);
		if (typeof message === 'string' && message.trim()) return message;
	} catch {
		// Not JSON, fall back to the status
	}
	return `Provider error (${status})`;
}

// xsai reports HTTP failures as "Remote sent 401 response: <raw body>"
const XSAI_REMOTE_ERROR = /^Remote sent (\d{3}) response: ([\s\S]*)$/;

/** Collapse HTML dumps and cap length so an error can't flood the UI. */
export function sanitizeProviderError(message: string, baseURL?: string): string {
	const remote = XSAI_REMOTE_ERROR.exec(message);
	if (remote && !looksLikeHtml(remote[2])) message = providerBodyMessage(Number(remote[1]), remote[2]);
	if (looksLikeHtml(message)) return htmlEndpointError(baseURL);
	if (message.length > MAX_ERROR_LENGTH) return `${message.slice(0, MAX_ERROR_LENGTH)}…`;
	return message;
}
