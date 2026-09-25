import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import type { ModuleDefinition, ModuleState, ModuleMetadata, ModuleWithState } from '$lib/types/module';

const STORAGE_PREFIX = STORAGE_INVENTORY.localStorageModulePrefix;

function createModulesStore() {
	let registry = $state<Map<string, ModuleDefinition>>(new Map());

	let moduleStates = $state<Map<string, ModuleState>>(new Map());

	// Sync module state across windows (main ↔ overlay)
	if (browser) {
		window.addEventListener('storage', (e) => {
			if (e.key?.startsWith(STORAGE_PREFIX) && e.newValue) {
				const moduleId = e.key.slice(STORAGE_PREFIX.length);
				try {
					const state = JSON.parse(e.newValue);
					moduleStates.set(moduleId, state);
					moduleStates = new Map(moduleStates);
				} catch {
					// Ignore malformed data
				}
			}
		});
	}

	// Derived: list of all modules with their current state
	const modulesList = $derived.by(() => {
		return Array.from(registry.entries()).map(([id, def]) => ({
			...def.metadata,
			state: moduleStates.get(id) ?? {
				enabled: false,
				configured: false,
				settings: {}
			}
		})) as ModuleWithState[];
	});

	// Derived: modules grouped by category
	const modulesByCategory = $derived.by(() => {
		const grouped = new Map<string, ModuleWithState[]>();
		for (const mod of modulesList) {
			const cat = mod.category;
			if (!grouped.has(cat)) {
				grouped.set(cat, []);
			}
			grouped.get(cat)!.push(mod);
		}
		return grouped;
	});

	// Derived: only configured modules
	const configuredModules = $derived.by(() => modulesList.filter((m) => m.state.configured));

	// Derived: enabled modules
	const enabledModules = $derived.by(() => modulesList.filter((m) => m.state.enabled));

	// Register a module
	function registerModule(definition: ModuleDefinition) {
		registry.set(definition.metadata.id, definition);
		registry = new Map(registry);

		// Load saved state from localStorage
		if (browser) {
			loadModuleState(definition.metadata.id);
		}
	}

	// Load module state from localStorage
	function loadModuleState(moduleId: string) {
		const key = `${STORAGE_PREFIX}${moduleId}`;
		const saved = localStorage.getItem(key);

		if (saved) {
			try {
				const state = JSON.parse(saved);
				moduleStates.set(moduleId, state);
				moduleStates = new Map(moduleStates);
			} catch (e) {
				console.error(`Failed to load state for module ${moduleId}:`, e);
				initDefaultState(moduleId);
			}
		} else {
			initDefaultState(moduleId);
		}
	}

	// Initialize default state for a module
	function initDefaultState(moduleId: string) {
		const definition = registry.get(moduleId);
		const defaultSettings: Record<string, unknown> = {};

		// Collect default values from schema
		if (definition?.settingsSchema) {
			for (const field of definition.settingsSchema.fields) {
				if (field.defaultValue !== undefined) {
					defaultSettings[field.key] = field.defaultValue;
				}
			}
		}

		moduleStates.set(moduleId, {
			enabled: false,
			configured: definition ? definition.isConfigured(defaultSettings) : false,
			settings: defaultSettings
		});
		moduleStates = new Map(moduleStates);
	}

	// Save module state to localStorage
	function saveModuleState(moduleId: string) {
		if (!browser) return;

		const state = moduleStates.get(moduleId);
		if (state) {
			const key = `${STORAGE_PREFIX}${moduleId}`;
			localStorage.setItem(key, JSON.stringify(state));
		}
	}

	// Get module definition
	function getModule(moduleId: string): ModuleDefinition | undefined {
		return registry.get(moduleId);
	}

	// Get module state
	function getModuleState(moduleId: string): ModuleState | undefined {
		return moduleStates.get(moduleId);
	}

	// Get module settings
	function getModuleSettings(moduleId: string): Record<string, unknown> {
		return moduleStates.get(moduleId)?.settings ?? {};
	}

	// Update module settings
	async function setModuleSettings(moduleId: string, settings: Record<string, unknown>) {
		const currentState = moduleStates.get(moduleId);
		const definition = registry.get(moduleId);

		if (!currentState || !definition) return;

		const newState: ModuleState = {
			...currentState,
			settings,
			configured: definition.isConfigured(settings)
		};

		moduleStates.set(moduleId, newState);
		moduleStates = new Map(moduleStates);
		saveModuleState(moduleId);

		// Notify module of settings change
		if (definition.onSettingsChange) {
			definition.onSettingsChange(settings);
		}
	}

	// Update a single setting
	function setModuleSetting(moduleId: string, key: string, value: unknown) {
		const currentSettings = getModuleSettings(moduleId);
		setModuleSettings(moduleId, { ...currentSettings, [key]: value });
	}

	// Enable/disable module
	async function setModuleEnabled(moduleId: string, enabled: boolean) {
		const currentState = moduleStates.get(moduleId);
		const definition = registry.get(moduleId);

		if (!currentState || !definition) return;

		try {
			if (enabled && definition.onEnable) {
				await definition.onEnable();
			} else if (!enabled && definition.onDisable) {
				await definition.onDisable();
			}

			moduleStates.set(moduleId, {
				...currentState,
				enabled,
				lastError: undefined
			});
			moduleStates = new Map(moduleStates);
			saveModuleState(moduleId);
		} catch (e) {
			moduleStates.set(moduleId, {
				...currentState,
				lastError: e instanceof Error ? e.message : 'Unknown error'
			});
			moduleStates = new Map(moduleStates);
		}
	}

	// Check if module is configured
	function isModuleConfigured(moduleId: string): boolean {
		return moduleStates.get(moduleId)?.configured ?? false;
	}

	// Check if module is enabled
	function isModuleEnabled(moduleId: string): boolean {
		return moduleStates.get(moduleId)?.enabled ?? false;
	}

	return {
		// Getters
		get modulesList() {
			return modulesList;
		},
		get modulesByCategory() {
			return modulesByCategory;
		},
		get configuredModules() {
			return configuredModules;
		},
		get enabledModules() {
			return enabledModules;
		},

		// Methods
		registerModule,
		getModule,
		getModuleState,
		getModuleSettings,
		setModuleSettings,
		setModuleSetting,
		setModuleEnabled,
		isModuleConfigured,
		isModuleEnabled
	};
}

export const modulesStore = createModulesStore();
