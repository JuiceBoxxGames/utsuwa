Settings pages use the Utsuwa app theme in `src/lib/styles/app-theme.css`. Keep provider values, persistence, validation, and event handlers in their existing stores and page components when changing presentation.

- `SettingsSection.svelte` renders a section heading, optional description and actions, and a filled neutral group beneath them. Use `outlined` for a distinct nested fill inside an existing card, as in OmniVoice.
- `../ui/Switch.svelte` renders boolean controls. Pass the current value, the existing change handler, and a label. Its compact track has an expanded pointer target and supports keyboard input.
- `../ui/SegmentedControl.svelte` renders short, mutually exclusive choices. `../ui/Tabs.svelte` switches between content panels with keyboard navigation.
- `../ui/Select.svelte` renders single-choice dropdowns with keyboard navigation and a portaled menu. Use it instead of native selects. Provider and model menus share its popup styling.
- `src/lib/styles/app-controls.css` owns input, dropdown, checkbox, radio, range, and dialog recipes. `settings-controls.css` adds field layout helpers. Use `settings-field`, `settings-range`, and `settings-label`. Add `use:rangeProgress={value}` to range inputs so the track follows keyboard edits and programmatic resets.
- Reuse `Button`, `ProviderDropdown`, `ModelDropdown`, and `Tooltip` for their existing purposes. Keep mobile actions at least 44px high and use the shared reduced-motion behavior.

`tests/browser/settings.spec.ts` visits every settings route in light and dark themes on desktop Chromium and mobile WebKit. It checks horizontal overflow and exercises OmniVoice and shared controls. Run it with `pnpm test:browser tests/browser/settings.spec.ts`. The suite starts a separate Vite server on port 5188 so a development server's hot-reloaded stores cannot affect the tests.
