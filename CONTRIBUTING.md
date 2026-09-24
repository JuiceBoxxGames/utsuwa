# Contributing to Utsuwa

Thank you for your interest in contributing to Utsuwa! Community PRs are welcome and reviewed with care. This document tells you what to expect and what gets a PR merged quickly.

## Getting Started

### Prerequisites

- Node.js 22 or higher
- pnpm
- [Rust toolchain](https://rustup.rs/) (only needed for desktop app development)

### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/utsuwa.git
   cd utsuwa
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Start the development server:
   ```bash
   pnpm dev
   ```
5. Open [http://localhost:5173](http://localhost:5173) in your browser
6. For desktop development, run `pnpm tauri dev` instead (requires Rust)

## What Lands Quickly

A short list, learned from real PRs. Following it is the difference between one review round and three.

**One thing per PR.** A PR that bundles a feature, a refactor, and a settings change will be asked to split. Small focused PRs get reviewed fast; each piece moves at its own speed.

**Tests for pure logic.** The engine and helper modules are deliberately pure and testable, and CI runs the full suite on every PR. If you add or change a pure function (anything in `src/lib/engine/`, prompt building, parsing, budgets, truncation, dedup), add tests in the same PR. Pattern: `*.test.ts` next to the module, `node:test` runner, and relative imports need the `.ts` extension to run under `node --test`. Edge cases are first-class here: empty inputs, boundary values, and clock weirdness are exactly what the existing suites cover.

**Gating lives in the pipeline, not the UI.** Hiding a control for some providers does not scope the feature. If a setting should only apply to certain providers or platforms, enforce that where the value is consumed (the chat pipeline, the server route), not just where the checkbox renders. A hidden toggle that still fires is a bug.

**Don't change defaults out from under existing users.** If your change alters what happens for people who never touch your new setting (prompt composition, request parameters, truncation), call it out explicitly in the PR description, or better, make the old behavior the default.

**No fork-local configuration upstream.** Personal ignore rules, editor and tool files, and fork housekeeping belong in your fork (or `.git/info/exclude`), not in upstream `.gitignore`.

**Both provider surfaces, or neither.** Provider configuration currently renders in two places: onboarding (`ServicesStep`) and settings (`LlmSettings`, `TtsSettings`, `SttSettings`). Until they share components, a provider UI change should keep the two consistent. Say so in the PR if you deliberately did only one.

**Match the code around you.** TypeScript everywhere, Svelte 5 runes (`$state`, `$derived`, `$effect`), design tokens instead of hardcoded colors (`var(--accent)`, not hex), and minimal comments that explain why, not what.

Before pushing:

```bash
pnpm check   # svelte-check, must be 0 errors 0 warnings
pnpm test    # full unit suite, must be green
pnpm test:browser  # Playwright browser tests (tests/browser)
```

CI runs both plus a Rust `cargo check` on every PR. A red check means no review until it's green.

## Adding a Provider Integration

LLM, TTS, and STT providers follow an established pattern. If you're adding or extending one:

- Default base URLs live in one place: `src/lib/services/providers/provider-defaults.ts`. Never duplicate a URL into a component or route.
- Local and self-hosted servers need base-URL normalization and origin handling like the existing Ollama and local-TTS integrations. Read one of those first and mirror it.
- Web builds route cloud calls through the SvelteKit server routes; desktop and local providers call directly. Your change usually needs both paths, and they must behave identically (including auth headers when there is no API key).
- Fixed cloud providers always use their official endpoint. User-supplied base URLs are for local and custom providers only.

## Adding Strings (Translations)

Utsuwa uses [Paraglide JS](https://paraglidejs.com) for translations. Only the landing page is localized so far (English at `/`, Japanese at `/ja`); the app, docs, and blog are still English-only.

- Messages live in `messages/en.json` (the source of truth) and `messages/ja.json`. Add every new key to both files; a missing or renamed key fails `pnpm check`.
- Use them in components as `m.key_name()` from `$lib/paraglide/messages`, with named parameters like `m.stories_show({ title })`.
- The code in `src/lib/paraglide/` is generated and ignored by git. `pnpm check` and `pnpm build` regenerate it, and `pnpm dev` compiles it on startup. A running dev server may not notice message edits, so run `pnpm check` (or restart the server) after changing them.
- Which URLs get a locale prefix is set in `project.inlang/paraglide.config.js`. Both the Vite plugin and `pnpm check` read it, so change routing there rather than in `vite.config.ts`.

## Scope and Content Decisions

Some changes are product decisions, not code decisions: anything that changes what Utsuwa ships in its prompts, how the project positions itself, or what the hosted deployment transmits. Open an issue to discuss before writing code, it saves everyone time.

One standing decision, so nobody has to rediscover it: **Utsuwa core does not ship content preambles or filter-override text.** The persona system prompt is fully user-editable, on the user's machine, in the user's words, and that is where tone and content boundaries belong. PRs that bundle preamble text into the app will be asked to convert to documentation instead.

## Review Expectations

- Reviews check correctness first (including edge cases and cross-file effects), then scoping, duplication, and consistency. Expect specific, actionable comments; expect to be asked for tests.
- `main` is production and moves fast, including maintainer refactors. If a refactor is about to touch an area your open PR changes, you'll get a heads-up in your PR thread; a rebase may still be needed. Rebasing promptly keeps your PR reviewable.
- Significant features should update docs in the same PR: `README.md` and, for anything touching the companion engine or memory, `src/content/docs/technology/companion-system.md`.
- Security issues: please report privately per [SECURITY.md](SECURITY.md), not in a public issue.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (web or desktop, browser if web, OS, Node version)
- Screenshots if applicable

### Suggesting Features

Feature requests are welcome! Please create an issue with:

- A clear description of the feature
- The problem it solves or use case it addresses
- Any implementation ideas you have

### Pull Requests

1. Create a new branch: `feature/your-feature-name`, `fix/description`, or `docs/description`
2. Make your changes, following the sections above
3. Run `pnpm check` and `pnpm test`
4. Use conventional commit style for the PR title (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`); PRs are squash-merged, so the title becomes the commit
5. Push to your fork and open the PR with a description of what changed and how you tested it

## Project Structure

The repo contains both the product and its website. Product code is what most contributions touch:

```
src/
├── lib/
│   ├── ai/            # LLM response parsing and prompt building        [product]
│   ├── components/    # Reusable Svelte components                      [product, except marketing/]
│   ├── config/        # App and docs configuration
│   ├── data/          # Event definitions and static data               [product]
│   ├── db/            # IndexedDB database (Dexie)                      [product]
│   ├── engine/        # Companion engine: state, memory, events         [product, pure + tested]
│   ├── services/      # LLM, TTS, STT, and storage services             [product]
│   ├── stores/        # Svelte 5 rune stores                            [product]
│   ├── styles/        # Shared CSS
│   ├── types/         # TypeScript type definitions
│   └── utils/         # Utility functions
├── content/
│   ├── blog/          # Blog posts                                      [website]
│   └── docs/          # Documentation site content                      [website]
├── routes/
│   ├── app/           # Main application                                [product]
│   ├── api/           # Server routes (chat proxy, model discovery)     [product]
│   ├── blog/, docs/   # Website routes                                  [website]
│   ├── overlay/       # Desktop overlay window                          [product]
│   └── +page.svelte   # Landing page                                    [website]
└── app.css            # Global styles and design tokens
src-tauri/              # Tauri desktop shell (Rust)
```

## Releases

Desktop builds are produced automatically by CI. There's no need to build installers on your own machine for a release.

Maintainers cut a release by pushing a version tag:

```bash
# Bump the version in package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json first
git tag v0.9.0
git push origin v0.9.0
```

The [`Release` workflow](.github/workflows/release.yml) then builds the app on macOS, Windows, and Linux runners in parallel and attaches the installers to a **draft** GitHub Release:

- **macOS**: `.dmg` (universal: Apple Silicon + Intel)
- **Windows**: `.exe` installer
- **Linux**: `.AppImage`, `.deb`, and `.rpm`

A maintainer reviews the draft, edits the release notes, and publishes it. You can also trigger the workflow manually from the Actions tab to verify a build without cutting a release.

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.

## License

By contributing to Utsuwa, you agree that your contributions are licensed under the AGPL-3.0-or-later, and you confirm you have the right to submit the work. You keep the copyright to your contribution.
