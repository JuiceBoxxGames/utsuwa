<script lang="ts">
	import '$lib/styles/marketing.css';
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

	const platforms: { name: Os; icon: 'macos' | 'windows' | 'linux'; note: string }[] = [
		{ name: 'macOS', icon: 'macos', note: 'Apple Silicon and Intel, universal .dmg' },
		{ name: 'Windows', icon: 'windows', note: 'Windows 10 and 11, x64 .exe installer' },
		{ name: 'Linux', icon: 'linux', note: '.AppImage, .deb, and .rpm' }
	];

	const included = [
		{ icon: GiftIcon, title: 'Free forever', body: 'No subscription and no paywalled features. The whole app is yours.' },
		{ icon: UserXIcon, title: 'No account', body: 'Nothing to sign up for. Open it and start.' },
		{ icon: KeyRoundIcon, title: 'Your keys', body: 'Bring your own model keys, or run a local model with none at all.' },
		{ icon: HardDriveIcon, title: 'Stays on device', body: 'Characters and conversations live in local storage, not our servers.' }
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
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-ink.jpg`} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-ink.jpg`} />
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

<div class="docs-site site-shell">
	<SiteNav />

	<main>
		<section class="dl-hero site-container" aria-labelledby="dl-title">
			<p class="site-eyebrow">Download</p>
			<h1 id="dl-title" class="site-h1">Utsuwa for your desktop</h1>
			<p class="site-lede">
				A transparent overlay you can pin over anything, and a global hotkey to summon your companion. Free and
				open source on every platform.
			</p>
			<div class="site-actions">
				<a href={downloadFor(os)} download class="btn btn-primary btn-pill">
					<DownloadIcon size={16} strokeWidth={2.25} />
					Download for {os}
				</a>
				<a href={sectionUrl('app')} class="btn btn-secondary btn-pill">
					Try it in your browser <ArrowRightIcon size={15} strokeWidth={2.25} />
				</a>
			</div>
			<div class="dl-figure site-panel">
				<img
					src="/landing-page/download-avatar-c.webp"
					alt="A 3D VRM companion with dark hair and a high-collared jacket, arms crossed"
					width="1200"
					height="1500"
					fetchpriority="high"
				/>
			</div>
		</section>

		<section class="dl-section site-container" aria-labelledby="platforms-title">
			<h2 id="platforms-title" class="site-h2">Pick your platform</h2>
			<div class="platform-grid">
				{#each platforms as p (p.name)}
					<article class="platform">
						<div class="platform-top">
							<OsIcon os={p.icon} size={36} />
							{#if p.name === os}<span class="platform-tag">Your system</span>{/if}
						</div>
						<h3 class="platform-name">{p.name}</h3>
						<p class="platform-note">{p.note}</p>
						<a href={downloadFor(p.name)} download class="btn btn-secondary btn-pill platform-link">
							Download <ArrowDownIcon size={15} strokeWidth={2.25} />
						</a>
					</article>
				{/each}
			</div>
			<p class="platform-foot">
				Builds are published on
				<a href={GITHUB_RELEASES} target="_blank" rel="noopener noreferrer">GitHub Releases</a>. Older versions and
				release notes live there too.
			</p>
		</section>

		<section class="dl-section site-container" aria-labelledby="overlay-title">
			<div class="section-head">
				<p class="site-eyebrow">Desktop overlay</p>
				<h2 id="overlay-title" class="site-h2">Pin them over anything</h2>
				<p class="site-lede">
					A transparent, always-on-top window you can drag anywhere. Hit the global hotkey and they are there, over
					your browser, your code, or your game.
				</p>
			</div>
			<div class="overlay-shot site-panel">
				<img
					{...marketingImage('/marketing/desktop-app.webp', '(max-width: 1200px) calc(100vw - 48px), 1152px')}
					alt="The Utsuwa desktop overlay: a VRM companion floating on a macOS desktop"
					loading="lazy"
				/>
			</div>
		</section>

		<section class="dl-section site-container" aria-labelledby="included-title">
			<div class="section-head">
				<p class="site-eyebrow">What you get</p>
				<h2 id="included-title" class="site-h2">No catch. Really.</h2>
			</div>
			<div class="included-grid">
				{#each included as item (item.title)}
					<div class="included-item">
						<item.icon size={22} strokeWidth={1.75} />
						<h3>{item.title}</h3>
						<p>{item.body}</p>
					</div>
				{/each}
			</div>
		</section>

		<section class="dl-section site-container" aria-labelledby="source-title">
			<div class="source site-panel">
				<p class="site-eyebrow">AGPL-3.0, built on SvelteKit, Three.js, and Tauri.</p>
				<h2 id="source-title" class="site-h2">Rather build it yourself?</h2>
				<p class="site-lede">Clone the repo, install dependencies, and run it locally, or fork it and make it your own.</p>
				<a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-pill">
					View the source <ArrowRightIcon size={15} strokeWidth={2.25} />
				</a>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>

<style>
	.dl-hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 20px;
		padding-top: clamp(56px, 9vw, 120px);
		text-align: center;
	}

	.dl-hero .site-h1 {
		max-width: 14ch;
	}

	.dl-hero .site-lede {
		max-width: 50ch;
	}

	.dl-hero .site-actions {
		justify-content: center;
		margin-top: 8px;
	}

	.dl-figure {
		display: flex;
		justify-content: center;
		width: 100%;
		height: clamp(360px, 52vw, 620px);
		margin-top: clamp(32px, 5vw, 56px);
	}

	.dl-figure img {
		height: 118%;
		width: auto;
		object-fit: contain;
		object-position: top;
	}

	.dl-section {
		padding-top: var(--site-section);
	}

	.section-head {
		display: flex;
		flex-direction: column;
		gap: 14px;
		max-width: 640px;
		margin-bottom: 40px;
	}

	.dl-section > .site-h2 {
		margin-bottom: 32px;
	}

	.platform-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}

	.platform {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 8px;
		padding: 28px;
		border-radius: 24px;
		background: var(--bg-primary);
	}

	.platform-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		width: 100%;
		margin-bottom: 20px;
		color: var(--text-primary);
	}

	.platform-tag {
		padding: 4px 10px;
		border-radius: 999px;
		background: var(--bg-page);
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 500;
	}

	.platform-name {
		margin: 0;
		font-size: 22px;
		font-weight: 500;
	}

	.platform-note {
		margin: 0 0 16px;
		color: var(--text-secondary);
		font-size: 15px;
	}

	.platform-link {
		margin-top: auto;
	}

	.platform-foot {
		margin: 24px 0 0;
		color: var(--text-secondary);
		font-size: 14px;
	}

	.platform-foot a {
		color: var(--text-primary);
		text-underline-offset: 3px;
	}

	.overlay-shot img {
		display: block;
		width: 100%;
		height: auto;
	}

	.included-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 32px;
	}

	.included-item h3 {
		margin: 16px 0 6px;
		font-size: 17px;
		font-weight: 500;
	}

	.included-item p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 15px;
		line-height: 1.5;
	}

	.source {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		padding: clamp(40px, 7vw, 88px) 24px;
		text-align: center;
	}

	.source .site-lede {
		max-width: 46ch;
	}

	@media (max-width: 900px) {
		.platform-grid {
			grid-template-columns: 1fr;
		}

		.included-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 560px) {
		.included-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
