<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Icon } from '$lib/components/ui';
	import { Dialog } from 'bits-ui';
	import {
		listKeepsakes,
		getKeepsakeImageUrl,
		forgetKeepsakeImage,
		type KeepsakeRecord
	} from '$lib/services/storage/keepsakes';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	type Item = KeepsakeRecord & { url: string; isBlobUrl: boolean };
	let items = $state<Item[]>([]);
	let loading = $state(true);
	let visibleCount = $state(60);

	// Lightbox
	let selected = $state<Item | null>(null);
	let selectedFullUrl = $state<string | null>(null);
	let flipped = $state(false);

	let sentinel = $state<HTMLDivElement>();
	let observer: IntersectionObserver | null = null;

	// Stable, scattered tilt (no random, so it doesn't jiggle on rerender).
	const ROTATIONS = [-3, 2.5, -1.5, 3, -2, 1.5, -2.5, 2];

	onMount(async () => {
		// The board is "things you've shown her"; photo-mode captures are
		// persisted under kind 'photo' and stay off this wall. The note check
		// covers captures saved before the kind field existed.
		const records = (await listKeepsakes()).filter(
			(r) => r.kind !== 'photo' && r.note !== 'Photo mode'
		);
		const result: Item[] = [];
		for (const r of records) {
			if (r.thumb) {
				result.push({ ...r, url: r.thumb, isBlobUrl: false });
			} else {
				const url = await getKeepsakeImageUrl(r.id);
				if (url) result.push({ ...r, url, isBlobUrl: true });
			}
		}
		items = result;
		loading = false;
	});

	// Windowed reveal: render 60 at a time, bumping as the sentinel scrolls in.
	$effect(() => {
		if (!sentinel) return;
		observer?.disconnect();
		observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting && visibleCount < items.length) {
				visibleCount = Math.min(visibleCount + 60, items.length);
			}
		});
		observer.observe(sentinel);
		return () => observer?.disconnect();
	});

	onDestroy(() => {
		observer?.disconnect();
		items.forEach((i) => i.isBlobUrl && URL.revokeObjectURL(i.url));
		if (selectedFullUrl && !selected?.isBlobUrl) URL.revokeObjectURL(selectedFullUrl);
	});

	function groupLabel(ms: number): string {
		const week = 7 * 24 * 60 * 60 * 1000;
		if (Date.now() - ms < week) return 'This week';
		return new Date(ms).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}

	const sections = $derived.by(() => {
		const visible = items.slice(0, visibleCount);
		const groups: { label: string; items: Item[] }[] = [];
		for (const it of visible) {
			const label = groupLabel(it.createdAt);
			const last = groups[groups.length - 1];
			if (last && last.label === label) last.items.push(it);
			else groups.push({ label, items: [it] });
		}
		return groups;
	});

	function shortDate(ms: number): string {
		return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
	function fullDate(ms: number): string {
		return new Date(ms).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function openLightbox(item: Item) {
		selected = item;
		flipped = false;
		selectedFullUrl = item.isBlobUrl ? item.url : await getKeepsakeImageUrl(item.id);
	}
	function closeLightbox() {
		if (selectedFullUrl && !selected?.isBlobUrl) URL.revokeObjectURL(selectedFullUrl);
		selected = null;
		selectedFullUrl = null;
		flipped = false;
	}

	async function forget(id: string) {
		const item = items.find((i) => i.id === id);
		if (item?.isBlobUrl) URL.revokeObjectURL(item.url);
		items = items.filter((i) => i.id !== id);
		await forgetKeepsakeImage(id);
	}

</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="board ui-dialog">
  <Dialog.Title class="sr-only">Photoboard</Dialog.Title>
  <Dialog.Description class="sr-only">Photos you've shared with your companion.</Dialog.Description>
		<div class="board-header">
			<h2>
				Things you've shown her{#if items.length}<span class="ui-badge">{items.length}</span>{/if}
			</h2>
			<button class="btn btn-ghost btn-icon" onclick={onClose} aria-label="Close">
				<Icon name="x" size={16} />
			</button>
		</div>

		{#if loading}
			<div class="board-empty"><span>Loading…</span></div>
		{:else if items.length === 0}
			<div class="board-empty">
				<Icon name="camera" size={40} />
				<p>Nothing on the board yet.</p>
				<span>Show her a photo and she'll keep it here.</span>
			</div>
		{:else}
			<div class="board-wall">
				{#each sections as section (section.label)}
					<div class="section-label">{section.label}</div>
					<div class="section-photos">
						{#each section.items as item, i (item.id)}
							<div class="photo-card" style="--rot: {ROTATIONS[i % ROTATIONS.length]}deg">
								<button class="photo-btn" onclick={(event) => { event.currentTarget.focus(); void openLightbox(item); }} aria-label="View photo">
									<img src={item.url} alt="" loading="lazy" />
								</button>
								<div class="caption">{shortDate(item.createdAt)}</div>
								<button class="forget-btn" aria-label="Forget this" onclick={() => forget(item.id)}>
									<Icon name="x" size={12} />
								</button>
							</div>
						{/each}
					</div>
				{/each}
				{#if visibleCount < items.length}
					<div class="sentinel" bind:this={sentinel}></div>
				{/if}
			</div>
		{/if}
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>

{#if selected}
 {@const photo = selected}
 <Dialog.Root open={true} onOpenChange={(open) => { if (!open) closeLightbox(); }}>
 <Dialog.Portal><Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="lightbox">
  <Dialog.Title class="sr-only">Photo</Dialog.Title>
  <Dialog.Description class="sr-only">Flip the photo to see its note.</Dialog.Description>
		<button class="lb-close" onclick={closeLightbox} aria-label="Close">
			<Icon name="x" size={18} />
		</button>
		<button class="flip-card" class:flipped onclick={() => (flipped = !flipped)} aria-label="Flip photo">
			<div class="flip-inner">
				<div class="flip-front">
					{#if selectedFullUrl}<img src={selectedFullUrl} alt="" />{/if}
				</div>
				<div class="flip-back">
					<div class="back-content">
						<div class="back-date">{fullDate(photo.createdAt)}</div>
						{#if photo.note}
							<p class="back-note">“{photo.note}”</p>
						{:else}
							<p class="back-empty">She hasn't said much about this one… yet.</p>
						{/if}
					</div>
				</div>
			</div>
		</button>
		<div class="lb-hint">Click the photo to flip it over</div>
	</div>
 {/snippet}</Dialog.Content></Dialog.Portal>
 </Dialog.Root>
{/if}
</Dialog.Root>

<style>


	.board {
		--dialog-width: 820px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}


	.board-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-subtle);
	}

	.board-header h2 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-primary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}




	.board-wall {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.25rem 1.5rem 1.75rem;
		overflow-y: auto;
	}

	.section-label { font-size: 12px; font-weight: 500; color: var(--text-secondary); margin: 12px 0 8px; }

	.section-photos {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 1.25rem 1rem;
	}

	.photo-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.photo-btn {
		display: block;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		line-height: 0;
		border-radius: var(--radius-md);
	}

	.photo-btn img {
		display: block;
		width: 100%;
		aspect-ratio: 1 / 1;
		object-fit: cover;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-light);
		background: var(--bg-tertiary);
		box-shadow: var(--shadow-sm);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.photo-card:hover .photo-btn img {
		border-color: var(--accent);
		box-shadow: var(--shadow-glow);
	}

	.caption {
		text-align: center;
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-tertiary);
		letter-spacing: 0.02em;
	}

	.forget-btn {
		position: absolute;
		top: -7px;
		right: -7px;
		width: 20px;
		height: 20px;
		border: 2px solid var(--bg-primary);
		border-radius: var(--control-radius, var(--radius-md));
		background: var(--color-error);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		opacity: 0;
		transform: scale(0.4);
		box-shadow: var(--shadow-sm);
		transition:
			opacity 0.16s ease,
			transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.photo-card:hover .forget-btn {
		opacity: 1;
		transform: scale(1);
	}

	.forget-btn:hover {
		transform: scale(1.18);
	}

	.sentinel {
		height: 1px;
	}

	.board-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 4rem 2rem;
		color: var(--text-secondary);
		text-align: center;
	}

	.board-empty p {
		margin: 0.5rem 0 0;
		font-weight: 600;
		font-size: 1rem;
		color: var(--text-primary);
	}

	.board-empty span {
		font-size: 0.85rem;
		color: var(--text-tertiary);
	}

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.78);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		z-index: 1100;
		padding: 2rem;
		animation: fadeIn 0.2s ease-out;
	}

	.lb-close {
		position: absolute;
		top: 1.25rem;
		right: 1.25rem;
		width: 38px;
		height: 38px;
		border: none;
		border-radius: var(--control-radius);
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			transform 0.15s,
			background 0.15s;
	}

	.lb-close:hover {
		transform: scale(1.1);
		background: rgba(255, 255, 255, 0.25);
	}

	.flip-card {
		width: min(82vw, 520px);
		height: min(72vh, 520px);
		perspective: 1400px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		animation: pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.flip-inner {
		position: relative;
		width: 100%;
		height: 100%;
		transform-style: preserve-3d;
		transition: transform 0.55s cubic-bezier(0.4, 0.15, 0.2, 1);
	}

	.flip-card.flipped .flip-inner {
		transform: rotateY(180deg);
	}

	.flip-front,
	.flip-back {
		position: absolute;
		inset: 0;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.flip-front {
		background: var(--bg-primary);
		box-shadow: var(--shadow-xl);
	}

	.flip-front img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.flip-back {
		transform: rotateY(180deg);
		background: var(--bg-primary);
		box-shadow: var(--shadow-xl);
		padding: 2rem;
	}

	.back-content {
		text-align: center;
		max-width: 90%;
	}

	.back-date {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 1.25rem;
	}

	.back-note {
		font-size: 1.15rem;
		line-height: 1.6;
		color: var(--text-primary);
		font-style: italic;
		margin: 0;
	}

	.back-empty {
		font-size: 1rem;
		color: var(--text-tertiary);
		font-style: italic;
		margin: 0;
	}

	.lb-hint {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.8rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.flip-inner {
			transition: none;
		}
	}
</style>
