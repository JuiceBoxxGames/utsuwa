<script lang="ts">
	import '$lib/styles/site.css';
	import type { PageData } from './$types';
	import { SITE_URL } from '$lib/config/site';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ProviderIcons from '$lib/components/icons/ProviderIcons.svelte';
	import HomeHero from '$lib/components/marketing/HomeHero.svelte';
	import HomeScroller from '$lib/components/marketing/HomeScroller.svelte';
	import HomeStories from '$lib/components/marketing/HomeStories.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import PlatformLine from '$lib/components/marketing/PlatformLine.svelte';
	import SiteLetter from '$lib/components/marketing/SiteLetter.svelte';
	import SkyZone from '$lib/components/marketing/SkyZone.svelte';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data }: { data: PageData } = $props();

	const locale = getLocale();
	const canonical = locale === 'ja' ? `${SITE_URL}/ja` : SITE_URL;
	const ogImage = `${SITE_URL}/brand-assets/${locale === 'ja' ? 'og-image-ja' : 'og-image'}.jpg`;

	// Every provider we actually support today. Keep this honest. Wordmarks are
	// the white (dark-theme) variants since they always sit on the sky.
	const WM = '/brand-assets/providers';
	// `h` evens out the optical size of marks that ship with different padding.
	const providers: { name: string; wordmark?: string; glyph?: string; h?: number }[] = [
		{ name: 'OpenAI', wordmark: `${WM}/openai-wordmark-dark.svg`, h: 24 },
		{ name: 'Anthropic', wordmark: `${WM}/anthropic-wordmark-dark.svg`, h: 15 },
		{ name: 'Google Gemini', wordmark: `${WM}/gemini-wordmark-dark.svg`, h: 26 },
		{ name: 'DeepSeek', wordmark: `${WM}/deepseek-wordmark-dark.svg`, h: 24 },
		{ name: 'xAI Grok', wordmark: `${WM}/grok-wordmark-dark.svg`, h: 22 },
		{ name: 'Ollama', glyph: 'ollama' },
		{ name: 'LM Studio', glyph: 'lmstudio' },
		{ name: 'Groq', wordmark: `${WM}/groq-wordmark-dark.svg`, h: 22 },
		{ name: 'ElevenLabs', glyph: 'elevenlabs' },
		{ name: 'Fish Audio', glyph: 'fish-audio' }
	];
</script>

<svelte:head>
	<title>{m.home_meta_title()}</title>
	<meta name="description" content={m.home_meta_description()} />
	<link rel="canonical" href={canonical} />
	<link rel="alternate" hreflang="en" href={SITE_URL} />
	<link rel="alternate" hreflang="ja" href={`${SITE_URL}/ja`} />
	<link rel="alternate" hreflang="x-default" href={SITE_URL} />
	<link rel="preload" as="image" href="/landing-page/bust/tsuki-1-2.webp" type="image/webp" />

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

<div class="page grain">
	<main>
		<!-- Sky: bleeds behind the hero, the model strip, and the letter -->
		<SkyZone>

			<HomeHero />

			<div class="models">
				<p class="models-label">{m.models_label()}</p>
				<!-- Two identical groups loop seamlessly; the copy is hidden from AT -->
				<div class="models-marquee">
					<div class="models-track">
						{#each [0, 1] as copy}
							<ul class="models-list" aria-hidden={copy === 1}>
								{#each providers as provider}
									<li title={provider.name}>
										{#if provider.wordmark}
											<img
												src={provider.wordmark}
												alt={copy === 0 ? provider.name : ''}
												style="height: {provider.h}px"
											/>
										{:else if provider.glyph}
											<ProviderIcons provider={provider.glyph} size={22} themed />
											<span>{provider.name}</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/each}
					</div>
				</div>
			</div>

			<SiteLetter tone="sky" />
		</SkyZone>

		<HomeScroller />

		<!-- Everything else -->
		<section id="features" class="features" aria-labelledby="features-title">
			<p class="features-note">{m.features_note()}</p>
			<h2 id="features-title" class="features-title">{m.features_title()}</h2>

			<div class="features-grid">
				<article class="feature">
					<div class="feature-asset feature-asset--group">
						<img
							src="/landing-page/feature-group.webp"
							alt={m.feature_custom_alt()}
							width="1080"
							height="960"
							loading="lazy"
						/>
					</div>
					<div class="feature-copy">
						<p class="feature-note">{m.feature_custom_note()}</p>
						<h3 class="feature-title">{m.feature_custom_title()}</h3>
						<p class="feature-note">{m.feature_custom_body()}</p>
					</div>
				</article>

				<article class="feature">
					<div class="feature-asset feature-asset--ar">
						<img
							src="/landing-page/ar-phone.webp"
							alt={m.feature_ar_alt()}
							width="530"
							height="816"
							loading="lazy"
						/>
					</div>
					<div class="feature-copy">
						<p class="feature-note">{m.feature_ar_note()}</p>
						<h3 class="feature-title">{m.feature_ar_title()}</h3>
						<p class="feature-note">{m.feature_ar_body()}</p>
					</div>
				</article>

				<article class="feature">
					<div class="feature-asset feature-asset--photos" aria-hidden="true">
						<figure class="polaroid polaroid-back">
							<img src="/landing-page/photo-yuki.webp" alt="" loading="lazy" />
							<figcaption>{m.feature_photo_caption_1()}</figcaption>
						</figure>
						<figure class="polaroid polaroid-front">
							<img src="/landing-page/photo-momo.webp" alt="" loading="lazy" />
							<figcaption>{m.feature_photo_caption_2()}</figcaption>
						</figure>
						<svg class="doodle doodle-star" viewBox="0 0 40 40">
							<path
								d="M20 4l4.2 10.4L35 15.6l-8.3 7.1 2.7 10.9L20 27.7l-9.4 5.9 2.7-10.9L5 15.6l10.8-1.2Z"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linejoin="round"
							/>
						</svg>
						<svg class="doodle doodle-heart" viewBox="0 0 40 36">
							<path
								d="M20 33S4 23.5 4 12.6C4 7.6 7.8 4 12.3 4c3.3 0 5.9 2 7.7 4.8C21.8 6 24.4 4 27.7 4 32.2 4 36 7.6 36 12.6 36 23.5 20 33 20 33Z"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linejoin="round"
							/>
						</svg>
					</div>
					<div class="feature-copy">
						<p class="feature-note">{m.feature_photo_note()}</p>
						<h3 class="feature-title">{m.feature_photo_title()}</h3>
						<p class="feature-note">{m.feature_photo_body()}</p>
					</div>
				</article>
			</div>
		</section>

		{#if data.posts.length > 0}
			<HomeStories posts={data.posts} />
		{/if}

		<!-- Closing CTA -->
		<section class="cta" aria-labelledby="cta-title">
			<div class="cta-wrap">
				<div class="cta-content">
					<h2 id="cta-title" class="cta-title">{m.cta_title()}</h2>
					<a href="/download" class="btn btn-hero">
						<DownloadIcon size={18} strokeWidth={2.25} />
						{m.hero_download()}
					</a>
					<PlatformLine tone="ink" />
				</div>
				<div class="cta-image">
					<img
						src="/landing-page/cta-floor.webp"
						alt={m.cta_alt()}
						width="1240"
						height="821"
						loading="lazy"
					/>
				</div>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.page {
		--ink: var(--text-primary);
		--ink-80: color-mix(in srgb, var(--text-primary) 80%, transparent);
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-x: clip;
		background: var(--bg-page);
		color: var(--ink);
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	/* Model strip */
	.models {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 22px;
		margin: 40px 36px 114px;
	}

	.models-label {
		margin: 0;
		color: rgba(255, 255, 255, 0.78);
		font-size: 14px;
		letter-spacing: -0.02em;
	}

	.models-marquee {
		width: min(1240px, 100%);
		overflow: hidden;
		-webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
		mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
	}

	.models-track {
		display: flex;
		width: max-content;
		animation: marquee 42s linear infinite;
	}

	.models-marquee:hover .models-track {
		animation-play-state: paused;
	}

	@keyframes marquee {
		to {
			transform: translateX(-50%);
		}
	}

	.models-list {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 44px;
		margin: 0;
		padding: 0 44px 0 0;
		list-style: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.models-track {
			animation: none;
		}
	}

	.models-list li {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: #fff;
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.03em;
		filter: drop-shadow(0 1px 10px rgba(0, 40, 100, 0.18));
	}

	.models-list img {
		display: block;
		width: auto;
	}

	/* Features */
	.features {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 1180px;
		margin: 40px 0 0;
		padding: 0 35px;
		scroll-margin-top: 40px;
	}

	.features-note,
	.feature-note {
		margin: 0;
		color: var(--ink-80);
		font-size: 16px;
		line-height: 18px;
		letter-spacing: -0.03em;
	}

	.features-title {
		margin: 12px 0 0;
		color: var(--ink);
		font-size: 48px;
		font-weight: 600;
		line-height: 50px;
		letter-spacing: -0.045em;
		text-align: center;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		justify-items: center;
		gap: 48px;
		width: 100%;
		max-width: 1110px;
		margin: 48px 0 0;
	}

	.feature {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		width: 100%;
		max-width: 362px;
	}

	.feature-asset {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		width: 100%;
		aspect-ratio: 338 / 362;
		overflow: hidden;
		border-radius: 56px;
		background: var(--bg-secondary);
	}

	.feature-asset--group img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 30%;
	}

	.feature-asset--ar img {
		width: 78%;
		height: auto;
		margin-bottom: -18%;
	}

	.feature-asset--photos {
		align-items: center;
		color: var(--stat-affection);
	}

	.polaroid {
		position: absolute;
		width: 56%;
		margin: 0;
		padding: 8px 8px 30px;
		border-radius: 8px;
		background: #fff;
		box-shadow: 0 16px 40px rgba(28, 43, 51, 0.18);
	}

	.polaroid img {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 3px;
		background: var(--gradient-aurora-cool);
	}

	.polaroid-back img {
		background: var(--gradient-aurora-mint);
	}

	.polaroid figcaption {
		position: absolute;
		left: 12px;
		bottom: 6px;
		color: #3a3a47;
		font-family: 'Bradley Hand', 'Segoe Print', 'Chalkboard SE', cursive;
		font-size: 14px;
	}

	.polaroid-back {
		top: 11%;
		left: 8%;
		transform: rotate(-9deg);
	}

	.polaroid-front {
		right: 7%;
		bottom: 9%;
		transform: rotate(6deg);
	}

	.doodle {
		position: absolute;
		width: 34px;
		height: 34px;
	}

	.doodle-star {
		top: 10%;
		right: 12%;
		transform: rotate(14deg);
	}

	.doodle-heart {
		bottom: 12%;
		left: 12%;
		transform: rotate(-12deg);
	}

	.feature-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
		padding: 0 24px;
	}

	.feature-title {
		margin: 0;
		color: var(--ink);
		font-size: 24px;
		font-weight: 600;
		line-height: 28px;
		letter-spacing: -0.035em;
	}

	/* Closing CTA */
	.cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 1276px;
		padding: 0 36px;
	}

	.cta-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		width: 100%;
	}

	.cta-image {
		flex: 1 1 50%;
		min-width: 0;
	}

	/* Mirrored so she turns toward the headline */
	.cta-image img {
		display: block;
		width: 100%;
		height: auto;
		transform: scaleX(-1);
	}

	.cta-content {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		flex: 1 1 50%;
		min-width: 0;
	}

	.cta-title {
		max-width: 620px;
		margin: 0 0 50px;
		color: var(--ink);
		font-size: 120px;
		font-weight: 700;
		line-height: 110px;
		letter-spacing: -0.08em;
	}

	@media (max-width: 1040px) {
		.cta-title {
			font-size: 90px;
			line-height: 88px;
			letter-spacing: -0.06em;
		}
	}

	@media (max-width: 768px) {
		.models {
			margin: 0 18px 64px;
		}

		.models-list {
			gap: 28px;
			padding-right: 28px;
		}

		.models-list img {
			scale: 0.8;
		}

		.models-list li {
			font-size: 16px;
		}


		.features {
			margin-top: 64px;
		}

		.features-title {
			font-size: 36px;
			line-height: 38px;
		}

		.features-grid {
			grid-template-columns: minmax(0, 1fr);
			gap: 36px;
			margin-top: 36px;
		}

		.feature-copy {
			gap: 8px;
			padding: 0 10px;
		}

		.feature-title {
			font-size: 20px;
			line-height: 22px;
		}

		.cta-wrap {
			flex-direction: column;
			align-items: flex-start;
		}

		.cta-title {
			max-width: 300px;
			font-size: 60px;
			line-height: 58px;
		}
	}
</style>
