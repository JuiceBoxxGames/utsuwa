import { db } from '$lib/db';
import { cosineSimilarity } from '$lib/services/embeddings';
import { hasCurrentEmbedding } from '$lib/engine/embedding-version';
import type { Fact, FactCategory } from '$lib/types/memory';

export interface GraphNode {
	id: number;
	content: string;
	category: FactCategory;
	importance: number;
	confidence?: number;
	referenceCount: number;
	createdAt: Date;
	lastAccessed?: Date;
	x?: number;
	y?: number;
}

export interface GraphLink {
	source: number;
	target: number;
	similarity: number;
}

export interface GraphData {
	nodes: GraphNode[];
	links: GraphLink[];
}

export interface GraphFilters {
	categories: Set<FactCategory>;
	minSimilarity: number;
}

// Get all facts with current-model embeddings from the database. Stale-model
// vectors are excluded: their similarities against current vectors are noise.
export async function getFactsWithEmbeddings(): Promise<Fact[]> {
	const allFacts = await db.facts.toArray();
	return allFacts.filter((fact) => hasCurrentEmbedding(fact)) as Fact[];
}

// Build graph data from facts
export function buildGraph(facts: Fact[], threshold = 0.5): GraphData {
	const nodes: GraphNode[] = facts.map((fact) => ({
		id: fact.id!,
		content: fact.content,
		category: fact.category,
		importance: fact.importance,
		confidence: fact.confidence,
		referenceCount: fact.referenceCount,
		createdAt: fact.createdAt,
		lastAccessed: fact.lastAccessed
	}));

	const links: GraphLink[] = [];

	// Calculate pairwise similarities
	for (let i = 0; i < facts.length; i++) {
		for (let j = i + 1; j < facts.length; j++) {
			const factA = facts[i];
			const factB = facts[j];

			if (factA.embedding && factB.embedding) {
				const similarity = cosineSimilarity(factA.embedding, factB.embedding);

				if (similarity >= threshold) {
					links.push({
						source: factA.id!,
						target: factB.id!,
						similarity
					});
				}
			}
		}
	}

	return { nodes, links };
}

// Filter graph data by categories
export function filterGraph(data: GraphData, filters: GraphFilters): GraphData {
	const filteredNodes = data.nodes.filter((node) => filters.categories.has(node.category));
	const nodeIds = new Set(filteredNodes.map((n) => n.id));

	const filteredLinks = data.links.filter(
		(link) =>
			nodeIds.has(link.source) &&
			nodeIds.has(link.target) &&
			link.similarity >= filters.minSimilarity
	);

	return { nodes: filteredNodes, links: filteredLinks };
}

// Get connected node IDs for a given node
export function getConnectedNodes(data: GraphData, nodeId: number): Set<number> {
	const connected = new Set<number>();

	for (const link of data.links) {
		if (link.source === nodeId) {
			connected.add(link.target);
		} else if (link.target === nodeId) {
			connected.add(link.source);
		}
	}

	return connected;
}

// Category colors
export const categoryColors: Record<FactCategory, string> = {
	user: '#04b2fd',
	relationship: '#ff477f',
	shared_experience: '#34d399'
};
