<script lang="ts">
	import '$lib/styles/site.css';
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import GiftIcon from '@lucide/svelte/icons/gift';
	import UserXIcon from '@lucide/svelte/icons/user-x';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import { marketingImage } from '$lib/utils/marketing-images';
	import SiteNav from '$lib/components/marketing/SiteNav.svelte';
	import SiteFooter from '$lib/components/marketing/SiteFooter.svelte';
	import SkyZone from '$lib/components/marketing/SkyZone.svelte';
	import PlatformLine from '$lib/components/marketing/PlatformLine.svelte';
	import SiteLetter from '$lib/components/marketing/SiteLetter.svelte';
	import OsIcon from '$lib/components/marketing/OsIcon.svelte';
	import { SITE_URL, GITHUB_REPO, GITHUB_RELEASES } from '$lib/config/site';
	import { sectionUrl } from '$lib/config/links';

	let { data } = $props();

	// Release asset URLs resolved at build time (see +page.ts). Falls back to the
	// releases page if the API was unavailable during the build.
	const assets = $derived(data.assets ?? {});

	type Os = 'macOS' | 'Windows' | 'Linux';

	// Best-guess the visitor's OS so the primary button points at their build.
	let os = $state<Os>('macOS');
	$effect(() => {
		const ua = navigator.userAgent;
		if (/Windows/i.test(ua)) os = 'Windows';
		else if (/Linux/i.test(ua) && !/Android/i.test(ua)) os = 'Linux';
		else os = 'macOS';
	});

	const downloadFor = (key: string) => assets[key] || GITHUB_RELEASES;

	const platforms: { name: Os; icon: 'macos' | 'windows' | 'linux'; note: string; tone: string }[] = [
		{ name: 'macOS', icon: 'macos', note: 'Apple Silicon and Intel, universal .dmg', tone: '#1c2b33' },
		{ name: 'Windows', icon: 'windows', note: 'Windows 10 and 11, x64 .exe installer', tone: 'color-mix(in oklab, var(--accent) 55%, #0b1620)' },
		{ name: 'Linux', icon: 'linux', note: '.AppImage, .deb, and .rpm', tone: 'color-mix(in oklab, var(--tier-eternal-bond) 50%, #10141c)' }
	];

	const included = [
		{ icon: GiftIcon, title: 'Free forever', body: 'No subscription and no paywalled features. The whole app is yours.', tint: 'var(--gradient-aurora)' },
		{ icon: UserXIcon, title: 'No account', body: 'Nothing to sign up for. Open it and start.', tint: 'var(--gradient-aurora-cool)' },
		{ icon: KeyRoundIcon, title: 'Your keys', body: 'Bring your own model keys, or run a local model with none at all.', tint: 'var(--gradient-aurora-mint)' },
		{ icon: HardDriveIcon, title: 'Stays on device', body: 'Characters and conversations live in local storage, not our servers.', tint: 'var(--gradient-aurora-iris)' }
	];
</script>

<svelte:head>
	<title>Download Utsuwa: Free Open-Source AI Companion for Mac, Windows, Linux</title>
	<meta
		name="description"
		content="Download Utsuwa, the free and open-source AI companion with 3D VRM avatars, for macOS, Windows, and Linux, or run it in your browser. Self-hosted and privacy-first."
	/>
	<link rel="canonical" href={`${SITE_URL}/download`} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Download Utsuwa" />
	<meta
		property="og:description"
		content="Free and open source, for macOS, Windows, and Linux, or run it in your browser."
	/>
	<meta property="og:url" content={`${SITE_URL}/download`} />
	<meta property="og:site_name" content="Utsuwa" />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	{@html `<script type="application/ld+json">${JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'SoftwareApplication',
		name: 'Utsuwa',
		applicationCategory: 'MultimediaApplication',
		operatingSystem: 'macOS, Windows, Linux, Web',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
		url: SITE_URL,
		downloadUrl: GITHUB_RELEASES
	})}<\/script>`}
</svelte:head>

<div class="page grain">
	<main>
		<SkyZone fade>
			<section class="dl-hero" aria-labelledby="dl-title">
				<SiteNav variant="hero" />

				<!-- Standing in the room behind the copy, cut off by the fold -->
				<div class="dl-figure">
					<img
						src="/landing-page/download-avatar-c.webp"
						alt="A 3D VRM companion with dark hair and a high-collared jacket, arms crossed"
						width="1200"
						height="1500"
						fetchpriority="high"
					/>
				</div>

				<div class="dl-wrap">
					<div class="dl-copy">
						<p class="dl-eyebrow">Download</p>
						<h1 id="dl-title" class="dl-title">Utsuwa for your desktop</h1>
						<p class="dl-lead">
							A transparent overlay you can pin over anything, and a global hotkey to summon her. Free
							and open source on every platform.
						</p>
						<a href={downloadFor(os)} download class="btn btn-hero">
							<DownloadIcon size={18} strokeWidth={2.25} />
							Download for {os}
						</a>
						<PlatformLine />
						<a href={sectionUrl('app')} class="dl-web">
							or try it in your browser <ArrowRightIcon size={14} strokeWidth={2.25} />
						</a>
					</div>
				</div>
			</section>
		</SkyZone>

		<!-- Platforms -->
		<section class="platforms" aria-labelledby="platforms-title">
			<h2 id="platforms-title" class="section-title">Pick your platform</h2>
			<div class="platform-grid">
				{#each platforms as p (p.name)}
					<article class="platform" style="--tone: {p.tone}">
						<div class="platform-top">
							<OsIcon os={p.icon} size={44} />
							{#if p.name === os}<span class="platform-tag">Your system</span>{/if}
						</div>
						<div class="platform-bottom">
							<h3 class="platform-name">{p.name}</h3>
							<p class="platform-note">{p.note}</p>
							<a href={downloadFor(p.name)} download class="platform-link">
								Download <ArrowDownIcon size={15} strokeWidth={2.25} />
							</a>
						</div>
					</article>
				{/each}
			</div>
			<p class="platform-foot">
				Builds are published on
				<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer">GitHub Releases</a>. Older
				versions and release notes live there too.
			</p>
		</section>

		<!-- Desktop overlay -->
		<section class="overlay" aria-labelledby="overlay-title">
			<p class="overlay-note">Desktop overlay</p>
			<div class="overlay-head">
				<h2 id="overlay-title" class="overlay-title">Pin her over anything</h2>
				<p class="overlay-sub">
					A transparent, always-on-top window you can drag anywhere. Hit the global hotkey and she is
					there, over your browser, your code, or your game.
				</p>
			</div>
			<div class="overlay-shot">
				<img
					{...marketingImage('/marketing/desktop-app.webp', '(max-width: 1180px) calc(100vw - 36px), 1110px')}
					alt="The Utsuwa desktop overlay: a VRM companion floating on a macOS desktop"
					loading="lazy"
				/>
			</div>
		</section>

		<!-- What you get -->
		<section class="included" aria-labelledby="included-title">
			<p class="included-note">What you get</p>
			<h2 id="included-title" class="included-title">No catch. Really.</h2>
			<div class="included-grid">
				{#each included as item (item.title)}
					<div class="included-item">
						<span class="included-face" style="background: {item.tint}"
							><item.icon size={24} strokeWidth={1.75} /></span
						>
						<h3>{item.title}</h3>
						<p>{item.body}</p>
					</div>
				{/each}
			</div>
		</section>

		<SiteLetter
			lede="AGPL-3.0, built on SvelteKit, Three.js, and Tauri."
			title="Rather build it yourself?"
			body="Clone the repo, install dependencies, and run it locally, or fork it and make it your own."
			href={GITHUB_REPO}
			label="View the source"
			external
		/>
	</main>

	<SiteFooter />
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow-x: clip;
		background: var(--bg-page);
		color: var(--text-primary);
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
	}

	/* Hero: same bones as the landing hero */
	.dl-hero {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 54px;
		width: 100%;
		min-height: 100vh;
		min-height: 100dvh;
		padding: 64px clamp(24px, 5.9vw, 85px) 150px;
	}

	.dl-wrap {
		position: relative;
		z-index: 3;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: clamp(32px, 4vw, 56px);
		width: 100%;
		max-width: 1057px;
		margin: auto 0;
		color: #fff;
	}

	/* Sized by the hero's height so he stands the same way on any laptop. The
	   frame is head to knees; the fade hides where it ends. */
	.dl-figure {
		position: absolute;
		inset: 0;
		z-index: 1;
		overflow: hidden;
		pointer-events: none;
		-webkit-mask-image: linear-gradient(to bottom, #000 78%, transparent 98%);
		mask-image: linear-gradient(to bottom, #000 78%, transparent 98%);
	}

	.dl-figure img {
		position: absolute;
		top: 13%;
		left: 72%;
		width: auto;
		height: 100%;
		translate: -50% 0;
	}

	.dl-copy {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		max-width: 560px;
	}

	.dl-eyebrow {
		margin: 0 0 16px;
		color: rgba(255, 255, 255, 0.82);
		font-size: 16px;
		letter-spacing: -0.03em;
	}

	.dl-title {
		margin: 0;
		font-size: clamp(56px, 6.6vw, 96px);
		font-weight: 700;
		line-height: 0.9;
		letter-spacing: -0.066em;
		text-shadow: 0 2px 40px rgba(0, 48, 110, 0.12);
	}

	.dl-lead {
		max-width: 440px;
		margin: 26px 0 38px;
		color: rgba(255, 255, 255, 0.9);
		font-size: 18px;
		font-weight: 500;
		line-height: 24px;
		letter-spacing: -0.03em;
		text-shadow: 0 1px 20px rgba(0, 48, 110, 0.14);
	}

	.dl-web {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		padding-block: 12px;
		color: #fff;
		font-size: 15px;
		font-weight: 500;
		text-decoration: none;
		opacity: 0.85;
		transition: opacity 0.2s ease;
	}

	.dl-web:hover {
		opacity: 1;
	}

	/* Platform cards: deep, tall, rounded, like the press "mentions" row */
	.section-title {
		margin: 0 0 28px;
		font-size: 40px;
		font-weight: 700;
		letter-spacing: -0.05em;
	}

	.platforms {
		width: 100%;
		max-width: 1180px;
		padding: 40px 35px 0;
	}

	.platform-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 20px;
	}

	.platform {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 400px;
		padding: 32px;
		border-radius: 40px;
		background: var(--tone);
		color: #fff;
	}

	.platform-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
	}

	.platform-tag {
		padding: 8px 14px;
		border-radius: 100px;
		background: rgba(255, 255, 255, 0.16);
		font-size: 13px;
		font-weight: 500;
	}

	.platform-name {
		margin: 0;
		font-size: 34px;
		font-weight: 700;
		letter-spacing: -0.05em;
	}

	/* Two lines reserved so the names line up across cards */
	.platform-note {
		min-height: 2.7em;
		margin: 6px 0 24px;
		line-height: 1.35;
		color: rgba(255, 255, 255, 0.7);
		font-size: 15px;
		letter-spacing: -0.02em;
	}

	.platform-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 16px 24px;
		border-radius: 100px;
		background: #fff;
		color: #1c2b33;
		font-size: 16px;
		font-weight: 500;
		text-decoration: none;
		transition: transform 0.2s ease;
	}

	.platform-link:hover {
		transform: translateY(-2px);
	}

	.platform-foot {
		margin: 22px 0 0;
		color: color-mix(in srgb, var(--text-primary) 60%, transparent);
		font-size: 15px;
	}

	.platform-foot a {
		color: var(--text-primary);
		text-underline-offset: 3px;
	}

	/* Desktop overlay: Replika's header row, one wide rounded shot */
	.overlay {
		width: 100%;
		max-width: 1180px;
		margin-top: 140px;
		padding: 0 35px;
	}

	.overlay-note,
	.included-note {
		margin: 0 0 12px;
		color: var(--accent);
		font-size: 16px;
		letter-spacing: -0.03em;
	}

	.overlay-head {
		display: flex;
		justify-content: space-between;
		gap: 32px;
		margin-bottom: 40px;
	}

	.overlay-title {
		max-width: 475px;
		margin: 0;
		font-size: 48px;
		font-weight: 600;
		line-height: 50px;
		letter-spacing: -0.065em;
	}

	.overlay-sub {
		max-width: 370px;
		margin: 0;
		color: color-mix(in srgb, var(--text-primary) 80%, transparent);
		font-size: 16px;
		line-height: 1.2;
		letter-spacing: -0.03em;
	}

	.overlay-shot {
		overflow: hidden;
		border-radius: 56px;
		background: var(--bg-secondary);
	}

	.overlay-shot img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		object-position: 40% 30%;
	}

	/* What you get */
	.included {
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 100%;
		max-width: 1180px;
		margin-top: 140px;
		padding: 0 35px;
		text-align: center;
	}

	.included-title {
		margin: 0 0 48px;
		font-size: 48px;
		font-weight: 600;
		line-height: 50px;
		letter-spacing: -0.045em;
	}

	.included-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 20px;
		width: 100%;
		text-align: left;
	}

	.included-item {
		padding: 28px 26px 30px;
		border-radius: 40px;
		background: var(--bg-secondary);
	}

	.included-face {
		display: grid;
		place-items: center;
		width: 60px;
		height: 60px;
		margin-bottom: 22px;
		border: 3px solid #fff;
		border-radius: 20px;
		color: #1c2b33;
		box-shadow: 0 10px 24px rgba(34, 36, 48, 0.12);
	}

	.included-item h3 {
		margin: 0 0 8px;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.04em;
	}

	.included-item p {
		margin: 0;
		color: color-mix(in srgb, var(--text-primary) 75%, transparent);
		font-size: 15px;
		line-height: 1.35;
	}

	/* Narrow laptops: step him right so the copy clears his arms */
	@media (max-width: 1100px) {
		.dl-figure img {
			left: 77%;
		}
	}

	/* Big monitors: scale the composition up instead of leaving a small island */
	@media (min-width: 1800px) and (min-height: 1000px) {
		.dl-wrap {
			zoom: 1.15;
		}
	}

	@media (min-width: 2200px) and (min-height: 1250px) {
		.dl-wrap {
			zoom: 1.4;
		}
	}

	@media (max-width: 956px) {
		.dl-hero {
			min-height: auto;
			padding: 20px 18px 120px;
		}

		.dl-wrap {
			flex-direction: column;
		}

		/* Stacked: he gets a band under the copy, full bleed */
		.dl-figure {
			position: relative;
			inset: auto;
			order: 2;
			width: 100vw;
			height: clamp(260px, 90vw, 600px);
			margin-bottom: -60px;
		}

		/* Waist up, so he still reads at phone size */
		.dl-figure img {
			top: 3%;
			left: 50%;
			height: 165%;
		}

		.dl-copy {
			align-items: center;
			text-align: center;
		}

		.dl-title {
			font-size: clamp(44px, 8vw, 64px);
			line-height: 0.95;
			letter-spacing: -0.05em;
		}

		.platform-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 14px;
		}

		.platform {
			min-height: 280px;
			padding: 24px;
		}

		.platform-name {
			font-size: 28px;
		}

		.overlay-head {
			flex-direction: column;
			gap: 16px;
		}

		.overlay-title,
		.included-title {
			font-size: 36px;
			line-height: 38px;
		}

		.overlay-shot {
			border-radius: 36px;
		}
	}

	/* Landscape phones: small enough type that the download button fits */
	@media (max-width: 956px) and (max-height: 520px) and (orientation: landscape) {
		.dl-eyebrow {
			margin-bottom: 8px;
		}

		.dl-title {
			font-size: 40px;
		}

		.dl-lead {
			margin: 14px 0 18px;
			font-size: 15px;
			line-height: 20px;
		}
	}

	@media (max-width: 1100px) {
		.included-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	/* Phones: one card per row */
	@media (max-width: 640px) {
		.platform-grid,
		.included-grid {
			grid-template-columns: 1fr;
		}

		.platform {
			min-height: 240px;
		}
	}

	@media (max-width: 768px) {
		.platforms,
		.overlay,
		.included {
			padding: 0 18px;
		}

		.overlay,
		.included {
			margin-top: 96px;
		}
	}
</style>
