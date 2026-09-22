<script lang="ts">
	import { Switch } from 'bits-ui';
	let {
		checked,
		onchange,
		label,
		disabled = false,
		id
	}: {
		checked: boolean;
		onchange: (checked: boolean) => void;
		label: string;
		disabled?: boolean;
		id?: string;
	} = $props();
</script>

<Switch.Root
	{id}
	{checked}
	onCheckedChange={onchange}
	{disabled}
	aria-label={label}
	class="ui-switch"
>
	<Switch.Thumb class="ui-switch-thumb" />
</Switch.Root>

<style>
	:global(.ui-switch) {
		display: inline-flex;
		align-items: center;
		flex: 0 0 30px;
		width: 30px;
		height: 18px;
		padding: 2px;
		border: 0;
		border-radius: var(--radius-full);
		background: transparent;
		position: relative;
		cursor: pointer;
	}
	:global(.ui-switch)::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		height: 18px;
		border-radius: inherit;
		background: var(--bg-tertiary);
		transition: background 200ms ease-out;
	}
	:global(.ui-switch[data-state='checked'])::before {
		background: var(--accent);
	}
	:global(.ui-switch-thumb) {
		display: block;
		width: 14px;
		height: 14px;
		margin-left: 0;
		border-radius: 50%;
		background: var(--bg-page);
		box-shadow: var(--shadow-xs);
		z-index: 1;
		transition: transform 200ms ease-out;
	}
	:global(.ui-switch-thumb[data-state='checked']) {
		background: var(--accent-contrast);
		transform: translateX(12px);
	}
	:global(.ui-switch:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	:global(.ui-switch:disabled) {
		opacity: 0.64;
		cursor: default;
	}
	:global(.ui-switch)::after { content: ''; position: absolute; inset: -13px -7px; }
	@media (pointer: coarse) {
		:global(.ui-switch) { flex-basis: 38px; width: 38px; height: 22px; }
		:global(.ui-switch)::before { height: 22px; }
		:global(.ui-switch-thumb) { width: 18px; height: 18px; }
		:global(.ui-switch-thumb[data-state='checked']) { transform: translateX(16px); }
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.ui-switch)::before,
		:global(.ui-switch-thumb) {
			transition: none;
		}
	}
</style>
