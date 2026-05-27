# Changelog — Kraken MP3 Winamp v2

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
