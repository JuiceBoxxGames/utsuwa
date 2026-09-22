<script lang="ts" generics="Value extends string">
	import { Select } from 'bits-ui';
	import Icon from './Icon.svelte';

	let {
		value = $bindable('' as Value), options, onchange, label, id,
		placeholder = 'Select an option', disabled = false, class: className = '', style
	}: {
		value?: Value;
		options: ReadonlyArray<{ value: Value; label: string; disabled?: boolean }>;
		onchange?: (value: Value) => void;
		label?: string;
		id?: string;
		placeholder?: string;
		disabled?: boolean;
		class?: string;
		style?: string;
	} = $props();
	const selectedLabel = $derived(options.find(option => option.value === value)?.label ?? placeholder);
	function select(next: string) {
		const option = options.find(option => option.value === next && !option.disabled);
		if (!option) return;
		value = option.value;
		onchange?.(option.value);
	}
</script>

<Select.Root type="single" {value} onValueChange={select} items={[...options]} {disabled} allowDeselect={false}>
	<Select.Trigger {id} {style} aria-label={label} data-value={value} class="ui-select-trigger {className}">
		<span class="ui-select-value">{selectedLabel}</span><Icon name="chevron-down" size={12} />
	</Select.Trigger>
	<Select.Portal>
		<Select.Content class="ui-select-content" sideOffset={4} align="start" collisionPadding={8}>
			<Select.Viewport class="ui-select-viewport">
				{#each options as option (option.value)}
					<Select.Item value={option.value} label={option.label} disabled={option.disabled} data-value={option.value} class="ui-select-item">
						<span>{option.label}</span>
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
