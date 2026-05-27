# Kraken MP3 Player — Project Notes

**Creator:** The Kraken (Kraken Unbound) — sole developer and release owner.

**GitHub Repository:** https://github.com/krakenunbound/kraken-mp3-winamp

## Overview

**v2 (this branch / 2.0.0):** Multi-window Winamp-style player with magnetic docking (Main → EQ → Playlist → Visualizer), app-wide particle overlay, and standalone visualizer window.

**v1 (legacy in same repo via `npm start` / `build:v1:win`):** Single stacked window. **Classic Kraken MP3** ships from [kraken-mp3](https://github.com/krakenunbound/kraken-mp3) — see [docs/V1_VS_V2.md](docs/V1_VS_V2.md).

## Tech Stack

- **Framework**: Electron v28.0.0
- **Build Tool**: electron-builder v24.9.1
- **Audio Metadata**: music-metadata v7.14.0
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
│   └── uninstaller.nsh  # NSIS uninstall cleanup (included in package.json nsis)
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
- **Installer file associations:** MP3, FLAC, WAV, OGG, M4A, AAC only (`package.json`)
- Play / pause / previous / next, seek bar, volume, mute
- Shuffle and repeat (off / all / one)
- 10-band graphic equalizer with presets
- First-run bundled track copied to Documents/Kraken MP3/Music

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

### Audio Visualizers (3 types)

1. **Bars** — frequency-based  
2. **Waveform** — wave pattern  
3. **Circle** — radial visualizer  

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
npm start            # Run in development
npm run build        # Build all Windows targets
npm run build:win    # NSIS installer + portable
```

## Build Outputs (dist/)

- `Kraken MP3 Setup 1.0.1.exe` — NSIS installer  
- `Kraken MP3 1.0.1.exe` — portable  
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

### Related folders (not this repo)

| Path | Role |
|------|------|
| `F:\Kraken_MP3` | Alternate Electron UI (non-Winamp layout) |
| `F:\Kraken Rust` | Rust **Kraken Player** (separate project) |
| `C:\Program Files\Kraken MP3` | Installed app from releases |

## File Associations

Registered for: `.mp3`, `.flac`, `.wav`, `.ogg`, `.m4a`, `.aac`

## Version History

- **v2.0** (planned) — Dockable Winamp-style panels; album art in visualizer; app-wide particles — [docs/V2_ROADMAP.md](docs/V2_ROADMAP.md)
- **v1.0.1** — Fix metadata race condition where the previously-loaded track's tags/cover/duration could clobber the current track's display (most visible on `.wav` files). Remove auto-loaded sample track from the player; the sample file remains in `assets/sample/` as a repo-only test asset.
- **v1.0.0** — Winamp UI, floating album art, public release
