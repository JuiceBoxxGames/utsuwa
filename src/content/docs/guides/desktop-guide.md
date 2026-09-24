---
title: Desktop Guide
description: Install the Utsuwa desktop app on macOS, Windows, or Linux, keep it updated, and use the transparent overlay and global hotkeys.
---

# Desktop Guide

The desktop app is the full Utsuwa app plus an **overlay**: a transparent, always-on-top window where your companion floats over your other apps. It runs on macOS, Windows, and Linux, and it is in beta.

## Install

Download the build for your platform from [GitHub Releases](https://github.com/JuiceBoxxGames/utsuwa/releases).

| Platform | File | Install |
|---|---|---|
| macOS | `.dmg` (universal: Apple Silicon and Intel) | Open the disk image and drag Utsuwa to Applications. Needs macOS 10.15 or later. |
| Windows | `.exe` | Run the installer. |
| Linux | `.AppImage` | Make it executable with `chmod +x`, then run it. |
| Linux | `.deb` or `.rpm` | Install with your package manager. |

### First launch of an unsigned build

The builds are not code-signed yet, so your system warns you the first time. This is expected.

- **macOS**: right-click Utsuwa in Applications, choose **Open**, then **Open** again. If macOS only offers to move it to the Trash, open System Settings > Privacy & Security and click **Open Anyway** next to the Utsuwa message. You can also clear the quarantine flag once in Terminal:

  ```bash
  xattr -dr com.apple.quarantine /Applications/Utsuwa.app
  ```

- **Windows**: on the SmartScreen prompt, click **More info**, then **Run anyway**.
- **Linux**: an AppImage only needs the executable bit: `chmod +x Utsuwa.AppImage`.

### Build from source

You need Node.js 22 or newer, pnpm, and the [Rust toolchain](https://rustup.rs/). On Linux, also install the system libraries Tauri needs, listed in the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/JuiceBoxxGames/utsuwa.git
cd utsuwa
pnpm install
pnpm tauri dev
```

`pnpm tauri dev` opens the app with a development server. `pnpm tauri build` builds installers for your platform into `src-tauri/target/release/bundle/`.

## Updating

The app checks for a new release each time it starts. When one is available, a banner reads **Update available** with **Later** and **Install & Restart**. Install downloads the update, installs it, and restarts the app. If the install fails, the banner offers **Retry**.

The launch check stays quiet when you are offline. To check by hand, click the info button (top right) and use **Check for updates** next to the version number. When an update is waiting, the same button reads **Install & restart**.

Updates are signed, and the app verifies them before installing. In-app updates work for the macOS `.dmg`, the Windows `.exe`, and the Linux `.AppImage`. If you installed a `.deb` or `.rpm`, install the newer package from Releases with your package manager.

## Main window and overlay

The **main window** is the full app, the same as the web version: chat, settings, photo mode, memory, and everything else.

The blue **Launch overlay** button (monitor icon, top right) switches to the overlay. The main window hides and your companion appears in a transparent window that stays above other apps and stays out of the taskbar.

Both windows share your data: memories, relationship state, reminders, settings, and animations. The chat history on screen belongs to each window.

## Overlay controls

Move the pointer over the overlay to show its controls. They also appear when you tab to them with the keyboard.

| Control | Where | What it does |
|---|---|---|
| Drag | Anywhere on the scene | Moves the window. |
| Resize | The corner tab, top left | Drag to resize. The bottom-right corner stays in place. Sizes range from 280 to 900 pixels wide and 380 to 1400 pixels tall. |
| Back to app | Top right (chevron) | Shows the main window and hides the overlay. |
| Camera | Top right (video icon) | The overlay's own camera: Zoom, Height, Horizontal pan, and Field of view, plus **Movement intensity**. |
| Lock position | Top right (lock icon) | Pins the window so dragging does not move it. Click again to unlock. |
| Companion stats | Bottom (her name) | Her mood and stats. **Character settings** opens Settings > Character in the main window. |
| Quick voice input | Bottom (microphone) | Click to record, click again to send. |
| Open chat | Bottom (chat icon) | Expands a chat input. It collapses when you send. |

Her replies appear in a bubble docked above the bottom controls, since a bubble that followed her head would move with the window. `Esc` closes the camera panel or the chat input.

The overlay remembers its size and whether it is locked. It does not remember its position between launches.

The overlay camera is separate from the main window's camera, so you can frame her closer in the overlay. Movement intensity is shared by both windows. The overlay has no background setting, because the window is transparent.

Events and reminders work in the overlay. Showing photos, photo mode, touch reactions, and AR are main-window features.

## Global hotkeys

These shortcuts work system-wide while the app is running, even when another app has focus.

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+Space` | Push-to-talk. Hold to record, release to transcribe and send. |
| `Ctrl+Shift+U` | Show or hide the overlay. |
| `Ctrl+Shift+C` | Open the overlay's chat input. |

- `Ctrl` is the Control key on every platform, including macOS.
- The shortcuts are fixed. There is no setting to change them.
- If another app already uses one of these combinations, that shortcut does not work in Utsuwa.
- The hotkeys belong to the overlay. Push-to-talk sends your message from the overlay, and her reply appears there.
- `Ctrl+Shift+U` only shows or hides the overlay. It does not bring back the main window. Use **Back to app** for that.
- Push-to-talk needs a voice input provider. See below.

## What differs from the web version

- **No built-in speech recognition.** The desktop webview has no Web Speech API. For voice input, set up a local Whisper server, a Groq key, or an OpenAI key in Settings > STT. See [Voice Providers](/docs/guides/voice-providers#voice-input).
- **Providers are called directly.** Chat, model lists, and Fish Audio go straight from the app to the provider, with no server in between. Local servers (Ollama, LM Studio, Local TTS, OmniVoice, local STT) only need to be running. A server that restricts which web origins it accepts must allow the app's origin; the connection error names it.
- **No local TTS relay.** `ALLOW_LOCAL_PROVIDER_HOSTS` is a self-hosted web setting. The desktop app does not need it.
- **HTTP MCP only.** The desktop app connects to HTTP MCP servers directly. stdio servers only run on a self-hosted web server. See [MCP Servers](/docs/guides/mcp).
- **Files go to Downloads.** Photo mode captures and save exports are written straight to your Downloads folder.
- **Links open in your browser.** Documentation links open in your default browser.
- **Separate data.** The desktop app and the website keep separate data. Move it with a save file from Settings > Data.

## Known limitations

| Area | Status |
|---|---|
| Code signing | Builds are unsigned during the beta. |
| Click-through | The overlay window catches clicks everywhere inside it, including transparent areas. |
| Overlay position | Not remembered between launches. Size and lock state are. |
| Hotkeys | Fixed defaults. Not configurable. |
| System tray | None. |
| `.deb` and `.rpm` updates | Through your package manager, not the in-app updater. |

## Troubleshooting

- The app will not open: [Desktop app](/docs/guides/troubleshooting#desktop-app)
- A local model or voice server will not connect: [Local LLM or TTS will not connect on desktop](/docs/guides/troubleshooting#local-llm-or-tts-will-not-connect-on-desktop)
- The mic does nothing: [Mic button does nothing on desktop](/docs/guides/troubleshooting#mic-button-does-nothing-on-desktop)
- Updates do not install: [Updates not installing](/docs/guides/troubleshooting#updates-not-installing)
