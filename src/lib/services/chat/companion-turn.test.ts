import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Companion-turn unit test with the real response parser and prompt builder;
// only stores, persistence and the extraction LLM call are replaced. Picture
// intent is app-driven and inline-only; generic state recovery still runs when
// the model skips the whole state block.
test('processCompanionTurn surfaces inline picture intent and keeps generic recovery separate', async (t) => {
	const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');

	const characterState = {
		name: 'Utsuwa',
		appMode: 'dating_sim',
		completedEvents: [] as string[],
		energy: 80,
		mood: { primary: 'content', intensity: 50 },
		affection: 10,
		trust: 10,
		intimacy: 0,
		comfort: 0,
		respect: 0
	};

	let extractionResponses: string[] = [];
	const extractionSysPrompts: string[] = [];
	const extractionUserPrompts: string[] = [];
	const appliedUpdates: unknown[] = [];

	const fixtures = {
		// No motions offered, so the extraction prompt stays free of action fields.
		animationLibraryStore: { enabledForLlm: [] as { id: string; description: string }[] },
		characterStore: {
			state: characterState,
			get appMode() {
				return characterState.appMode;
			},
			applyUpdates: (updates: unknown) => {
				appliedUpdates.push(updates);
			},
			setRelationshipStage: () => {}
		},
		vrmStore: { requestFlash: () => {} },
		reminderStore: { addReminder: async () => {} },
		dismissedEventIds: new Set<string>(),
		requestAvatarAction: () => {},
		memoryApi: { createFact: async () => {} },
		determineFactCategory: () => 'general',
		calculateFactImportance: () => 1,
		recordTurn: async () => {},
		ensureSession: async () => null,
		checkAllEvents: () => [],
		checkEvent: () => ({ triggered: false }),
		eventsApi: { getCompletedEvents: async () => [] },
		analyzeMessage: () => ({ sentiment: 0, nonLatinDominant: false }),
		calculateBaselineUpdates: () => ({}),
		mergeUpdates: (_baseline: unknown, llm: unknown) => llm ?? {},
		checkAndApplyStageTransition: () => ({ transitioned: false }),
		completeJson: async (opts: { system: string; user: string }) => {
			extractionSysPrompts.push(opts.system);
			extractionUserPrompts.push(opts.user);
			return extractionResponses.shift() ?? null;
		}
	};
	(globalThis as unknown as Record<string, unknown>).__utsuwaTurnTest = fixtures;

	const replacements: Record<string, string> = {
		'src/lib/stores/character.svelte': 'export const characterStore = globalThis.__utsuwaTurnTest.characterStore;',
		'src/lib/stores/vrm.svelte': 'export const vrmStore = globalThis.__utsuwaTurnTest.vrmStore;',
		'src/lib/stores/reminders.svelte': 'export const reminderStore = globalThis.__utsuwaTurnTest.reminderStore;',
		'src/lib/services/session/event-session.svelte': 'export const dismissedEventIds = globalThis.__utsuwaTurnTest.dismissedEventIds;',
		'src/lib/engine/heuristics': 'export const analyzeMessage = (...a) => globalThis.__utsuwaTurnTest.analyzeMessage(...a); export const calculateBaselineUpdates = (...a) => globalThis.__utsuwaTurnTest.calculateBaselineUpdates(...a);',
		'src/lib/engine/state-updates': 'export const mergeUpdates = (...a) => globalThis.__utsuwaTurnTest.mergeUpdates(...a); export const checkAndApplyStageTransition = (...a) => globalThis.__utsuwaTurnTest.checkAndApplyStageTransition(...a);',
		'src/lib/engine/memory': 'export const memoryApi = globalThis.__utsuwaTurnTest.memoryApi; export const determineFactCategory = (...a) => globalThis.__utsuwaTurnTest.determineFactCategory(...a); export const calculateFactImportance = (...a) => globalThis.__utsuwaTurnTest.calculateFactImportance(...a);',
		'src/lib/engine/memory-session': 'export const recordTurn = (...a) => globalThis.__utsuwaTurnTest.recordTurn(...a); export const ensureSession = (...a) => globalThis.__utsuwaTurnTest.ensureSession(...a);',
		'src/lib/engine/event-matching': 'export const checkAllEvents = (...a) => globalThis.__utsuwaTurnTest.checkAllEvents(...a); export const checkEvent = (...a) => globalThis.__utsuwaTurnTest.checkEvent(...a);',
		'src/lib/engine/events': 'export const eventsApi = globalThis.__utsuwaTurnTest.eventsApi;',
		'src/lib/data/events': 'export const allEvents = []; export const relationshipStrainEvent = { id: "strain" };',
		'src/lib/services/llm/transport': 'export const completeJson = (...a) => globalThis.__utsuwaTurnTest.completeJson(...a);',
		'src/lib/services/animation-actions': 'export const requestAvatarAction = (...a) => globalThis.__utsuwaTurnTest.requestAvatarAction(...a);',
		'src/lib/stores/animation-library.svelte': 'export const animationLibraryStore = globalThis.__utsuwaTurnTest.animationLibraryStore;'
	};

	const server = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		resolve: {
			alias: [
				...Object.keys(replacements).map((key) => ({
					find: key.replace('src/lib/', '$lib/'),
					replacement: '\0turn-test:' + key
				})),
				{ find: '$lib', replacement: `${root}/src/lib` }
			]
		},
		optimizeDeps: { noDiscovery: true, entries: [] },
		plugins: [
			{
				name: 'turn-test-replacements',
				resolveId(id) {
					if (id.startsWith('\0turn-test:')) return id;
					const key = id.startsWith(`${root}/`) ? id.slice(root.length + 1).replace(/\.ts$/, '') : id;
					if (key in replacements) return '\0turn-test:' + key;
				},
				load(id) {
					if (id.startsWith('\0turn-test:')) return replacements[id.slice('\0turn-test:'.length)];
				}
			}
		]
	});

	const llm = { provider: 'openai-compatible', model: 'test-model', apiKey: 'test-key', baseUrl: 'https://provider.invalid/v1/', hasImages: false };

	try {
		const { processCompanionTurn } = await server.ssrLoadModule('/src/lib/services/chat/companion-turn.ts');

		await t.test('reads image_search and image_page from an inline state block', async () => {
			extractionResponses = [];
			extractionSysPrompts.length = 0;
			const raw = 'With pleasure! Here are a few sweet cats.\n```json\n{"mood_change":{"emotion":"happy"},"image_search":"cute cats","image_page":2}\n```';
			const result = await processCompanionTurn({ userMessage: 'show me more cats', companionResponse: raw, llm });
			assert.equal(result.imageSearch, 'cute cats');
			assert.equal(result.imagePage, 2);
			assert.equal(result.closeImages, undefined);
			assert.equal(result.dialogue, 'With pleasure! Here are a few sweet cats.');
			assert.equal(extractionSysPrompts.length, 0, 'no extraction call when the inline block parses');
		});

		await t.test('a missing state block recovers query-only picture intent', async () => {
			extractionResponses = ['{"mood_change":{"emotion":"neutral","intensity_delta":0},"new_memory":null,"image_search":"Katzen","image_page":2}'];
			extractionSysPrompts.length = 0;
			extractionUserPrompts.length = 0;
			const result = await processCompanionTurn({
				userMessage: 'zeig mir süße Katzen',
				companionResponse: 'Hier ist ein süßes Katzenbild für dich.',
				llm,
				showImagesEnabled: true
			});
			assert.equal(extractionSysPrompts.length, 1, 'generic extraction ran');
			assert.equal(result.imageSearch, 'Katzen');
			assert.equal(result.imagePage, 2);
			assert.ok(extractionSysPrompts[0].includes('"image_search"'));
			assert.ok(!extractionSysPrompts[0].includes('"show_images"'));
			assert.ok(!extractionUserPrompts[0].includes('show_images'));
		});

		await t.test('close_images flows through, and a turn with no intent stays undefined', async () => {
			const closing = await processCompanionTurn({
				userMessage: 'close the pictures',
				companionResponse: 'Sure!\n```json\n{"close_images":true}\n```',
				llm
			});
			assert.equal(closing.closeImages, true);
			assert.equal(closing.imageSearch, undefined);

			const plain = await processCompanionTurn({
				userMessage: 'how was your day?',
				companionResponse: 'It was calm.\n```json\n{"mood_change":{"emotion":"content"}}\n```',
				llm
			});
			assert.equal(plain.imageSearch, undefined);
			assert.equal(plain.imagePage, undefined);
			assert.equal(plain.closeImages, undefined);
		});
	} finally {
		await server.close();
	}
});
