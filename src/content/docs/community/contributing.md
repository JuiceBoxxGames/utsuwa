---
title: Contributing
description: How to set up Utsuwa for development and get a pull request merged.
---

# Contributing

Contributions to Utsuwa are welcome. This page covers setup, the checks every pull request must pass, and the conventions reviewers look for. The full version lives in [CONTRIBUTING.md](https://github.com/JuiceBoxxGames/utsuwa/blob/main/CONTRIBUTING.md) in the repository.

## Prerequisites

- Node.js 22 or higher
- pnpm
- [Rust toolchain](https://rustup.rs/), only for desktop app development

## Development Setup

1. Fork the repository.
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
5. Open [http://localhost:5173](http://localhost:5173).
6. For the desktop app, run `pnpm tauri dev` instead (requires Rust).

## Checks

Run these before pushing. CI runs them on every pull request, along with `pnpm build` and a Rust `cargo check`.

```bash
pnpm check         # svelte-check, must report 0 errors and 0 warnings
pnpm test          # unit tests (node --test), must pass
pnpm test:browser  # Playwright tests in tests/browser
```

`pnpm test:browser` needs a Playwright browser installed once with `pnpm exec playwright install chromium`. A red check means no review until it is green.

## What Lands Quickly

- **One thing per pull request.** A feature, a refactor, and a settings change bundled together will be asked to split.
- **Tests for pure logic.** If you add or change a pure function (anything in `src/lib/engine/`, prompt building, parsing, budgets, truncation, dedup), add tests in the same pull request. Put `*.test.ts` next to the module and use the `node:test` runner. Relative imports need the `.ts` extension to run under `node --test`.
- **Gating lives in the pipeline, not the UI.** If a setting only applies to some providers or platforms, enforce that where the value is used, such as the chat pipeline or a server route. A hidden toggle that still fires is a bug.
- **Don't change defaults for existing users.** If your change alters behavior for people who never touch your new setting, say so in the pull request, or keep the old behavior as the default.
- **Keep both provider surfaces in sync.** Provider setup appears in onboarding and in Settings. A provider UI change should update both.
- **Match the code around you.** TypeScript, Svelte 5 runes (`$state`, `$derived`, `$effect`), design tokens instead of hardcoded colors (`var(--accent)`), and short comments that explain why.

## Adding a Provider

- Default base URLs live only in `src/lib/services/providers/provider-defaults.ts`.
- Local servers need base-URL normalization and origin handling like the Ollama and Local TTS integrations. Read one of those first.
- Web builds send cloud calls through the SvelteKit server routes. Desktop and local providers call directly. Both paths must behave the same.
- Fixed cloud providers always use their official endpoint. User-supplied base URLs are for local and custom providers.

## Adding Strings

Only the landing page is translated so far, with Paraglide JS. Messages live in `messages/en.json` and `messages/ja.json`; add every new key to both. `src/lib/paraglide/` is generated, so don't commit it. `pnpm check` regenerates it.

## Reporting Bugs

Open an issue with:

- A clear title
- Steps to reproduce
- Expected and actual behavior
- Your environment: web or desktop, browser, OS, Node version
- Screenshots if they help

Report security issues privately as described in [SECURITY.md](https://github.com/JuiceBoxxGames/utsuwa/blob/main/SECURITY.md), not in a public issue.

## Suggesting Features

Open an issue with the feature, the problem it solves, and any implementation ideas. For changes to what Utsuwa ships in its prompts or how the hosted deployment behaves, open an issue before writing code. These are product decisions.

## Pull Requests

1. Create a branch named `feature/description`, `fix/description`, or `docs/description`.
2. Make your changes.
3. Run `pnpm check` and `pnpm test`.
4. Use a conventional commit title: `feat:`, `fix:`, `refactor:`, `docs:`, or `chore:`. Pull requests are squash-merged, so the title becomes the commit message.
5. Push to your fork and open the pull request with what changed and how you tested it.

Significant features should update the docs in the same pull request: `README.md`, and for anything touching the companion engine or memory, `src/content/docs/technology/companion-system.md`.

## Project Structure

```
src/
├── lib/
│   ├── ai/            # Prompt building and response parsing
│   ├── components/    # Svelte components
│   ├── config/        # Site links and docs navigation
│   ├── data/          # Event definitions
│   ├── db/            # IndexedDB schema (Dexie), export and import
│   ├── engine/        # Companion engine: pure and tested
│   ├── services/      # Chat, providers, TTS, STT, MCP, storage
│   ├── stores/        # Svelte 5 rune stores
│   ├── styles/        # Shared CSS
│   ├── types/         # TypeScript types
│   └── utils/         # Helpers
├── content/
│   ├── blog/          # Blog posts
│   └── docs/          # Documentation pages
├── routes/
│   ├── api/           # Server routes (chat, models, TTS relays, MCP)
│   ├── app/           # The app and its settings pages
│   ├── blog/, docs/   # Website routes
│   ├── download/      # Download page
│   ├── overlay/       # Desktop overlay window
│   └── +page.svelte   # Landing page
└── app.css            # Global styles and design tokens
messages/              # Translations for the landing page
src-tauri/             # Tauri desktop shell (Rust)
tests/browser/         # Playwright tests
tools/omnivoice/       # OmniVoice TTS proxy
```

See the [Architecture Overview](/docs/technology/architecture) for how the pieces connect.

## License

By contributing to Utsuwa, you agree that your contributions are licensed under the AGPL-3.0-or-later, and you confirm you have the right to submit the work. You keep the copyright to your contribution.
