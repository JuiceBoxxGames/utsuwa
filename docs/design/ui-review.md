# App UI review

The app now shares neutral fills, blue primary actions, white foregrounds on blue controls, system typography, and Lucide icons. `DESIGN.md` defines the current rules. App-scoped styles also cover menus and dialogs portaled to the document body.

Settings reuse grouped rows, a searchable sidebar, shared fields and dropdowns, and responsive controls. Character Profile and State & activity are separate views. A shared state summary renders in Character settings, the mood popup, and the desktop overlay.

Onboarding retains its original artwork and card layout while separating avatar, identity, mode, chat, and voice into smaller steps. Optional services can be skipped. Completion saves immediately so reloading does not reopen setup.

Dialogs use contained focus, Escape dismissal, and focus restoration. Chat messages have filled bubbles, and composite inputs show a single outer focus indicator. Overlay controls support touch and keyboard access, preserve collapsed chat drafts, synchronize appearance, and return to the main app's Character state view.

Removed obsolete character sections, the duplicate chat-input file, an unused overlay raycast component and its uncalled service, unused page state, and superseded control styles. The active scene raycaster and native window controls remain in use.

## Validation

Run `pnpm check`, `pnpm test`, `pnpm build`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `pnpm exec playwright test` before submitting changes to the shared UI.

The browser suite covers desktop Chromium and mobile WebKit, including every settings page in both themes, onboarding navigation and persistence, character state, dropdowns, dialog focus, message selection and copying, photo controls, overlay keyboard behavior, and cross-window theme updates. Screenshots are written to `test-results/`.

The native review build was exercised through onboarding, overlay launch, camera controls, Escape, position lock, the shared stats popup, and its return to Character settings. The native resize permission was checked in the build, and the maintainer completed the resize-handle check.
