Settings pages share Utsuwa's existing color, radius, shadow, and typography tokens. Keep provider values, persistence, validation, and event handlers in their existing stores and page components when changing presentation.

- `SettingsSection.svelte` renders a settings card with a heading, optional description, and optional actions. Use `outlined` for groups inside an existing card, as in OmniVoice.
- `../ui/Switch.svelte` renders boolean controls. Pass the current value, the existing change handler, and a label. It has a 44px target and supports keyboard input.
- `../ui/SegmentedControl.svelte` renders short, mutually exclusive choices. `../ui/Tabs.svelte` switches between content panels with keyboard navigation.
- `settings-controls.css` owns native input, select, textarea, range, and label styles. Use `settings-field`, `settings-range`, and `settings-label`. `api-key-input` remains an alias for existing provider fields.
- Reuse `Button`, `ProviderDropdown`, `ModelDropdown`, and `Tooltip` for their existing purposes. Keep mobile actions at least 44px high and use the shared reduced-motion behavior.

`tests/browser/settings.spec.ts` visits every settings route in light and dark themes on desktop Chromium and mobile WebKit. It checks horizontal overflow and exercises OmniVoice and shared controls. Run it with `pnpm test:browser tests/browser/settings.spec.ts`. The suite starts a separate Vite server on port 5188 so a development server's hot-reloaded stores cannot affect the tests.
