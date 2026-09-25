/** An image the user showed her, for display in the message (object URL + keepsake id). */
export interface ShownImage {
	id: string;
	url: string;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	images?: ShownImage[];
}

function createChatStore() {
	let messages = $state<Message[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function addMessage(role: 'user' | 'assistant' | 'system', content: string, images?: ShownImage[]) {
		const message: Message = {
			id: crypto.randomUUID(),
			role,
			content,
			timestamp: new Date(),
			...(images?.length ? { images } : {})
		};
		messages = [...messages, message];
		return message;
	}

	function updateLastMessage(content: string) {
		const last = messages[messages.length - 1];
		if (last && last.role === 'assistant') {
			// Runs per streamed chunk: replace only the last element instead of
			// rebuilding the whole array on every token
			messages = [...messages.slice(0, -1), { ...last, content }];
		}
	}

	function setLoading(loading: boolean) {
		isLoading = loading;
		// A turn stopped or failed before any text leaves its placeholder reply behind
		const last = messages[messages.length - 1];
		if (!loading && last?.role === 'assistant' && !last.content && !last.images?.length) {
			messages = messages.slice(0, -1);
		}
		if (!loading && remoteQueue.length) {
			const queued = remoteQueue.splice(0);
			for (const m of queued) addMessage(m.role, m.content);
		}
	}

	// Turns from the other window (app or overlay). While a reply streams here
	// they wait, or the streamed text would land on the wrong bubble.
	const remoteQueue: Array<{ role: 'user' | 'assistant'; content: string }> = [];
	function addRemoteMessage(role: 'user' | 'assistant', content: string) {
		if (isLoading) remoteQueue.push({ role, content });
		else addMessage(role, content);
	}

	function setError(err: string | null) {
		error = err;
	}

	function clearMessages() {
		messages = [];
	}

	return {
		get messages() {
			return messages;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		addMessage,
		addRemoteMessage,
		updateLastMessage,
		setLoading,
		setError,
		clearMessages
	};
}

export const chatStore = createChatStore();
