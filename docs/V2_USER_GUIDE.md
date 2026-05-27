# Kraken MP3 (v2) — User Guide

**Version:** 2.0.0  
**Product:** Multi-window docked player (Main, EQ, Playlist, Visualizer)

## Install

1. Download **`Kraken MP3 Setup 2.0.0.exe`** from [GitHub Releases](https://github.com/krakenunbound/kraken-mp3-winamp/releases/latest).
2. Run the installer. After you choose the install folder, you will see **“Default music player (optional)”** — check **Yes** if you want Kraken to become the default app for **MP3, FLAC, WAV, OGG, M4A, AAC, WMA, and Opus**. Leave it unchecked to install without changing Windows defaults (you can change it later in Windows Settings → Apps → Default apps).
3. Launch **Kraken MP3** from the Start menu or desktop shortcut.

**Portable:** use **`Kraken MP3 2.0.0.exe`** from the same release page (no installer).

**Local copy after building:** `Install File/` in the project folder (see [Install File/README.md](../Install%20File/README.md)).

> **Note:** This is **not** the classic single-window [Kraken MP3 v1](https://github.com/krakenunbound/kraken-mp3). v1 and v2 use different app IDs and can coexist. See [V1_VS_V2.md](V1_VS_V2.md).

## First launch

Four panels open in a vertical stack (top to bottom):

1. **Kraken MP3** — transport, LCD, mini spectrum, volume, effects menu  
2. **Kraken EQ** — 10-band graphic equalizer  
3. **KRAKEN PLAYLIST** — tracks, add/remove, floating album art options  
4. **KRAKEN VISUALIZER** — full-size audio visualizer  

Drag audio files into the playlist or use **File → Open** (`Ctrl+O`).

## Docking and layout

- **Lock icon** on each panel title bar — click to **detach** that panel; drag near another panel edge to **snap** back.
- **Main window lock** — regroups all panels into the default stack (Main → EQ → Playlist → Visualizer) and shows hidden panels.
- **Drag the stack** by moving the main window; docked panels follow.
- **Always on top** (main window) applies to the whole player stack in v2; the particle overlay sits one layer above so effects stay on top of the panels.
- **Click any panel** to bring the whole player stack forward together; switching to another app sends them away as one group. All four panels share a single Windows taskbar icon.
- Layout is saved automatically between sessions.

## Effects menu (`~` key)

Open from the main window. Controls include:

- **Particle effects** — bubbles, rain, shooting stars, embers, dust, snow, fireflies (app-wide overlay)
- **Themes** — Kraken, purple, crimson, grayscale, and custom accent colors (per-row **Apply**)
- **Visualizer mode** — Bars, Mirror, LED, Spectrum, Wave, Circle, **Waterfall**, or Off
- **Floating album art** — Off, Float (centered spin), or Bounce (in visualizer window)
- **Wallpapers** — rotating backgrounds (`Documents/Kraken MP3/Wallpapers`)

## Visualizer window

- Choose mode in the effects menu; the visualizer panel updates in real time.
- **Waterfall** — scrolling spectrogram across the full panel width.
- **Floating album art** appears in the visualizer layer when enabled and a track has cover art.

## Playlist

- **Add / Add folder** — toolbar buttons  
- **Double-click** track to play  
- **Clear** — empty list  
- Shuffle / repeat are on the main transport bar  

## Equalizer

- 10-band sliders + presets (Flat, Rock, Pop, Jazz, etc.)  
- Changes apply to playback immediately  

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek ±5 s |
| `Ctrl+←` / `Ctrl+→` | Previous / Next |
| `↑` / `↓` | Volume |
| `M` | Mute |
| `S` | Shuffle |
| `R` | Repeat (off → all → one) |
| `Ctrl+O` | Open files |
| `~` | Effects menu |
| `F12` | DevTools (any focused panel) |

## Supported formats

MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS — same as v1. If you opted in during install, those types open in Kraken by default (including WMA and Opus). Otherwise use **File → Open** or drag-in.

## Folders

| Purpose | Location |
|---------|----------|
| Custom wallpapers | `%USERPROFILE%\Documents\Kraken MP3\Wallpapers` |
| v2 layout / settings | Electron user-data for **Kraken MP3** (app ID `com.krakenunbound.mp3player.v2`) |

## Troubleshooting

| Issue | Try |
|-------|-----|
| “Already running” | Close all Kraken MP3 windows or end stray processes in Task Manager |
| Panel missing | Click **lock** on main to regroup; check if playlist/viz was closed (reopens on regroup) |
| No visualizer motion | Start playback; set visualizer mode ≠ Off in effects menu |
| No particles visible | Particle overlay only shows when all four panels are magnetically docked into one compact stack. Detached panels = no overlay; click main lock to regroup. |
| EQ / theme out of sync | Close and reopen panels, or restart the app |
| Want classic single window | Install [Kraken MP3 v1](https://github.com/krakenunbound/kraken-mp3/releases) instead |

## Build from source (developers)

```bash
git clone https://github.com/krakenunbound/kraken-mp3-winamp.git
cd kraken-mp3-winamp
git checkout feature/v2-docking   # or main when v2 is merged
npm install
npm run start:v2
npm run build:v2:win
```

See [V1_VS_V2.md](V1_VS_V2.md) and [V2_ROADMAP.md](V2_ROADMAP.md) for architecture notes.
