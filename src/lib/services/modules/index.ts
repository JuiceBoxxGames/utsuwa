import type { ModuleDefinition } from '$lib/types/module';
import { consciousnessModule } from './essential/consciousness';
import { speechModule } from './essential/speech';
import { visionModule } from './essential/vision';

// Registry of all available modules
export const moduleRegistry: ModuleDefinition[] = [
	// Essential modules
	consciousnessModule,
	speechModule,
	visionModule
];
