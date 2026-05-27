# Kraken MP3 — User Guide (legacy single-window)

> **Kraken MP3 Winamp v2** (multi-window docking) uses a separate guide: **[docs/V2_USER_GUIDE.md](docs/V2_USER_GUIDE.md)**. See **[docs/V1_VS_V2.md](docs/V1_VS_V2.md)** for which product to install.

Winamp-style desktop music player for Windows. This guide covers the **legacy single-window** build (`npm start` / `build:v1:win` in this repo).

## Install

1. Open the **`Install File`** folder in this project, or download from [GitHub Releases](https://github.com/krakenunbound/kraken-mp3-winamp/releases/latest).
2. Run **`Kraken MP3 Setup 1.0.1.exe`** (recommended).
3. During setup you can enable **file associations** for common audio types (see table below).
4. Launch **Kraken MP3** from the Start menu or desktop shortcut.

**Portable:** run **`Kraken MP3 1.0.1.exe`** — no installer; keep the file anywhere you like.

### First launch

The player opens to an empty playlist. Drag in some audio files, or use **File → Open** (`Ctrl+O`) or the playlist **Add** / **Add folder** controls to get started.

---

## Supported audio formats

Kraken MP3 uses the system’s HTML5 audio stack (Chromium). These extensions can be opened, dragged in, or added from a folder:

| Format | Extension | Open in app | Windows “Open with” (installer option) |
|--------|-----------|-------------|----------------------------------------|
| MP3 | `.mp3` | Yes | Yes |
| FLAC | `.flac` | Yes | Yes |
| WAV | `.wav` | Yes | Yes |
| OGG Vorbis | `.ogg` | Yes | Yes |
| MPEG-4 audio | `.m4a` | Yes | Yes |
| AAC | `.aac` | Yes | Yes |
| WMA | `.wma` | Yes | No* |
| Opus | `.opus` | Yes | No* |

\* **WMA** and **Opus** play inside the app when you add files or use **File → Open**, but the installer does not register them as default handlers. Use **Open with → Kraken MP3** manually if needed.

**Tips**

- Very large FLAC/WAV files may take a moment to buffer before play.
- Cover art and tags are read from the file when possible (`music-metadata`).
- If a rare file fails to play, convert it to MP3 or FLAC and try again.

---

## Main window

- **Title bar** — drag to move; minimize / close.
- **LCD area** — track title, time, mini visualizer, comment ticker (from MP3 comment tag).
- **Transport** — previous, play/pause, stop, next.
- **Seek bar** — click or drag to jump in the track.
- **Volume / balance** — vertical sliders (Winamp-style).
- **Shuffle / repeat** — toggle modes; repeat cycles: off → all → one track.
- **EQ / PL** — show or hide equalizer and playlist windows.

---

## Playlist (KRAKEN PLAYLIST)

- **Add files** — toolbar or **Ctrl+O** (multiple files).
- **Add folder** — scans subfolders for supported audio.
- **Double-click** a row to play.
- **Remove** — select track(s) and use remove control.
- **Floating album art** — open the effects menu (**~** or palette button): **Off**, **Float** (slow spin), or **DVD Bounce** (cover moves inside the playlist panel). Uses embedded album art when available.

---

## Equalizer (KRAKEN EQUALIZER)

- **10-band graphic EQ** — drag sliders; double-click a band to reset.
- **Presets** — Flat, Rock, Pop, Jazz, Classical, Dance, Full Bass, Full Treble, Laptop, Live, Soft, Techno, and more.
- **On/Off** — bypass EQ without losing slider positions.

---

## Effects and visuals

Open the **effects / palette** menu (**~** key or the palette button on the main bar).

| Section | What it does |
|---------|----------------|
| **Particle effect** | Bubbles, Rain, Shooting Stars, Embers, Dust, Snow, Fireflies, or Off |
| **Effect sliders** | Quantity, size, speed per effect (saved automatically) |
| **Visualizer** | Bars, Waveform, or Circle (main canvas) |
| **Floating art** | Off / Float / Bounce (playlist panel) |
| **Theme** | Kraken, grayscale, purple, crimson, and other color presets |
| **Wallpaper** | Built-in rotating backgrounds; add images under `Documents\Kraken MP3\Wallpapers` |
| **Always on top** | Keeps player above other windows |

Settings are stored in the app’s local storage and persist between sessions.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek backward / forward 5 seconds |
| `Ctrl+←` / `Ctrl+→` | Previous / Next track |
| `↑` / `↓` | Volume up / down |
| `M` | Mute |
| `S` | Shuffle toggle |
| `R` | Repeat mode (off → all → one) |
| `Ctrl+O` | Open audio files |
| `~` | Effects / palette menu |
| `F12` | Developer tools (support only) |

---

## Files and folders

| Location | Purpose |
|----------|---------|
| `Documents\Kraken MP3\Music\` | Suggested music library (you can keep your audio files here) |
| `Documents\Kraken MP3\Wallpapers\` | Custom background images (jpg, png, etc.) |
| Install folder (default) | `C:\Program Files\Kraken MP3\` when using the setup installer |

Opening a supported file from Explorer (when associations were enabled at install) launches Kraken MP3 and queues that file.

---

## Uninstall

Use **Settings → Apps → Installed apps** (or **Add/Remove Programs**), choose **Kraken MP3**, and uninstall. The installer removes shortcuts and registered file associations for the types listed in the table above.

---

## Troubleshooting

| Issue | Try |
|-------|-----|
| No sound | Check volume slider and mute (`M`); confirm Windows output device |
| Visualizer flat | Start playback; visualizer needs active audio |
| No album art floating | Track may have no embedded cover; art still shows in LCD if present |
| Wallpaper not listed | Add images to `Documents\Kraken MP3\Wallpapers` and restart or refresh backgrounds |
| File won’t play | Confirm extension is in the supported list; test with MP3 or FLAC |

---

## Updates and source

- **Releases:** https://github.com/krakenunbound/kraken-mp3-winamp/releases  
- **Source / build:** see [README.md](README.md) for developers  
- **Credits:** Kraken MP3 by [The Kraken](https://github.com/krakenunbound) (Kraken Unbound)
- **License:** MIT — see [LICENSE](LICENSE).
