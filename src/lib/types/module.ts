/**
 * Module System types
 */

export type ModuleCategory = 'essential' | 'messaging' | 'gaming' | 'creative' | 'utility';

/**
 * Module metadata for display and discovery
 */
export interface ModuleMetadata {
	id: string;
	name: string;
	description: string;
	category: ModuleCategory;
	icon: string;
	version?: string;
	author?: string;
	requiresConfig?: boolean;
}

/**
 * Runtime state of a module
 */
export interface ModuleState {
	enabled: boolean;
	configured: boolean;
	settings: Record<string, unknown>;
	lastError?: string;
}

/**
 * Settings field types for UI generation
 */
export type ModuleSettingsFieldType = 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea' | 'provider-select' | 'model-select';

/**
 * Provider category for provider-select fields
 */
export type ProviderSelectCategory = 'llm' | 'tts' | 'stt';

/**
 * Single settings field definition
 */
export interface ModuleSettingsField {
	key: string;
	label: string;
	type: ModuleSettingsFieldType;
	required?: boolean;
	placeholder?: string;
	description?: string;
	options?: { value: string; label: string }[];
	min?: number;
	max?: number;
	// For provider-select fields
	providerCategory?: ProviderSelectCategory;
	// For model-select fields - references the provider field key
	dependsOnField?: string;
}

/**
 * Settings schema for generating settings UI
 */
export interface ModuleSettingsSchema {
	fields: ModuleSettingsField[];
}

/**
 * Full module definition
 */
export interface ModuleDefinition {
	metadata: ModuleMetadata;

	// Settings schema for UI generation
	settingsSchema?: ModuleSettingsSchema;

	// Lifecycle hooks
	onEnable?: () => Promise<void>;
	onDisable?: () => Promise<void>;
	onSettingsChange?: (settings: Record<string, unknown>) => void;

	// Check if module is properly configured
	isConfigured: (settings: Record<string, unknown>) => boolean;
}

/**
 * Module with its current state (for UI display)
 */
export interface ModuleWithState extends ModuleMetadata {
	state: ModuleState;
}
