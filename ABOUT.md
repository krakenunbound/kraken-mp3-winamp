# Kraken MP3 Player — Project Notes

**Creator:** The Kraken (Kraken Unbound) — sole developer and release owner.

**GitHub Repository:** https://github.com/krakenunbound/kraken-mp3-winamp

## Overview

**v2 (current / 2.0.1):** Multi-window Winamp-style player with magnetic docking (Main → EQ → Playlist → Visualizer), app-wide particle overlay, and standalone visualizer window.

The project is intentionally focused: local audio playback with familiar Winamp-inspired controls and visual personality, without ads, telemetry, bundled software, or unnecessary background services.

**v1 (legacy in same repo via `npm start` / `build:v1:win`):** Single stacked window. **Classic Kraken MP3** ships from [kraken-mp3](https://github.com/krakenunbound/kraken-mp3) — see [docs/V1_VS_V2.md](docs/V1_VS_V2.md).

## Tech Stack

- **Framework**: Electron v28.3.3
- **Build Tool**: electron-builder v24.13.3
- **Audio Metadata**: music-metadata v11.13.0
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Platform**: Windows (NSIS installer + portable)

## Project Structure

```
F:\Kraken_MP3_Winamp\
├── src/
│   ├── main.js          # Electron main process (v1/v2 flavor)
│   ├── main/            # Dock engine, layout, effects overlay
│   ├── panels/          # EQ, playlist, visualizer, effects HTML/JS
│   ├── shared/          # Themes, canvasViz, themeClient
│   ├── renderer.js      # Main window audio + IPC
│   ├── index-v2.html    # v2 main shell
│   ├── index.html       # Legacy single-window UI
│   └── build-flavor.json # Packaged v1 vs v2 marker
├── assets/
│   ├── icons/           # App icon (.ico, .png, .svg)
│   └── sample/          # Sample audio file for local testing (not bundled / not auto-loaded)
├── build/
│   ├── installer-v2.nsh # v2 audio registration and installer UI
│   ├── file-association.nsh
│   └── uninstaller.nsh  # Legacy uninstall cleanup
├── Install File/        # Latest setup + portable (local; .exe gitignored)
├── screenshots/         # README images
├── package.json         # Version, electron-builder config
├── README.md
├── docs/
│   ├── V2_USER_GUIDE.md # v2 end-user documentation
│   └── V1_VS_V2.md      # Product isolation vs classic Kraken MP3
├── USER_GUIDE.md        # Legacy single-window guide
├── CHANGELOG_V2.md
├── LICENSE
└── ABOUT.md             # This file
```

### Excluded from Git (see .gitignore)

- `node_modules/` — install via `npm install`
- `dist/` — build output (upload installers to GitHub Releases)
- `Install File/*.exe` — copy here after build; see `Install File/README.md`
- `src_backup*/` — local source snapshots (do not keep in tree)

## Key Features

### Audio Playback

- **Playback:** MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS (see [USER_GUIDE.md](USER_GUIDE.md))
- **Installer file registration:** MP3, FLAC, WAV, OGG, M4A, AAC, WMA, Opus
- Play / pause / previous / next, seek bar, volume, mute
- Shuffle and repeat (off / all / one)
- 10-band graphic equalizer with presets

### Visual Effects (8 particle types)

1. **Bubbles** — rising with wobble  
2. **Rain** — falling raindrops  
3. **Shooting Stars** — comets from edges  
4. **Embers** — slow rising glow  
5. **Dust** — gentle floating motes  
6. **Snow** — rotating snowflakes  
7. **Fireflies** — glowing on/off cycles  
8. **Off** — disabled  

Per-effect quantity, size, and speed; persisted in `localStorage`.

### Floating Album Art

- **Off** — standard playlist only  
- **Float** — slow spin over the playlist area  
- **DVD Bounce** — cover bounces inside the playlist panel  
- Toggle in the effects menu; uses embedded cover art from tags  

### Audio Visualizers

Bars, Mirror, LED, Spectrum, Wave, Circle, and Waterfall modes scale with the standalone visualizer panel.

### UI

- Compact Winamp-style layout (resizable)
- KRAKEN PLAYLIST and KRAKEN EQUALIZER panels
- Scrolling comment ticker (MP3 comment metadata)
- Rotating wallpapers with crossfade; custom images in Documents/Kraken MP3/Wallpapers
- Always-on-top option

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| Left/Right | Seek ±5s |
| Ctrl+Left/Right | Previous/Next track |
| Up/Down | Volume |
| M | Mute |
| S | Shuffle |
| R | Repeat cycle |
| Ctrl+O | Open files |
| ~ | Toggle effects menu |
| F12 | DevTools |

## Development

```bash
npm install          # Install dependencies
npm run start:v2     # Run the current multi-window player
npm start            # Run the legacy single-window flavor
npm run build        # Build v2 NSIS installer + portable executable
```

## Build Outputs (dist/)

- `Kraken MP3 Setup 2.0.1.exe` — NSIS installer
- `Kraken MP3 2.0.1.exe` — portable
- `win-unpacked/` — unpacked directory build  

## Architecture

### Main process (`main.js`)

- Window sizing, always-on-top, single-instance lock  
- File/folder dialogs, file association open on launch  
- IPC for renderer (dialogs, wallpapers, window chrome)  

### Renderer (`renderer.js`)

- HTML5 Audio + Web Audio API for visualizer analysis  
- Canvas layers: particles, bursts, visualizer  
- Playlist, EQ, effects, floating art; settings in `localStorage`  
- Metadata and cover art via `music-metadata`  

## File Associations

Registered for: `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.wma`, `.opus`

## Version History

- **v2.0.1** — Single taskbar entry, group minimize/restore, visualizer scaling, overlay fixes, custom palette, and improved Windows audio registration.
- **v2.0.0** — Dockable Winamp-style panels; album art in visualizer; app-wide particles — [docs/V2_ROADMAP.md](docs/V2_ROADMAP.md)
- **v1.0.1** — Fix metadata race condition where the previously-loaded track's tags/cover/duration could clobber the current track's display (most visible on `.wav` files). Remove auto-loaded sample track from the player; the sample file remains in `assets/sample/` as a repo-only test asset.
- **v1.0.0** — Winamp UI, floating album art, public release
