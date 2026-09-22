# Utsuwa app UI

The app uses layered neutral fills, compact controls, and a single blue accent. Shape and hierarchy come from background color, spacing, and rounded corners. Resting controls and panels do not need visible strokes.

These rules cover the main app, settings, desktop overlay, and their portaled menus and dialogs. The website and documentation pages retain their existing stylesheet and layout.

## Shared styles

- `src/lib/styles/app-theme.css` owns the app palette, typography, button variants, and focus defaults.
- `src/lib/styles/app-controls.css` owns fields, selects, dropdowns, sliders, native checkboxes and radios, badges, and floating panels.
- The `html:has(.app, .overlay-app)` scope includes content portaled to the document body and stops applying outside the app.
- Components consume tokens. Do not add per-component hex colors or duplicate shared control styling. Keep semantic status colors, graph categories, and authored media separate from interface colors.

## Palette

| Purpose | Light | Dark |
| --- | --- | --- |
| Canvas, `--bg-page` | `#FCFCFC` | `#0A0A0A` |
| Panel, `--bg-primary` | `#F3F3F5` | `#171717` |
| Nested panel, `--bg-secondary` | `#EAEAEC` | `#222222` |
| Strong neutral, `--bg-tertiary` | `#D4D4DA` | `#363636` |
| Control, `--control-bg` | `#E7E7EB` | `#292929` |
| Hover, `--control-hover` | `#DCDCE2` | `#343434` |
| Pressed control, `--control-selected` | `#CDCDD5` | `#424242` |
| Selected tab, `--selection-bg` | `#FFFFFF` | `#3A3A3A` |
| Elevated menu or dialog | `#FFFFFF` | `#232323` |
| Primary text, `--text-primary` | `#27272A` | `#F5F5F5` |
| Secondary text, `--text-secondary` | `#71717B` | `#818181` |
| Primary blue, `--accent` | `#04B2FD` | `#04B2FD` |
| Text and icons on blue, `--accent-contrast` | `#FFFFFF` | `#FFFFFF` |

Use the same blue in both themes. Derive hover colors and muted focus washes from the accent. Filled primary buttons always use white text and icons. Activated blue switches, radio dots, and checkbox marks also use white foregrounds.

Support light, dark, and system preferences. Theme changes must apply to open menus and synchronize between the main and overlay windows.

## Shape, spacing, and typography

Use the system sans serif font. Control labels are normally 14px with a 20px line height. Descriptions are 13px; group headings are 14px and muted; page headings are 20px. Use normal case and avoid decorative letter spacing.

Control corners are 8px, grouped panels 12px, and dialogs 18px. Small badges use 4px corners. Reserve circular shapes for switch tracks, radio controls, status dots, and artwork that requires them.

Desktop controls are 32px high, with 28px compact and 36px large variants. Touch controls have at least 44px targets. Settings groups use 16px padding, reduced to 12px on narrow screens. Separate groups by 24 to 28px.

Panels use neutral fills. Resting border tokens are transparent. Use shadows to separate floating menus and dialogs from the content beneath them. Avoid glossy gradients, inset highlights, and decorative glows on ordinary controls.

## Buttons and selection

Use `Button.svelte` or the shared `.btn` classes:

- Primary actions use the blue fill with white text and icons.
- Secondary actions use a neutral fill, with distinct hover and pressed fills.
- Ghost actions start transparent and gain a neutral fill on hover.
- Destructive actions use the error color and require the existing confirmation behavior.
- Icon actions use the shared icon-button size and an accessible name.

Use `Switch.svelte` for booleans, `SegmentedControl.svelte` for short exclusive choices, and `Tabs.svelte` to switch panels. Selected tabs use a distinct fill. Expose selection with `aria-pressed`, `aria-selected`, or the component's native semantics. Expandable controls expose `aria-expanded`.

## Inputs and focus

Text fields and secondary controls use the control fill. Use `settings-field` for settings inputs and textareas, and the shared `Select.svelte` for single-choice dropdowns. Provider and model menus use the same popup and item states.

Every keyboard-operable control needs a visible focus indicator. A composite input shows one indicator around its full container. The chat textarea and settings-search input must not draw an additional square outline inside that container. Ordinary fields retain their rounded focus treatment. Keep error indicators visible.

Keep native range-input keyboard behavior. Use `rangeProgress` so the filled track follows typing, arrow keys, and resets. Do not replace existing persistence or validation handlers when changing presentation.

## Settings

Use one readable column with a maximum width of 960px. The desktop sidebar provides category navigation and search; narrow layouts use a horizontal category row. Keep page titles, descriptions, and section headings consistent.

`SettingsSection.svelte` places a heading and optional actions above a filled group. Put labels and descriptions on the left and controls on the right. Separate related rows with spacing. Nested sections use a distinct neutral fill. Let controls wrap beneath their labels on narrow screens.

Character settings has Profile and State & activity views. Reuse `CompanionStateSummary.svelte` in the character page, mood popup, and overlay so labels, values, and mode-specific visibility stay consistent.

## Chat and overlay

Chat window messages have rounded, filled neutral bubbles. Assistant replies use the control fill; user messages use the stronger selected fill. Keep message text selectable, long content wrapped, and copy actions accessible. The typing indicator uses the assistant bubble treatment.

The composer uses a neutral fill and one outer focus treatment. Preserve drafts and text-input focus during replies, layout changes, and overlay collapse. Support keyboard composition without sending prematurely.

Overlay controls share the main app's palette and components. Keep controls discoverable for touch and keyboard users. Escape closes the current control panel before its parent. Return focus to the opening control. Main-window navigation must preserve the overlay when a handoff fails and show an actionable error.

## Onboarding

Preserve the welcome artwork, modal layout, spacing, avatar cards, and mode cards. Improve the sequence without replacing that visual treatment.

Present one small decision per step: welcome, avatar, name, mode, chat, voice, and completion. Keep advanced fields behind disclosures. Chat and voice are optional. Back preserves edits, and the final action persists completion before leaving setup.

## Menus, dialogs, and accessibility

Use the existing Bits UI components for modal dialogs, dropdowns, tabs, and popovers. Floating layers use nearly opaque neutral fills with restrained blur and shadows. Keep them within the viewport and allow long content to scroll.

Dialogs need accessible titles, contained keyboard focus, Escape dismissal, and focus restoration. Closing a nested photo returns to its photoboard. Dropdowns support keyboard selection and return focus to their trigger.

Honor reduced motion. Preserve status announcements, disabled states, touch targets, and error feedback. Use Lucide through `Icon.svelte` for interface icons; retain brand marks and authored art where appropriate.

## Review

Check both themes at desktop and mobile widths. Include focused fields, disabled controls, active switches, selected tabs, dropdown search, long messages, empty states, dialogs, and overlay controls. Inspect screenshots as well as interaction tests.

Implementation notes and review coverage are in [docs/design/ui-review.md](docs/design/ui-review.md). Third-party license notices are maintained separately in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
