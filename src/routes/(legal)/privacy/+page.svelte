<script lang="ts">
	import { SITE_URL, GITHUB_REPO } from '$lib/config/site';
</script>

<svelte:head>
	<title>Privacy Policy - Utsuwa</title>
	<meta
		name="description"
		content="How Utsuwa handles your data: no accounts, no analytics, no tracking. Your conversations, memories, and settings live on your device."
	/>
	<link rel="canonical" href={`${SITE_URL}/privacy`} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Privacy Policy - Utsuwa" />
	<meta
		property="og:description"
		content="How Utsuwa handles your data: no accounts, no analytics, no tracking."
	/>
	<meta property="og:url" content={`${SITE_URL}/privacy`} />
	<meta property="og:site_name" content="Utsuwa" />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
</svelte:head>

<header class="legal-header">
	<h1>Privacy Policy</h1>
	<p class="legal-date">Effective: July 3, 2026</p>
</header>

<div class="legal-summary">
	<p class="legal-summary-title">The short version</p>
	<ul>
		<li>No accounts, no analytics, no ads, no tracking cookies.</li>
		<li>Your conversations, memories, and settings are stored on your device, not on our servers.</li>
		<li>Messages go to the AI provider you choose, using your own API keys.</li>
		<li>We never sell your personal information. We don't even have any.</li>
	</ul>
</div>

<article class="prose legal-prose">
	<p>
		Utsuwa is an open-source AI companion built to be local-first. This policy explains what
		happens to your data when you use the Utsuwa website and hosted web app (utsuwa.ai and its
		subdomains) and the Utsuwa desktop app, operated by Juice Boxx Games LLC. The short
		version: your companion lives on your device, and we like it that way.
	</p>

	<h2 id="what-we-dont-collect">What we don't collect</h2>
	<p>
		Utsuwa has no account system, so we never ask for your name, email address, or a password. We
		run no analytics or tracking scripts on the website or in the app, we set no advertising or
		tracking cookies, and we show no ads. There is no database of users on our side, and we can't
		see your conversations. We couldn't sell your personal information if we wanted to, because we
		don't have any.
	</p>

	<h2 id="where-your-data-lives">Where your data lives</h2>
	<p>
		Everything that makes your companion yours lives on your device: conversation history,
		extracted memories, companion state, persona and display settings, and the API keys you enter.
		In the web app this is your browser's local storage (IndexedDB and localStorage); in the
		desktop app it's the app's own local storage on your computer. None of it is uploaded to or
		stored on our servers.
	</p>
	<p>
		To delete your data, use the reset options in the app's settings, clear your browser's site
		data, or uninstall the desktop app. There is no copy on our side to ask us to delete.
	</p>

	<h2 id="how-messages-reach-your-provider">How your messages reach your AI provider</h2>
	<p>
		Utsuwa is bring-your-own-AI: you connect it to a provider you choose (for example OpenAI,
		Anthropic, or a local model through Ollama or LM Studio) using your own API key. How your
		messages travel depends on where you run Utsuwa:
	</p>
	<ul>
		<li>
			<strong>Desktop app:</strong> your messages go directly from your device to your chosen
			provider. They do not pass through our servers.
		</li>
		<li>
			<strong>Web app:</strong> because of browser cross-origin restrictions, requests to cloud
			providers may be relayed through our servers. The relay forwards your request to your
			provider and streams the response back to you. We do not store your messages or API keys,
			and we do not write conversation content to our logs.
		</li>
		<li>
			<strong>Local providers:</strong> if you use Ollama or LM Studio, your conversations never
			leave your machine or local network at all.
		</li>
	</ul>
	<p>
		Once a message reaches your provider, that provider's own privacy policy governs how it is
		handled. We encourage you to review the data-use policies of whichever provider you connect.
	</p>

	<h2 id="voice">Voice features</h2>
	<p>
		If you use voice chat, microphone audio is captured only while you're actively using it and is
		sent directly from your device to the speech provider you configured for transcription.
		Generated speech works the same way in reverse. We don't receive or store your audio.
	</p>

	<h2 id="memory">Memory runs on your device</h2>
	<p>
		Semantic search over your companion's memories happens entirely on your device, using a small
		embedding model that runs locally in the app. The model file is downloaded once from a public
		CDN (Hugging Face). The memories themselves are stored in your local storage like everything
		else.
	</p>

	<h2 id="third-parties">Third-party services we rely on</h2>
	<ul>
		<li>
			<strong>Your AI providers</strong> process the messages and audio you send them under their
			own privacy policies.
		</li>
		<li>
			<strong>Vercel</strong> hosts the website and web app. Like any host, it produces standard,
			short-lived infrastructure logs (such as IP addresses and request timestamps) as part of
			serving pages. We don't use these to identify or profile anyone.
		</li>
		<li>
			<strong>GitHub</strong> serves our source code, releases, and desktop downloads. The desktop
			app also checks GitHub Releases for updates, so GitHub receives standard request data (like
			your IP address) when it does.
		</li>
		<li>
			<strong>Hugging Face</strong> serves the on-device memory model file the first time the app
			loads it.
		</li>
	</ul>

	<h2 id="children">Age</h2>
	<p>
		Utsuwa is intended for adults aged 18 and over. It is not designed for or directed at anyone
		under 18, and we do not knowingly collect personal information from anyone, minors included,
		since we don't collect personal information at all.
	</p>

	<h2 id="changes">Changes to this policy</h2>
	<p>
		If we change this policy, we'll update this page and the date at the top. If a change is
		significant (for example, if a future feature ever introduces data collection), we'll say so
		clearly in our release notes.
	</p>

	<h2 id="contact">Contact</h2>
	<p>
		The fastest way to reach us is on
		<a href={`${GITHUB_REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub</a>. Utsuwa
		is maintained by Juice Boxx Games LLC, a limited liability company formed in Ohio, USA.
	</p>
</article>

<style>
	.legal-header {
		text-align: center;
		margin: 0 0 2.5rem;
	}

	.legal-header h1 {
		font-size: clamp(2.25rem, 5vw, 3rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.02em;
		color: var(--text-primary);
		margin: 0 0 1rem;
	}

	.legal-date {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin: 0;
	}

	.legal-summary {
		background: var(--bg-tertiary);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-xl);
		padding: 1.5rem 1.75rem;
		margin: 0 0 3rem;
	}

	.legal-summary-title {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-tertiary);
		margin: 0 0 0.75rem;
	}

	.legal-summary ul {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.legal-summary li {
		font-size: 0.9rem;
		line-height: 1.55;
		color: var(--text-secondary);
	}

	.legal-prose {
		min-width: 0;
	}

	/* Load-in matching the blog post header rhythm. */
	.legal-header,
	.legal-summary {
		animation: legalEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
	}

	.legal-summary {
		animation-delay: 0.05s;
	}

	@keyframes legalEnter {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
