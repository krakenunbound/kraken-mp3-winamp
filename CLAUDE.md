# Finished Project# Kraken MP3 Player - Project Context

**GitHub Repository:** https://github.com/krakenunbound/kraken-mp3

## Overview
A Winamp-style desktop MP3 player built with Electron, featuring an ocean/Kraken theme with bioluminescent visual effects.

## Tech Stack
- **Framework**: Electron v28.0.0
- **Build Tool**: electron-builder v24.9.1
- **Audio Metadata**: music-metadata v7.14.0
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Platform**: Windows (NSIS installer + portable)

## Project Structure
```
F:\Kraken_MP3\
├── src/
│   ├── main.js          # Electron main process (~200 lines)
│   ├── renderer.js      # UI logic, audio, effects (~1,700 lines)
│   ├── index.html       # UI template
│   └── styles.css       # Ocean-themed styling
├── assets/
│   └── icons/
│       ├── icon.ico     # Windows app icon
│       ├── icon.png     # High-res icon source
│       └── icon.svg     # Animated SVG kraken (default album art)
├── build/
│   └── uninstaller.nsh  # NSIS uninstall cleanup script
├── screenshots/         # README images for GitHub
├── scripts/
│   └── apply-icon.js    # Icon utility (may be unused)
├── package.json         # Config + electron-builder settings
├── package-lock.json
├── README.md
└── .gitignore
```

### Excluded from Git (see .gitignore)
- `node_modules/` - Install via `npm install`
- `dist/` - Build output (upload .exe to GitHub Releases)
- `mp3/` - Sample audio files for testing
- `.claude/` - Local Claude settings

## Key Features

### Audio Playback
- Supports: MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS
- Play/Pause/Previous/Next controls
- Seek with draggable progress bar
- Volume control with mute
- Shuffle and repeat modes (off/all/one)

### Visual Effects (8 particle types)
1. **Bubbles** - Rising with wobble
2. **Rain** - Falling raindrops
3. **Shooting Stars** - Comets from edges
4. **Embers** - Slow rising glow
5. **Dust** - Gentle floating motes
6. **Snow** - Rotating snowflakes
7. **Fireflies** - Glowing on/off cycles
8. **Off** - Disabled

Each effect has independent settings (quantity/size/speed) persisted in localStorage.

### Audio Visualizers (3 types)
1. **Bars** - Frequency-based
2. **Waveform** - Wave pattern
3. **Circle** - Radial visualizer

### UI Features
- Compact Winamp-style design (500x360px, resizable)
- Scrolling comment ticker (MP3 comment metadata)
- Rotating background wallpapers with crossfade
- Always-on-top window option
- Custom wallpapers from Documents/Kraken MP3/Wallpapers

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

## Development Commands
```bash
npm install          # Install dependencies
npm start            # Run in development
npm run build        # Build all Windows targets
npm run build:win    # Build Windows dir + NSIS + portable
```

## Build Outputs (in dist/)
- `Kraken MP3 Setup 1.0.0.exe` - NSIS installer (~78MB)
- `Kraken_MP3_Portable.exe` - Portable version (~78MB)
- `win-unpacked/` - Unpacked directory build

## Architecture Notes

### Main Process (main.js)
- Window management (size constraints, always-on-top)
- File dialogs (open file/folder)
- IPC handlers for renderer communication
- Single-instance lock
- Command-line file opening support

### Renderer Process (renderer.js)
- Audio playback via HTML5 Audio element
- Web Audio API for visualizer frequency analysis
- Three canvas layers: particles, burst effects, visualizer
- State management for playlist, effects, settings
- Metadata parsing with music-metadata
- localStorage persistence for all settings

### IPC Channels
- `open-file-dialog` / `open-folder-dialog`
- `get-backgrounds-path` / `list-backgrounds`
- `minimize-window` / `close-window`
- `toggle-always-on-top`
- `file-opened` (external file association)

## File Associations
Registered for: .mp3, .flac, .wav, .ogg, .m4a, .aac

## Version History
- v1.0.0 (Dec 2024) - Initial release
