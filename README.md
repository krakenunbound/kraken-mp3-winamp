# Kraken MP3 (Winamp Edition)

A Winamp-style desktop music player with ocean/Kraken theming — 10-band EQ, audio visualizers, particle effects, and floating album art behind the playlist.

## Demo

[![Watch Kraken MP3 in action on YouTube](https://img.youtube.com/vi/t21i5fS1UZY/hqdefault.jpg)](https://youtube.com/shorts/t21i5fS1UZY)

**[▶ Watch on YouTube Shorts](https://youtube.com/shorts/t21i5fS1UZY)** — floating album art, visualizers, and the Winamp-style UI in motion.

## Screenshots

![Kraken MP3 Winamp UI](screenshots/winamp-player.png)

![Effects, visualizers, and floating album art](screenshots/effects-menu.png)

## Download

**[Kraken MP3 Setup 1.0.0](https://github.com/krakenunbound/kraken-mp3-winamp/releases/latest)** — Windows installer (NSIS)

Also available: portable `Kraken MP3 1.0.0.exe` on the [Releases](https://github.com/krakenunbound/kraken-mp3-winamp/releases) page.

## Bonus track

The installer includes **“Ad Astra” by The Kraken** (~7 MB). On first launch it is copied to:

`Documents\Kraken MP3\Music\Ad Astra.mp3`

and loaded automatically so you can hear the player immediately.

## Features

- **Winamp-style UI** — Main, EQ, and Playlist panels (EQ / PL toggles)
- **Formats** — MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS
- **10-band graphic EQ** — Presets including Flat, Rock, Pop, Jazz, and more
- **Visualizers** — Bars, wave, circle + mini LCD visualizer
- **Particle effects** — Bubbles, rain, stars, embers, dust, snow, fireflies
- **Floating album art** — Semi-transparent cover in the playlist (Float / Bounce modes)
- **Color themes** — Kraken, grayscale, purple, crimson, and more
- **File associations** — Optional during install

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `S` | Shuffle |
| `R` | Repeat |
| `M` | Mute |
| `~` | Effects menu (via palette button) |
| `F12` | DevTools |

## Development

```bash
git clone https://github.com/krakenunbound/kraken-mp3-winamp.git
cd kraken-mp3-winamp
npm install
npm start
npm run build:win
```

## Tech

- Electron 28
- music-metadata
- HTML5 Audio + Web Audio API

## License

MIT — see [LICENSE](LICENSE). Bonus track “Ad Astra” © The Kraken — included with permission for distribution with this player.

Built by [Kraken Unbound](https://github.com/krakenunbound).
