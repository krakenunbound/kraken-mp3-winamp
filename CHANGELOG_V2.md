# Changelog — Kraken MP3 (v2)

## 2.0.1 — 2026-07-13

### Brand
- Product renamed from **Kraken MP3 Winamp v2** → **Kraken MP3**
  (installer filenames: `Kraken MP3 Setup 2.0.1.exe`, `Kraken MP3 2.0.1.exe`;
  app ID changes to `com.krakenunbound.mp3player.v2`).

### Windows stack behavior
- Click any panel → whole stack raises together with consistent z-order.
- The main player is now the sole Windows taskbar entry; EQ, Playlist,
  and Visualizer remain independent dockable windows without producing
  four taskbar thumbnails.
- Minimize from any panel minimizes the whole player. Restore brings back
  exactly the panels that were visible before minimizing.
- `Always on top` (main) raises the whole stack to screen-saver level;
  particle overlay sits one level above so effects paint over the stack
  but below other apps.
- Suppress stack-raise during active dock drag (no flicker).

### Effects overlay
- Overlay bounds now follow the active player layout without the former
  compact-stack height restriction.
- Cache the latest effects state in the main process so it survives
  startup races (state push before the overlay window finishes loading).
- Hiding the overlay now clears the particle arrays and canvas so stale
  particles never reappear when it re-shows.
- `set-viz` button optimistically reflects the active mode.
- Fixed overlay z-order, drag trails, slider reset behavior, and particle
  burst cleanup.
- Effects panel can use the full display height and includes a Custom
  palette slot that synchronizes after Apply.

### Visualizers
- Bars, Mirror, Spectrum, and LED modes now fill the available canvas width.
- LED column count scales with the visualizer window width.

### Installer
- Custom NSIS audio handling page registers MP3, FLAC, WAV, OGG, M4A,
  AAC, WMA, and Opus, with Windows Registered Applications metadata.
- `KrakenMP3V2.<ext>` ProgIDs (HKCU/HKLM-aware via `SHELL_CONTEXT`).
- Uninstaller cleans both new and legacy ProgIDs plus the old
  `Kraken MP3 Winamp v2` appdata folders.

### Fixes
- `renderer.js set-viz`: `saveSettings` and `broadcastEffectsState` were
  unreachable because of a `break` in the wrong place. Moved.
- Updated `music-metadata` and its parser dependencies to address malformed
  audio-file parsing advisories; metadata parsing now runs in the main process.

## 2.0.0 — 2026-05-20

### Multi-window docking

- Four-panel stack: **Main → EQ → Playlist → Visualizer** (default dock order)
- Magnetic edge docking, per-panel lock/unlock, **regroup** from main lock button
- Stack drag moves all docked panels; always-on-top applies to full stack
- Layout persistence (`layoutStore`) with safe snapshot when windows close
- Particle effects as app-wide overlay across docked windows

### Panels

- Standalone **EQ**, **Playlist**, and **Visualizer** windows
- **Effects** popup window (themes, particles, viz mode, wallpapers)
- Main window uses `index-v2.html` (transport + LCD mini-viz only)

### Visualizers

- Modes: Bars, Mirror, LED, Spectrum, Wave, Circle, **Waterfall**
- Visualizer audio via IPC from main Web Audio analyser
- Waterfall: offscreen buffer + full-width log-frequency mapping
- Floating album art in visualizer window (float / bounce)

### Themes & UX

- Theme sync across all panels; EQ panel theming fix
- Custom color picker: preview + **Apply** per row (no auto-close grid rebuild)
- Removed confusing “square panel corners” option

### Stability

- Coalesced IPC / `runWhenMainReady` (fixes `MaxListenersExceededWarning` at startup)
- Taskbar close no longer crashes on destroyed windows in layout snapshot
- Stack z-order lift once per drag (fixes flicker / slow drag)

### Build / isolation from v1

- Separate **app ID** and product name: `Kraken MP3 Winamp v2`
- `build-flavor.json` + `electron-builder.v2.yml` for v2 installers
- `npm run build:v2:win` vs `npm run build:v1:win` (legacy single-window)
- Docs: [docs/V2_USER_GUIDE.md](docs/V2_USER_GUIDE.md), [docs/V1_VS_V2.md](docs/V1_VS_V2.md)
