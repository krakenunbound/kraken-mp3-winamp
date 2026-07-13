# Kraken MP3 — v1 vs v2 (Winamp Edition)

Two related products live in **two separate folders and GitHub repos**. They can be installed side by side without overwriting each other.

| | **v1 — Classic Kraken MP3** | **v2 — Kraken MP3 Winamp** |
|---|---------------------------|----------------------------|
| **Folder** | `F:\Kraken_MP3` | `F:\Kraken_MP3_Winamp` |
| **GitHub** | [kraken-mp3](https://github.com/krakenunbound/kraken-mp3) | [kraken-mp3-winamp](https://github.com/krakenunbound/kraken-mp3-winamp) |
| **UI** | Single tall window (main + playlist + EQ stacked) | Four docked windows: Main → EQ → Playlist → Visualizer |
| **Effects / particles** | Drawn inside the main window | App-wide overlay across the docked stack |
| **Full visualizer** | Behind the whole stack in one window | Dedicated **KRAKEN VISUALIZER** window |
| **EQ / playlist** | Toggle panels in the same window | Separate windows with magnetic dock / detach |
| **App ID (Windows)** | `com.krakenunbound.mp3player` | `com.krakenunbound.mp3player.v2` |
| **Installer name** | `Kraken MP3 Setup …` | `Kraken MP3 Setup …` (v2 release line) |
| **Current line** | Stable **1.0.x** | **2.0.1** (docking + new visualizers) |

## Which one should I use?

- **v1** — You want one compact window, the original Kraken MP3 experience, and the release on [kraken-mp3 releases](https://github.com/krakenunbound/kraken-mp3/releases).
- **v2** — You want Winamp-style detachable panels, the standalone visualizer, regroup lock, and modes like Waterfall / LED / Spectrum. Use the **v2 installer** from [kraken-mp3-winamp releases](https://github.com/krakenunbound/kraken-mp3-winamp/releases).

## Development commands (this repo — Winamp / v2)

| Command | What it runs |
|---------|----------------|
| `npm run start:v2` | v2 multi-window (dev) |
| `npm run start` | Legacy single-window (v1-style) inside this codebase |
| `npm run build:v2:win` | **Ship v2** — NSIS installer + portable → `dist/` and `Install File/` |
| `npm run build:v1:win` | Legacy single-window installer (same repo, different flavor) |

Packaged **v2** builds embed `src/build-flavor.json` with `"mode": "v2"` so the installed app always opens multi-window — no command-line flags required.

## Shared vs separate

- **Shared ideas:** Ocean/Kraken themes, 10-band EQ, playlists, particle effects, keyboard shortcuts, `music-metadata`, Web Audio visualizers.
- **Not shared:** Installers, `%APPDATA%` app name, layout files, or window layout code. v2 layout is stored under the v2 app user-data path.

## Documentation links

| Document | URL |
|----------|-----|
| **v2 user guide** | [docs/V2_USER_GUIDE.md](V2_USER_GUIDE.md) |
| **v1 user guide (classic)** | [USER_GUIDE.md](../USER_GUIDE.md) (legacy single-window in this repo) |
| **v2 changelog** | [CHANGELOG_V2.md](../CHANGELOG_V2.md) |
| **Roadmap / architecture** | [V2_ROADMAP.md](V2_ROADMAP.md) |
