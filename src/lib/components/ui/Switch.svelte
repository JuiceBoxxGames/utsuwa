<script lang="ts">
	import { Switch } from 'bits-ui';
	let {
		checked,
		onchange,
		label,
		disabled = false
	}: {
		checked: boolean;
		onchange: (checked: boolean) => void;
		label: string;
		disabled?: boolean;
	} = $props();
</script>

<Switch.Root {checked} onCheckedChange={onchange} {disabled} aria-label={label} class="ui-switch">
	<Switch.Thumb class="ui-switch-thumb" />
</Switch.Root>

<style>
	:global(.ui-switch) {
		display: inline-flex;
		align-items: center;
		flex: 0 0 44px;
		width: 44px;
		height: 44px;
		padding: 0 2px;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		position: relative;
		cursor: pointer;
	}
	:global(.ui-switch)::before {
		content: '';
		position: absolute;
		left: 2px;
		right: 2px;
		height: 24px;
		border-radius: inherit;
		background: var(--bg-tertiary);
		transition: background 200ms ease-out;
	}
	:global(.ui-switch[data-state='checked'])::before {
		background: var(--accent);
	}
	:global(.ui-switch-thumb) {
		display: block;
		width: 20px;
		height: 20px;
		margin-left: 2px;
		border-radius: 50%;
		background: var(--bg-primary);
		box-shadow: var(--shadow-xs);
		z-index: 1;
		transition: transform 200ms ease-out;
	}
	:global(.ui-switch-thumb[data-state='checked']) {
		transform: translateX(16px);
	}
	:global(.ui-switch:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	:global(.ui-switch:disabled) {
		opacity: 0.45;
		cursor: default;
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.ui-switch)::before,
		:global(.ui-switch-thumb) {
			transition: none;
		}
	}
</style>
