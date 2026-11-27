<script lang="ts">
	import '$lib/styles/marketing.css';
	import type { PageData } from './$types';
	import { SITE_URL } from '$lib/config/site';
	import { sectionUrl } from '$lib/config/links';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ProviderIcons from '$lib/components/icons/ProviderIcons.svelte';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import HeroVideo from '$lib/components/marketing/HeroVideo.svelte';
	import LandingPillars, { type Pillar } from '$lib/components/marketing/LandingPillars.svelte';
	import VesselLetter from '$lib/components/marketing/VesselLetter.svelte';
	import PostCard from '$lib/components/marketing/PostCard.svelte';
	import FeatureBento from '$lib/components/marketing/FeatureBento.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data }: { data: PageData } = $props();

	const locale = getLocale();
	const canonical = locale === 'ja' ? `${SITE_URL}/ja` : SITE_URL;
	const ogImage = `${SITE_URL}/brand-assets/${locale === 'ja' ? 'og-ink-ja' : 'og-ink'}.jpg`;
	const version = import.meta.env.VITE_APP_VERSION;

	// Every provider we actually support today. Keep this honest. The wordmarks
	// are white art, darkened in light mode.
	const WM = '/brand-assets/providers';
	const providers: { name: string; wordmark?: string; glyph?: string; h?: number }[] = [
		{ name: 'OpenAI', wordmark: `${WM}/openai-wordmark-dark.svg`, h: 22 },
		{ name: 'Anthropic', wordmark: `${WM}/anthropic-wordmark-dark.svg`, h: 14 },
		{ name: 'Google Gemini', wordmark: `${WM}/gemini-wordmark-dark.svg`, h: 24 },
		{ name: 'DeepSeek', wordmark: `${WM}/deepseek-wordmark-dark.svg`, h: 22 },
		{ name: 'xAI Grok', wordmark: `${WM}/grok-wordmark-dark.svg`, h: 20 },
		{ name: 'Ollama', glyph: 'ollama' },
		{ name: 'LM Studio', glyph: 'lmstudio' },
		{ name: 'Groq', wordmark: `${WM}/groq-wordmark-dark.svg`, h: 20 },
		{ name: 'ElevenLabs', glyph: 'elevenlabs' },
		{ name: 'Fish Audio', glyph: 'fish-audio' }
	];

	const pillars: Pillar[] = [
		{
			id: 'presence',
			label: m.sc_tab_presence(),
			note: m.sc_presence_note(),
			title: m.sc_presence_title(),
			body: m.sc_presence_sub(),
			image: '/landing-page/presence-stool.webp',
			alt: m.sc_presence_alt(),
			fit: 'cutout'
		},
		{
			id: 'memory',
			label: m.sc_tab_memory(),
			note: m.sc_memory_note(),
			title: m.sc_memory_title(),
			body: m.sc_memory_sub(),
			image: '/landing-page/hero-memory.webp',
			alt: '',
			fit: 'cutout'
		},
		{
			id: 'ownership',
			label: m.sc_tab_ownership(),
			note: [m.sc_own_model(), m.sc_own_voice(), m.sc_own_avatar()].join(' · '),
			title: m.sc_own_title(),
			body: m.sc_own_sub(),
			image: '/marketing/companion-light.webp',
			imageDark: '/marketing/companion-dark.webp',
			alt: m.sc_own_alt(),
			fit: 'cover'
		}
	];

	const features = [
		{ note: m.feature_custom_note(), title: m.feature_custom_title(), body: m.feature_custom_body(), image: '/landing-page/feature-group.webp', alt: m.feature_custom_alt() },
		{ note: m.feature_ar_note(), title: m.feature_ar_title(), body: m.feature_ar_body(), image: '/landing-page/ar-phone.webp', alt: m.feature_ar_alt() },
		{ note: m.feature_photo_note(), title: m.feature_photo_title(), body: m.feature_photo_body(), image: '/landing-page/photo-yuki.webp', alt: '' }
	];
</script>

<svelte:head>
	<title>{m.home_meta_title()}</title>
	<meta name="description" content={m.home_meta_description()} />
	<link rel="canonical" href={canonical} />
	<link rel="alternate" hreflang="en" href={SITE_URL} />
	<link rel="alternate" hreflang="ja" href={`${SITE_URL}/ja`} />
	<link rel="alternate" hreflang="x-default" href={SITE_URL} />
	<!-- Fetch only the poster this visitor's system theme will show first -->
	<link rel="preload" as="image" href="/landing-page/hero-devices-light.webp" type="image/webp" media="(prefers-color-scheme: light)" />
	<link rel="preload" as="image" href="/landing-page/hero-devices-dark.webp" type="image/webp" media="(prefers-color-scheme: dark)" />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={m.home_meta_title()} />
	<meta property="og:description" content={m.home_meta_description()} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:url" content={canonical} />
	<meta property="og:site_name" content="Utsuwa" />
	<meta property="og:locale" content={locale === 'ja' ? 'ja_JP' : 'en_US'} />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={m.home_meta_title()} />
	<meta name="twitter:description" content={m.home_meta_description_short()} />
	<meta name="twitter:image" content={ogImage} />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'Utsuwa',
		description:
			'Open-source AI companion with 3D VRM avatars, voice chat, semantic memory, and multi-provider LLM support.',
		url: SITE_URL,
		applicationCategory: 'DesktopApplication',
		operatingSystem: 'macOS, Windows, Linux, Web',
		offers: {
			'@type': 'Offer',
			price: '0',
			priceCurrency: 'USD'
		},
		license: 'https://www.gnu.org/licenses/agpl-3.0.html',
		author: {
			'@type': 'Organization',
			name: 'Juice Boxx Games LLC',
			url: SITE_URL
		}
	})}</script>`}
</svelte:head>

<div class="docs-site site-shell">
	<SiteNav />

	<main>
		<section class="hero site-container" aria-labelledby="hero-title">
			<p class="site-eyebrow">{m.hero_eyebrow({ version })}</p>
			<h1 id="hero-title" class="site-h1">{m.hero_title_full()}</h1>
			<p class="site-lede">{m.hero_lede()}</p>
			<div class="site-actions">
				<a href="/download" class="btn btn-primary btn-pill">{m.nav_download()}</a>
				<a href={sectionUrl('app')} class="btn btn-secondary btn-pill">
					{m.hero_try_browser()} <ArrowRightIcon size={15} strokeWidth={2.25} />
				</a>
			</div>
			<div class="hero-stage site-panel">
				<HeroVideo label={m.hero_video_alt()} />
			</div>
		</section>

		<section class="models site-container" aria-label={m.models_label()}>
			<p class="site-eyebrow">{m.models_label()}</p>
			<ul class="models-list">
				{#each providers as provider (provider.name)}
					<li>
						{#if provider.wordmark}
							<img class="wordmark" src={provider.wordmark} alt={provider.name} style="height: {provider.h}px" />
						{:else if provider.glyph}
							<ProviderIcons provider={provider.glyph} size={20} themed />
							<span>{provider.name}</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<section id="features" class="section site-container" aria-labelledby="pillars-title">
			<div class="section-head">
				<p class="site-eyebrow">{m.sc_tabs_label()}</p>
				<h2 id="pillars-title" class="site-h2">{m.sc_label()}</h2>
			</div>
			<LandingPillars {pillars} label={m.sc_tabs_label()} />
		</section>

		<FeatureBento />

		<section class="section site-container" aria-labelledby="features-title">
			<div class="section-head">
				<p class="site-eyebrow">{m.features_note()}</p>
				<h2 id="features-title" class="site-h2">{m.features_title()}</h2>
			</div>
			<div class="feature-grid">
				{#each features as feature (feature.title)}
					<article class="feature">
						<div class="feature-media site-panel">
							<img src={feature.image} alt={feature.alt} loading="lazy" />
						</div>
						<p class="site-eyebrow">{feature.note}</p>
						<h3 class="feature-title">{feature.title}</h3>
						<p class="feature-body">{feature.body}</p>
					</article>
				{/each}
			</div>
		</section>

		<div class="section">
			<VesselLetter />
		</div>

		{#if data.posts.length}
			<section class="section site-container" aria-labelledby="posts-title">
				<div class="section-head section-head--row">
					<div class="section-head">
						<p class="site-eyebrow">{m.nav_blog()}</p>
						<h2 id="posts-title" class="site-h2">{m.stories_title()}</h2>
					</div>
					<a href="/blog" class="btn btn-secondary btn-pill">{m.stories_all()}</a>
				</div>
				<div class="post-grid">
					{#each data.posts.slice(0, 3) as post (post.slug)}
						<PostCard {post} />
					{/each}
				</div>
			</section>
		{/if}

		<section class="section site-container" aria-labelledby="cta-title">
			<div class="cta site-panel">
				<div class="cta-copy">
					<h2 id="cta-title" class="site-h1">{m.cta_title()}</h2>
					<div class="site-actions">
						<a href="/download" class="btn btn-primary btn-pill">{m.nav_download()}</a>
						<a href={sectionUrl('app')} class="btn btn-secondary btn-pill">
							{m.hero_try_browser()} <ArrowRightIcon size={15} strokeWidth={2.25} />
						</a>
					</div>
				</div>
				<img class="cta-img" src="/landing-page/cta-pair.webp" alt={m.cta_alt()} loading="lazy" />
			</div>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding-top: clamp(56px, 9vw, 120px);
		text-align: center;
	}

	.hero .site-h1 {
		max-width: 17ch;
	}

	.hero .site-lede {
		max-width: 54ch;
	}

	.hero .site-actions {
		justify-content: center;
		margin-top: 8px;
	}

	.hero-stage {
		width: 100%;
		aspect-ratio: 16 / 9;
		margin-top: clamp(32px, 5vw, 56px);
	}

	/* Phones get a taller crop; every shot keeps its device centered */
	@media (max-width: 720px) {
		.hero-stage {
			aspect-ratio: 4 / 3.4;
		}
	}

	.models {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		padding-top: clamp(48px, 7vw, 88px);
	}

	/* Ten marks as two even rows of five, never a lone orphan */
	.models-list {
		display: grid;
		grid-template-columns: repeat(5, auto);
		justify-content: center;
		justify-items: center;
		align-items: center;
		gap: 28px 56px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.models-list li {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--text-primary);
		font-size: 15px;
		font-weight: 600;
		opacity: 0.75;
	}

	@media (max-width: 900px) {
		.models-list {
			gap: 24px 28px;
		}
	}

	@media (max-width: 640px) {
		.models-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 22px 24px;
		}
	}

	.wordmark {
		width: auto;
	}

	:global(html:not(.dark)) .wordmark {
		filter: brightness(0);
	}

	.section {
		padding-top: var(--site-section);
	}

	.section-head {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 720px;
		margin-bottom: 40px;
	}

	.section-head .section-head {
		margin-bottom: 0;
	}

	.section-head--row {
		flex-direction: row;
		justify-content: space-between;
		align-items: flex-end;
		max-width: none;
	}

	.feature-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 24px;
	}

	.feature {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.feature-media {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		aspect-ratio: 4 / 3.6;
		margin-bottom: 12px;
		border-radius: 24px;
	}

	.feature-media img {
		max-width: 90%;
		max-height: 92%;
		object-fit: contain;
	}

	.feature-title {
		margin: 0;
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.feature-body {
		margin: 0;
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1.55;
	}

	.post-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 24px;
	}

	.cta {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: end;
		min-height: 460px;
		margin-bottom: var(--site-section);
	}

	.cta-copy {
		display: flex;
		flex-direction: column;
		gap: 28px;
		align-self: center;
		padding: clamp(32px, 6vw, 72px);
	}

	.cta-img {
		justify-self: center;
		width: min(100%, 440px);
		height: auto;
		margin-top: 56px;
	}

	@media (max-width: 900px) {
		.feature-grid,
		.post-grid {
			grid-template-columns: 1fr;
		}

		.section-head--row {
			flex-direction: column;
			align-items: flex-start;
		}

		.cta {
			grid-template-columns: 1fr;
		}

		.cta-img {
			width: min(80%, 360px);
		}
	}
</style>
