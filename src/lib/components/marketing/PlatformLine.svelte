<script lang="ts">
	import OsIcon from './OsIcon.svelte';
	import { m } from '$lib/paraglide/messages';

	// "Free for macOS, Windows, and Linux" with the real OS marks inline.
	let { tone = 'sky' }: { tone?: 'sky' | 'ink' } = $props();
</script>

<p class="platforms" class:ink={tone === 'ink'}>
	{m.platforms_before()}<span class="os"><OsIcon os="macos" size={15} />macOS</span>{m.platforms_between1()}<span
		class="os"><OsIcon os="windows" size={15} />Windows</span
	>{m.platforms_between2()}<span class="os"><OsIcon os="linux" size={15} />Linux</span>{m.platforms_after()}
</p>

<style>
	.platforms {
		margin: 24px 0 0;
		color: rgba(255, 255, 255, 0.86);
		text-shadow: 0 1px 12px rgba(0, 40, 100, 0.28);
		font-size: 1rem;
		line-height: 1.25rem;
		letter-spacing: -0.03em;
	}

	.platforms.ink {
		color: color-mix(in srgb, var(--text-primary) 70%, transparent);
		text-shadow: none;
	}

	.os {
		white-space: nowrap;
	}

	/* Tailwind's preflight makes svgs block; keep the marks in the text run */
	.os :global(svg) {
		display: inline-block;
		margin-right: 4px;
		vertical-align: -2px;
	}
</style>
