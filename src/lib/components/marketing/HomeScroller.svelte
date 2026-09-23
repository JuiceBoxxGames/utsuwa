<script lang="ts">
	import { onMount } from 'svelte';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import BrainIcon from '@lucide/svelte/icons/brain';
	import PlayIcon from '@lucide/svelte/icons/play';
	import HeartIcon from '@lucide/svelte/icons/heart';
	import CatIcon from '@lucide/svelte/icons/cat';
	import UsersIcon from '@lucide/svelte/icons/users';
	import CookingPotIcon from '@lucide/svelte/icons/cooking-pot';
	import PlaneIcon from '@lucide/svelte/icons/plane';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import Disc3Icon from '@lucide/svelte/icons/disc-3';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import FootprintsIcon from '@lucide/svelte/icons/footprints';
	import SproutIcon from '@lucide/svelte/icons/sprout';
	import UserIcon from '@lucide/svelte/icons/user';
	import ProviderIcons from '$lib/components/icons/ProviderIcons.svelte';
	import { m } from '$lib/paraglide/messages';

	// Scroll budget per slide, as fractions of the pinned run. The last slide
	// is a single view, so it gets the shortest stretch.
	const slides = [
		{ label: m.sc_tab_presence(), start: 0, end: 0.38 },
		{ label: m.sc_tab_memory(), start: 0.38, end: 0.76 },
		{ label: m.sc_tab_ownership(), start: 0.76, end: 1 }
	];

	const messages = [
		{ text: m.sc_msg_1() },
		{ text: m.sc_msg_2(), user: true },
		{ text: m.sc_msg_3() },
		{ text: m.sc_msg_4() },
		{ text: m.sc_msg_5(), user: true },
		{ text: '', voice: true }
	];

	const bars = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.9, 0.65, 0.4, 0.75, 0.55, 0.3, 0.6, 0.45];

	type Item = { icon: typeof HeartIcon; label: string; x: number; y: number; tint: string; tilt: number; at: number };
	const people: Item[] = [
		{ icon: HeartIcon, label: m.sc_sticker_sister(), x: 18, y: 6, tint: 'var(--gradient-aurora)', tilt: -8, at: 0.3 },
		{ icon: CatIcon, label: m.sc_sticker_cat(), x: 76, y: 2, tint: 'var(--gradient-aurora-mint)', tilt: 7, at: 0.38 },
		{ icon: UsersIcon, label: m.sc_sticker_coworker(), x: 16, y: 80, tint: 'var(--gradient-aurora-cool)', tilt: 6, at: 0.46 },
		{ icon: CookingPotIcon, label: m.sc_sticker_grandma(), x: 84, y: 70, tint: 'var(--gradient-aurora-iris)', tilt: -6, at: 0.54 }
	];
	const interests: Item[] = [
		{ icon: Disc3Icon, label: m.sc_sticker_album(), x: 22, y: 4, tint: 'var(--gradient-aurora-iris)', tilt: 8, at: 0.1 },
		{ icon: LanguagesIcon, label: m.sc_sticker_language(), x: 80, y: 8, tint: 'var(--gradient-aurora-cool)', tilt: -7, at: 0.18 },
		{ icon: FootprintsIcon, label: m.sc_sticker_runs(), x: 12, y: 76, tint: 'var(--gradient-aurora-mint)', tilt: -5, at: 0.62 },
		{ icon: SproutIcon, label: m.sc_sticker_bonsai(), x: 82, y: 78, tint: 'var(--gradient-aurora)', tilt: 6, at: 0.7 }
	];
	const around: Item[] = [
		{ icon: PlaneIcon, label: m.sc_sticker_trip(), x: 50, y: 0, tint: 'var(--gradient-aurora-cool)', tilt: -4, at: 0.24 },
		{ icon: MoonIcon, label: m.sc_sticker_night(), x: 22, y: 90, tint: 'var(--gradient-aurora-iris)', tilt: 5, at: 0.78 }
	];

	let root: HTMLElement;
	let p = $state(0);

	const slide = $derived(slides.findIndex((s) => p < s.end || s.end === 1));
	const local = $derived(Math.min(Math.max((p - slides[slide].start) / (slides[slide].end - slides[slide].start), 0), 1));
	const talk = $derived(slide === 0 ? local : 1);
	const recall = $derived(slide === 1 ? local : slide > 1 ? 1 : 0);

	onMount(() => {
		let frame = 0;
		const update = () => {
			frame = 0;
			const r = root.getBoundingClientRect();
			const run = r.height - window.innerHeight;
			p = run > 0 ? Math.min(Math.max(-r.top / run, 0), 1) : 0;
		};
		const queue = () => {
			if (!frame) frame = requestAnimationFrame(update);
		};
		update();
		window.addEventListener('scroll', queue, { passive: true });
		window.addEventListener('resize', queue);
		return () => {
			window.removeEventListener('scroll', queue);
			window.removeEventListener('resize', queue);
			cancelAnimationFrame(frame);
		};
	});

	function jump(i: number) {
		const top = root.getBoundingClientRect().top + window.scrollY;
		const run = root.offsetHeight - window.innerHeight;
		window.scrollTo({ top: top + run * slides[i].start + (i ? 2 : 0), behavior: 'smooth' });
	}
</script>

{#snippet sticker(item: Item, shown: boolean)}
	<div class="sticker" class:shown style="left: {item.x}%; top: {item.y}%; --tilt: {item.tilt}deg">
		<span class="sticker-face" style="background: {item.tint}"><item.icon size={24} strokeWidth={1.75} /></span>
		<span class="sticker-label">{item.label}</span>
	</div>
{/snippet}

<section class="scroller" bind:this={root} aria-label={m.sc_label()}>
	<div class="pin">
		<!-- Presence -->
		<div class="slide presence" class:on={slide === 0} aria-hidden={slide !== 0}>
			<div class="grid-lines" aria-hidden="true"></div>
			<header class="slide-head">
				<p class="slide-note"><SparklesIcon size={16} strokeWidth={2} /> {m.sc_presence_note()}</p>
				<div class="head-row">
					<h2 class="slide-title">{m.sc_presence_title()}</h2>
					<p class="slide-sub">{m.sc_presence_sub()}</p>
				</div>
			</header>

			<div class="messages">
				<img
					class="presence-avatar"
					src="/landing-page/presence-stool.webp"
					alt={m.sc_presence_alt()}
					width="480"
					height="1115"
					loading="lazy"
				/>
				{#each messages as m, i}
					<div
						class="msg"
						class:msg-user={m.user}
						class:msg-voice={m.voice}
						class:shown={talk > 0.06 + i * 0.13}
					>
						{#if m.voice}
							<span class="voice-play"><PlayIcon size={12} strokeWidth={0} fill="currentColor" /></span>
							<span class="voice-bars" aria-hidden="true">
								{#each bars as h}<span style="--h: {h}"></span>{/each}
							</span>
							<span class="voice-time">0:07</span>
						{:else}
							{m.text}
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Memory -->
		<div class="slide memory" class:on={slide === 1} aria-hidden={slide !== 1}>
			<div class="grid-lines" aria-hidden="true"></div>
			<header class="slide-head">
				<p class="slide-note"><BrainIcon size={16} strokeWidth={2} /> {m.sc_memory_note()}</p>
				<div class="head-row">
					<h2 class="slide-title">{m.sc_memory_title()}</h2>
					<p class="slide-sub">{m.sc_memory_sub()}</p>
				</div>
			</header>

			<div class="constellation" data-step={recall < 0.34 ? 0 : recall < 0.67 ? 1 : 2}>
				<div class="cluster cluster-side">
					<div class="orb" class:shown={recall > 0.28}>
						<span class="orb-ball orb-people"></span>
						<span class="orb-label">{m.sc_orb_people()}</span>
					</div>
					{#each people as item}{@render sticker(item, recall > item.at)}{/each}
				</div>

				<div class="cluster cluster-center">
					<div class="you" class:shown={recall > 0.02}>
						<span class="you-face"><UserIcon size={34} strokeWidth={1.5} /></span>
						<span class="you-name">{m.sc_you()}</span>
						<span class="you-bio">{m.sc_you_bio_1()}<br />{m.sc_you_bio_2()}</span>
					</div>
					<p class="scribble" class:shown={recall > 0.86}>{m.sc_scribble()}</p>
					{#each around as item}{@render sticker(item, recall > item.at)}{/each}
				</div>

				<div class="cluster cluster-side">
					<div class="orb" class:shown={recall > 0.06}>
						<span class="orb-ball orb-interests"></span>
						<span class="orb-label">{m.sc_orb_interests()}</span>
					</div>
					{#each interests as item}{@render sticker(item, recall > item.at)}{/each}
				</div>
			</div>
		</div>

		<!-- Ownership -->
		<div class="slide own" class:on={slide === 2} aria-hidden={slide !== 2}>
			<img class="own-bg" src="/landing-page/ownership-bg.webp" alt="" loading="lazy" />
			<div class="own-fade"></div>
			<div class="own-content">
				<ul class="own-chips">
					<li>{m.sc_own_model()}</li>
					<li>{m.sc_own_voice()}</li>
					<li>{m.sc_own_avatar()}</li>
				</ul>
				<h2 class="own-title">{m.sc_own_title()}</h2>
				<div class="own-proof">
					<p>{m.sc_own_proof()}</p>
					<div class="own-logos">
						<span><ProviderIcons provider="ollama" size={26} themed /> Ollama</span>
						<span><ProviderIcons provider="lmstudio" size={26} themed /> LM Studio</span>
					</div>
				</div>
			</div>
		</div>

		<nav class="section-nav" aria-label={m.sc_tabs_label()}>
			<ol>
				{#each slides as s, i}
					<li class:active={i === slide}>
						<button type="button" onclick={() => jump(i)} aria-current={i === slide}>
							<span class="nav-num">0{i + 1}</span>{s.label}
						</button>
						<span class="nav-bar" aria-hidden="true"
							><span style="transform: scaleX({i === slide ? local : i < slide ? 1 : 0})"></span></span
						>
					</li>
				{/each}
			</ol>
		</nav>
	</div>
</section>

<style>
	.scroller {
		--ink: var(--text-primary);
		--ink-80: color-mix(in srgb, var(--text-primary) 80%, transparent);
		--ink-50: color-mix(in srgb, var(--text-primary) 50%, transparent);
		position: relative;
		width: 100%;
		height: 560vh;
	}

	.pin {
		position: sticky;
		top: 0;
		width: 100%;
		height: 100vh;
		height: 100svh;
		overflow: hidden;
	}

	.slide {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 40px 32px 138px;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 0.6s ease,
			visibility 0s linear 0.6s;
	}

	.slide.on {
		opacity: 1;
		visibility: visible;
		transition: opacity 0.6s ease;
	}

	/* Faint dot grid behind the first two slides */
	.grid-lines {
		position: absolute;
		inset: 0;
		z-index: -1;
		background-image: radial-gradient(circle, color-mix(in srgb, var(--ink) 16%, transparent) 1.1px, transparent 1.6px);
		background-size: 26px 26px;
		background-position: center;
		-webkit-mask-image: radial-gradient(ellipse 34% 58% at 50% 55%, #000 30%, transparent 100%);
		mask-image: radial-gradient(ellipse 34% 58% at 50% 55%, #000 30%, transparent 100%);
	}

	.slide-head {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
		max-width: 1180px;
	}

	.slide-note {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--accent);
		font-size: 1rem;
		line-height: 1.125rem;
		letter-spacing: -0.03em;
	}

	.head-row {
		display: flex;
		justify-content: space-between;
		gap: 32px;
	}

	.slide-title {
		max-width: 500px;
		margin: 0;
		color: var(--ink);
		font-size: 48px;
		font-weight: 600;
		line-height: 50px;
		letter-spacing: -0.065em;
	}

	.slide-sub {
		max-width: 370px;
		margin: 0;
		color: var(--ink-80);
		font-size: 1rem;
		line-height: 1.2rem;
		letter-spacing: -0.03em;
	}

	/* Presence */
	.messages {
		position: relative;
		z-index: 5;
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		max-width: 366px;
		margin: auto 0;
	}

	.presence-avatar {
		position: absolute;
		bottom: -150px;
		left: -300px;
		z-index: -1;
		width: auto;
		height: 560px;
		pointer-events: none;
	}

	.msg {
		align-self: flex-start;
		max-width: 312px;
		padding: 13px 17px;
		border-radius: 20px 20px 20px 6px;
		background: var(--bg-secondary);
		color: #1c2b33;
		font-size: 1rem;
		line-height: 1.3;
		letter-spacing: -0.02em;
		box-shadow: 0 1px 0 rgba(28, 43, 51, 0.04);
		opacity: 0;
		transform: translateY(14px) scale(0.92);
		transform-origin: 8% 80%;
		transition:
			opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.45s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.msg.shown {
		opacity: 1;
		transform: none;
	}

	.msg-user {
		align-self: flex-end;
		border-radius: 20px 20px 6px 20px;
		background: var(--accent);
		color: #fff;
		transform-origin: 92% 80%;
	}

	.msg-voice {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 18px 10px 10px;
	}

	.voice-play {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
	}

	.voice-bars {
		display: flex;
		align-items: center;
		gap: 3px;
		height: 22px;
	}

	.voice-bars span {
		width: 3px;
		height: calc(var(--h) * 100%);
		border-radius: 3px;
		background: color-mix(in srgb, #1c2b33 55%, transparent);
	}

	.voice-time {
		color: #9da9b7;
		font-size: 13px;
	}

	/* Memory */
	.constellation {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		align-items: center;
		transform: translate(-50%, -50%);
	}

	.cluster {
		position: relative;
		flex-shrink: 0;
	}

	.cluster-side {
		width: 380px;
		height: 360px;
		margin-top: 90px;
	}

	.cluster-center {
		width: 440px;
		height: 400px;
	}

	.sticker {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		opacity: 0;
		transform: translate(-50%, 0) scale(0.6) rotate(var(--tilt));
		transition:
			opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.sticker.shown {
		opacity: 1;
		transform: translate(-50%, 0) rotate(0deg);
	}

	.sticker-face {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		border: 3px solid #fff;
		border-radius: 22px;
		color: #1c2b33;
		box-shadow: 0 10px 24px rgba(34, 36, 48, 0.14);
		transform: rotate(var(--tilt));
	}

	.sticker-label {
		color: var(--ink);
		font-size: 12px;
		font-weight: 500;
		line-height: 1.2;
		text-align: center;
		white-space: pre-line;
	}

	.orb {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.7);
		transition:
			opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.orb.shown {
		opacity: 1;
		transform: translate(-50%, -50%);
	}

	.orb-ball {
		width: 124px;
		height: 124px;
		border-radius: 50%;
		box-shadow:
			inset 0 -10px 24px rgba(255, 255, 255, 0.55),
			inset 0 8px 18px rgba(255, 255, 255, 0.8),
			0 18px 40px rgba(34, 36, 48, 0.14);
	}

	.orb-people {
		background:
			radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95) 0 10%, transparent 34%),
			radial-gradient(circle at 70% 70%, #ff9ab8 0%, transparent 60%),
			linear-gradient(135deg, #f4e7ff 0%, #fdddde 100%);
	}

	.orb-interests {
		background:
			radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.95) 0 10%, transparent 34%),
			radial-gradient(circle at 70% 70%, #6fd0ff 0%, transparent 60%),
			linear-gradient(135deg, #e7fdff 0%, #ede4ff 100%);
	}

	.orb-label {
		margin-top: -18px;
		padding: 8px 16px;
		min-width: 110px;
		border-radius: 60px;
		background: rgba(255, 255, 255, 0.72);
		box-shadow:
			0 14px 42px rgba(34, 36, 48, 0.12),
			inset 0 1px 0 rgba(255, 255, 255, 0.72);
		color: #323232;
		font-size: 14px;
		font-weight: 500;
		text-align: center;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.you {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		width: 280px;
		opacity: 0;
		transform: translate(-50%, -40%) scale(0.8);
		transition:
			opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.you.shown {
		opacity: 1;
		transform: translate(-50%, -50%);
	}

	.you-face {
		display: grid;
		place-items: center;
		width: 96px;
		height: 96px;
		margin-bottom: 6px;
		border: 4px solid #fff;
		border-radius: 50%;
		background: var(--gradient-aurora-iris);
		color: #1c2b33;
		box-shadow: 0 16px 36px rgba(34, 36, 48, 0.16);
	}

	.you-name {
		color: var(--ink);
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.you-bio {
		color: var(--text-tertiary);
		font-size: 14px;
		line-height: 18px;
		text-align: center;
	}

	.scribble {
		position: absolute;
		top: 30%;
		right: -6%;
		margin: 0;
		color: var(--stat-affection);
		font-family: 'Bradley Hand', 'Segoe Print', 'Chalkboard SE', cursive;
		font-size: 17px;
		opacity: 0;
		transform: rotate(14deg) translateY(8px);
		transition:
			opacity 0.5s ease,
			transform 0.5s ease;
	}

	.scribble.shown {
		opacity: 1;
		transform: rotate(14deg);
	}

	/* Ownership */
	.own {
		justify-content: center;
		padding: 100px 38px 138px;
	}

	.own-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scale(1.06);
		transition: transform 1.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.own.on .own-bg {
		transform: none;
	}

	.own-fade {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 80% 70% at 50% 45%, transparent 50%, color-mix(in srgb, var(--bg-page) 55%, transparent) 100%),
			linear-gradient(180deg, transparent calc(100% - 400px), color-mix(in srgb, var(--bg-page) 60%, transparent) calc(100% - 50px), var(--bg-page));
	}

	.own-content {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 48px;
		width: 100%;
		height: 100%;
		max-height: 432px;
		color: #fff4ec;
		text-align: center;
	}

	.own-chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.own-chips li {
		padding: 9px 18px;
		border: 1px solid rgba(255, 244, 236, 0.35);
		border-radius: 100px;
		background: rgba(255, 244, 236, 0.14);
		font-size: 15px;
		letter-spacing: -0.02em;
		-webkit-backdrop-filter: blur(10px);
		backdrop-filter: blur(10px);
	}

	.own-title {
		max-width: 640px;
		margin: 0;
		color: #ffeee3;
		font-size: 72px;
		font-weight: 700;
		line-height: 74px;
		letter-spacing: -0.05em;
		text-shadow: 0 2px 30px rgba(90, 40, 20, 0.12);
	}

	.own-proof p {
		margin: 0 0 20px;
		font-size: 1rem;
		letter-spacing: -0.03em;
	}

	.own-logos {
		display: flex;
		justify-content: center;
		gap: 28px;
	}

	.own-logos span {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	/* Tab pill pinned to the bottom of the run */
	.section-nav {
		position: absolute;
		bottom: 54px;
		left: 50%;
		z-index: 10;
		transform: translateX(-50%);
	}

	.section-nav ol {
		display: flex;
		gap: 4px;
		margin: 0;
		padding: 8px 10px;
		border: 1px solid color-mix(in srgb, var(--ink) 8%, transparent);
		border-radius: 100px;
		background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
		box-shadow: 0 10px 30px rgba(28, 43, 51, 0.08);
		list-style: none;
		-webkit-backdrop-filter: blur(20px);
		backdrop-filter: blur(20px);
	}

	.section-nav li {
		position: relative;
	}

	.section-nav button {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 12px 18px;
		border: none;
		background: none;
		color: var(--ink-50);
		font: inherit;
		font-size: 15px;
		letter-spacing: -0.02em;
		white-space: nowrap;
		cursor: pointer;
		transition: color 0.2s ease;
	}

	.nav-num {
		color: var(--accent);
		font-size: 12px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		opacity: 0.55;
	}

	.section-nav li.active button {
		color: var(--ink);
	}

	.section-nav li.active .nav-num {
		opacity: 1;
	}

	/* Thin progress line under each step */
	.nav-bar {
		position: absolute;
		right: 18px;
		bottom: 6px;
		left: 18px;
		height: 2px;
		overflow: hidden;
		border-radius: 2px;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
	}

	.nav-bar span {
		display: block;
		height: 100%;
		background: var(--accent);
		transform-origin: left center;
		transition: transform 0.15s linear;
	}

	@media (max-height: 800px), (max-width: 768px) {
		.slide {
			padding: 40px 34px 102px;
		}

		.slide-title {
			font-size: 28px;
			line-height: 30px;
			letter-spacing: -0.04em;
		}

		.slide-sub {
			display: none;
		}

		.section-nav {
			bottom: 16px;
		}

		.section-nav ol {
			padding: 6px;
		}

		.section-nav button {
			padding: 10px 12px;
			font-size: 13px;
		}

		.nav-bar {
			right: 12px;
			left: 12px;
		}
	}

	/* Smallest phones: drop the step numbers so all three tabs fit */
	@media (max-width: 400px) {
		.nav-num {
			display: none;
		}

		.section-nav button {
			padding: 10px 11px;
		}
	}

	@media (max-width: 1240px) {
		.constellation {
			transform: translate(-50%, -50%) scale(0.82);
		}
	}

	@media (max-width: 768px) {
		.presence-avatar {
			left: -48px;
			bottom: -210px;
			height: 440px;
			opacity: 0.95;
		}

		.messages {
			max-width: 334px;
			padding: 0 12px;
		}

		.msg {
			padding: 12px 16px;
			font-size: 14px;
			line-height: 16px;
		}

		/* One cluster at a time on phones, advanced by scroll */
		.constellation {
			top: 57%;
			transform: translate(-50%, -50%) scale(0.9);
		}

		.cluster {
			display: none;
			margin: 0;
		}

		.constellation[data-step='0'] .cluster-center,
		.constellation[data-step='1'] .cluster:first-child,
		.constellation[data-step='2'] .cluster:last-child {
			display: block;
		}

		.cluster-side {
			width: 330px;
			height: 360px;
		}

		.cluster-center {
			width: 330px;
			height: 400px;
		}

		.own-title {
			font-size: 45px;
			line-height: 46px;
			letter-spacing: -0.04em;
		}

		.own-chips li {
			padding: 7px 14px;
			font-size: 13px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.msg,
		.sticker,
		.orb,
		.you,
		.scribble,
		.own-bg {
			transition: none;
		}
	}
</style>
