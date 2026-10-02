/**
 * Persona Store - Thin wrapper around characterStore for backwards compatibility.
 *
 * In the unified single-companion architecture, persona data (name, systemPrompt, extensions)
 * is stored directly in the CharacterState in IndexedDB. This store provides a familiar
 * API for accessing and updating persona fields.
 */

import { characterStore } from './character.svelte';
import type { PersonaExtensions } from '$lib/types/character';

/**
 * PersonaCard interface for compatibility with legacy code.
 * Now derived from CharacterState fields.
 */
export interface PersonaCard {
	id: string;
	name: string;
	systemPrompt: string;
	/** Replaces the built-in framing at the top of the prompt. Empty uses the default. */
	customSystemPrompt?: string;
	extensions: PersonaExtensions;
}

function createPersonaStore() {
	// Derived card from character state
	const activeCard = $derived.by((): PersonaCard => ({
		id: 'default',
		name: characterStore.name,
		systemPrompt: characterStore.systemPrompt,
		customSystemPrompt: characterStore.state.customSystemPrompt,
		extensions: characterStore.extensions
	}));

	// Update name
	function updateName(name: string): void {
		characterStore.updatePersona({ name });
	}

	// Update system prompt
	function updateSystemPrompt(systemPrompt: string): void {
		characterStore.updatePersona({ systemPrompt });
	}

	// Update extensions
	function updateExtensions(extensions: PersonaExtensions): void {
		characterStore.updatePersona({ extensions });
	}

	// Update card (all fields at once)
	function updateCard(updates: Partial<Omit<PersonaCard, 'id'>>): void {
		characterStore.updatePersona({
			name: updates.name,
			systemPrompt: updates.systemPrompt,
			customSystemPrompt: updates.customSystemPrompt,
			extensions: updates.extensions
		});
	}

	return {
		// Always 'default' - single persona system
		get activeId() {
			return 'default';
		},

		// The active (and only) persona card
		get activeCard() {
			return activeCard;
		},

		// Loading state from character store
		get isLoading() {
			return characterStore.isLoading;
		},

		// Convenience accessors
		get name() {
			return characterStore.name;
		},
		get systemPrompt() {
			return characterStore.systemPrompt;
		},
		get extensions() {
			return characterStore.extensions;
		},

		// Update methods
		updateName,
		updateSystemPrompt,
		updateExtensions,
		updateCard
	};
}

export const personaStore = createPersonaStore();
