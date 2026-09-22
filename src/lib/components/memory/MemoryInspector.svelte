<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Select from '$lib/components/ui/Select.svelte';
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db';
	import { memoryApi, getWorkingMemory } from '$lib/engine/memory';
	import { deleteFact } from '$lib/services/storage/memory';
	import { characterStore } from '$lib/stores/character.svelte';
	import type { Fact, FactCategory, SessionSummary, ConversationTurn } from '$lib/types/memory';
	import { Button } from '$lib/components/ui';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import MemoryFactSummary from './MemoryFactSummary.svelte';
	import ParserTest from '$lib/components/memory/ParserTest.svelte';

	let {
		view,
		factId,
		onShowAll,
		content = $bindable(''),
		newCategory = $bindable<FactCategory>('user'),
		importance = $bindable(50),
		busy = $bindable(false)
	}: {
		view: 'facts' | 'session' | 'sessions' | 'state' | 'test';
		factId?: number;
		onShowAll?: () => void;
		content?: string;
		newCategory?: FactCategory;
		importance?: number;
		busy?: boolean;
	} = $props();
	const tab = $derived(view);
	const categories: { value: FactCategory; label: string }[] = [
		{ value: 'user', label: 'About you' },
		{ value: 'relationship', label: 'Relationship' },
		{ value: 'shared_experience', label: 'Shared experience' }
	];
	const PAGE_SIZE = 25;
	let query = $state('');
	let category = $state('all');
	let pageIndex = $state(0);
	let facts = $state<Fact[]>([]);
	let sessions = $state<SessionSummary[]>([]);
	let turns = $state<ConversationTurn[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadError = $state('');
	let retry = $state(0);
	let confirmId = $state<number>();
	let notice = $state('');
	let actionError = $state('');
	const charState = $derived(characterStore.state);

	$effect(() => {
		void tab;
		void factId;
		void query;
		void category;
		pageIndex = 0;
		confirmId = undefined;
	});
	$effect(() => {
		const selectedId = factId;
		const selected = tab,
			search = query.trim().toLocaleLowerCase(),
			filter = category,
			offset = pageIndex * PAGE_SIZE;
		void retry;
		if (selected === 'state' || selected === 'test') return;
		loading = true;
		loadError = '';
		const subscription = liveQuery(async () => {
			if (selected === 'facts') {
				const collection = db.facts
					.orderBy('createdAt')
					.reverse()
					.filter(
						(fact) =>
							(selectedId === undefined || fact.id === selectedId) &&
							(filter === 'all' || fact.category === filter) &&
							fact.content.toLocaleLowerCase().includes(search)
					);
				return {
					facts: await collection.clone().offset(offset).limit(PAGE_SIZE).toArray(),
					total: await collection.count()
				};
			}
			if (selected === 'sessions') {
				return {
					sessions: await db.sessions
						.orderBy('startedAt')
						.reverse()
						.offset(offset)
						.limit(PAGE_SIZE)
						.toArray(),
					total: await db.sessions.count()
				};
			}
			const activeId =
				getWorkingMemory().currentSessionId ??
				(await db.sessions.orderBy('startedAt').reverse().first())?.id;
			if (activeId === undefined) return { turns: [], total: 0 };
			const collection = db.conversationTurns.where('sessionId').equals(activeId);
			return {
				turns: await collection.clone().offset(offset).limit(PAGE_SIZE).toArray(),
				total: await collection.count()
			};
		}).subscribe({
			next: (data) => {
				facts = 'facts' in data ? (data.facts ?? []) : [];
				sessions = 'sessions' in data ? (data.sessions ?? []) : [];
				turns = 'turns' in data ? (data.turns ?? []) : [];
				total = data.total;
				loading = false;
				if (offset >= total && pageIndex > 0)
					pageIndex = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
			},
			error: () => {
				loadError = 'Could not load memories from this device.';
				loading = false;
			}
		});
		return () => subscription.unsubscribe();
	});

	async function addMemory(event: SubmitEvent) {
		event.preventDefault();
		const text = content.trim();
		if (!text || busy || text.length > 2000) return;
		busy = true;
		notice = '';
		actionError = '';
		try {
			await memoryApi.createFact({
				content: text,
				category: newCategory,
				importance,
				confidence: 1,
				source: 'manual'
			});
			content = '';
			pageIndex = 0;
			query = '';
			category = 'all';
			notice = 'Memory saved.';
			if (factId !== undefined) onShowAll?.();
		} catch {
			actionError = 'Could not save that memory. Your text is still here so you can try again.';
		} finally {
			busy = false;
		}
	}
	async function removeMemory(id: number) {
		if (busy) return;
		busy = true;
		notice = '';
		actionError = '';
		try {
			await deleteFact(id);
			confirmId = undefined;
			notice = 'Memory deleted.';
		} catch {
			actionError = 'Could not delete that memory. Please try again.';
		} finally {
			busy = false;
		}
	}
	function date(value: Date | undefined) {
		return value ? new Date(value).toLocaleString() : 'Not recorded';
	}
</script>

<div class="memory-inspector">
	{#if factId !== undefined && view === 'facts'}<div class="selection-notice">
			<span>Selected from the graph</span><Button variant="secondary" size="sm" onclick={onShowAll}
				>Show all facts</Button
			>
		</div>{/if}
	{#if view === 'facts'}
		<SettingsSection
			title="Remembered facts"
			description="Stored on this device. Adding or deleting a fact affects future conversations."
		>
			<div class="filters">
				<label
					>Search memories<input
						class="settings-field"
						type="search"
						bind:value={query}
						placeholder="Find a memory"
					/></label
				>
				<label
					>Category<Select label="Category" bind:value={category} options={[{ value: 'all', label: 'All categories' }, ...categories]} /></label
				>
			</div>
			{#if !loading && !loadError && facts.length === 0}<p class="empty">
					{query || category !== 'all'
						? 'No memories match these filters.'
						: factId !== undefined
							? 'This memory is no longer saved. Choose Show all facts to see your other memories.'
							: 'No facts saved yet. Add one below or let them grow through conversation.'}
				</p>{/if}
			<ul class="records">
				{#each facts as fact (fact.id)}
					<li>
						<MemoryFactSummary {fact} />
						<div class="record-footer">
							<time>{date(fact.createdAt)}</time>
							{#if confirmId === fact.id}
								<div class="confirm" role="group" aria-label="Confirm memory deletion">
									<span>Delete this memory?</span><Button
										size="sm"
										variant="secondary"
										disabled={busy}
										onclick={() => (confirmId = undefined)}>Cancel</Button
									><Button
										size="sm"
										variant="danger"
										disabled={busy}
										onclick={() => removeMemory(fact.id!)}>Delete memory</Button
									>
								</div>
							{:else}<Button
									size="sm"
									variant="ghost"
									disabled={busy}
									onclick={() => (confirmId = fact.id)}>Delete</Button
								>{/if}
						</div>
					</li>
				{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'session'}
		<SettingsSection
			title="Current session"
			description="Saved turns from this run, or the latest saved session after a reload."
		>
			{#if !loading && !turns.length}<p class="empty">
					No saved turns in the current session.
				</p>{/if}
			<ul class="records">
				{#each turns as turn (turn.id)}<li>
						<p class="metadata">
							{turn.role === 'user' ? 'You' : characterStore.name} · {date(turn.createdAt)}
						</p>
						<p class="fact-content">{turn.content}</p>
					</li>{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'sessions'}
		<SettingsSection
			title="Saved sessions"
			description="Conversation summaries already recorded by the memory engine."
		>
			{#if !loading && !sessions.length}<p class="empty">No sessions saved yet.</p>{/if}
			<ul class="records">
				{#each sessions as session (session.id)}<li>
						<h4>{date(session.startedAt)}</h4>
						<p class="fact-content">{session.summary || 'No summary recorded yet.'}</p>
						<p class="metadata">
							{session.messageCount} messages · {session.endedAt
								? `Last turn ${date(session.endedAt)}`
								: 'No turns recorded'}
						</p>
						{#if session.keyTopics.length}<p class="metadata">
								Topics: {session.keyTopics.join(', ')}
							</p>{/if}{#if session.emotionalArc}<p>{session.emotionalArc}</p>{/if}
					</li>{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'state'}
		<SettingsSection
			title="Character state"
			description="A read-only view of your companion's current state."
		>
			<dl>
				<dt>Name</dt>
				<dd>{charState.name}</dd>
				<dt>Mode</dt>
				<dd>{charState.appMode === 'companion' ? 'Companion' : 'Dating sim'}</dd>
				<dt>Mood</dt>
				<dd>{charState.mood.primary} · {charState.mood.intensity}%</dd>
				<dt>Stage</dt>
				<dd>{characterStore.stageInfo.name}</dd>
				<dt>Energy</dt>
				<dd>{charState.energy}</dd>
				<dt>Conversations</dt>
				<dd>{charState.totalInteractions}</dd>
				{#if charState.appMode !== 'companion'}<dt>Affection</dt>
					<dd>{charState.affection}</dd>
					<dt>Trust</dt>
					<dd>{charState.trust}</dd>
					<dt>Intimacy</dt>
					<dd>{charState.intimacy}</dd>
					<dt>Comfort</dt>
					<dd>{charState.comfort}</dd>
					<dt>Respect</dt>
					<dd>{charState.respect}</dd>{/if}
			</dl>
		</SettingsSection>
	{:else}<SettingsSection
			title="Response parser"
			description="Inspect the tags and state changes a sample response would produce."
			><ParserTest /></SettingsSection
		>{/if}
	{#if !['state', 'test'].includes(tab)}
		{#if loadError}<div role="alert" class="error">
				{loadError}
				<Button size="sm" variant="secondary" onclick={() => retry++}>Retry</Button>
			</div>
		{:else if loading}<p role="status">Loading memories...</p>
		{:else}<nav class="pagination" aria-label="Memory pages">
				<span
					>{total}
					{tab === 'facts' ? 'facts' : tab === 'sessions' ? 'sessions' : 'turns'} · Page {pageIndex +
						1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span
				><Button
					variant="secondary"
					size="sm"
					disabled={pageIndex === 0}
					onclick={() => pageIndex--}>Previous</Button
				><Button
					variant="secondary"
					size="sm"
					disabled={(pageIndex + 1) * PAGE_SIZE >= total}
					onclick={() => pageIndex++}>Next</Button
				>
			</nav>{/if}
	{/if}
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
	{#if tab === 'facts'}
		<SettingsSection
			title="Add a memory"
			description="Save something you want your companion to know."
		>
			<form onsubmit={addMemory}>
				<label
					>Memory<textarea
						class="settings-field"
						bind:value={content}
						required
						maxlength={2000}
						rows={3}
						placeholder="For example, I prefer tea to coffee."
						disabled={busy}></textarea></label
				>
				<div class="filters">
					<label
						>Memory category<Select label="Memory category" bind:value={newCategory} disabled={busy} options={categories} /></label
					><label
						>Importance <span>{importance}</span><input
							class="settings-range"
							type="range" use:rangeProgress={importance}
							min={0}
							max={100}
							step={5}
							bind:value={importance}
							disabled={busy}
						/></label
					>
				</div>
				<Button type="submit" disabled={busy || !content.trim()}
					>{busy ? 'Saving...' : 'Add memory'}</Button
				>
			</form>
		</SettingsSection>
	{/if}
</div>

<style>
	.memory-inspector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-bottom: 1rem;
	}
	.memory-inspector > :global(*) {
		flex-shrink: 0;
	}
	.selection-notice {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.filters > label {
		flex: 1 1 200px;
		min-width: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		min-height: 32px;
	}
	.records {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.records li {
		padding: 1rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.records li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.records h4 {
		font-size: 0.875rem;
		margin: 0;
	}
	.fact-content {
		margin: 0 0 0.5rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.metadata,
	time {
		color: var(--text-secondary);
		font-size: 0.75rem;
	}
	.metadata {
		margin: 0.5rem 0;
	}
	.record-footer,
	.confirm,
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.record-footer {
		justify-content: space-between;
	}
	.confirm {
		font-size: 0.8125rem;
	}
	.pagination {
		font-size: 0.8125rem;
	}
	.pagination > span {
		flex: 1 1 180px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 0.875rem;
		padding: 1rem 0;
	}
	.notice {
		color: var(--text-primary);
	}
	.error {
		color: var(--color-error);
	}
	dl {
		display: grid;
		grid-template-columns: minmax(100px, 1fr) 2fr;
		gap: 0.75rem;
		font-size: 0.875rem;
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
