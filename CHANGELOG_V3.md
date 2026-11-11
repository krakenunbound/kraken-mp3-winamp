# Kraken MP3 — v3 changelog

## 3.0.1 — 2026-11-10

- Follows Windows' default playback device: change speakers/headphones in
  Windows and the music moves over at the same spot (playing stays playing,
  paused stays paused).
- Unplugging the device in use no longer skips to the next song; playback
  continues on the new default device.

## 3.0.0 — 2026-11-10 — native rewrite

Kraken MP3 is now a native Windows app (C# / .NET 10, WPF, NAudio, SkiaSharp)
instead of Electron. One process, ~180–200 MB, no browser engine.

### Why
- The visualizer no longer freezes when another window covers the player or
  the player is minimised (it keeps full frame rate; ideal for OBS).

### Player
- Plays MP3, FLAC, WAV, OGG, M4A, AAC, WMA and Opus; 10-band EQ with v2's
  presets plus a remembered Custom curve; volume, mute, balance.
- LCD with mini spectrum, clock (click for remaining time), scrolling title,
  bitrate / sample rate / stereo.
- Smart shuffle (every track once per cycle, Previous/Next walk real history,
  no back-to-back repeat) and repeat off / all / one.
- Remembers playlist, track, position, volume, EQ, theme, effects and window
  layout. One copy runs at a time; files opened from Explorer are added and
  played.
- Keyboard: Space, Ctrl+←/→, ←/→ (±5 s), ↑/↓ volume, M, S, R, V (visualizer),
  E (EQ), P (playlist), ~ (effects), Ctrl+O, Ctrl+Shift+O, media keys.

### Windows
- **Magnetic docking:** panels snap to each other and to screen edges; drag
  the player to move the whole stack, drag a panel to pull it off, drop it
  near an edge to snap it back. Shift+drag moves the player alone.
- **Playlist:** drag to reorder, drop files/folders/M3U anywhere in the list,
  sort, reverse, randomise, remove duplicates or missing files, crop, save and
  load M3U8, show in Explorer.
- **Visualizer:** Bars, Mirror, LED, Spectrum, Wave, Circle, Waterfall;
  floating album art Float / Bounce (as in v2); backgrounds Normal, Green,
  Magenta, Black, and true Transparent for streaming; 30 / 60 fps or match
  display.
- **Effects & Visualizers:** 8 colour themes plus a Custom palette, particle
  effects (Bubbles, Rain, Stars, Embers, Dust, Snow, Fireflies) over the
  docked stack, and a burst on every track change.

### Install
- `Kraken MP3 Setup 3.0.0.exe` replaces Kraken MP3 2.x in place (same folder
  and Apps entry; file types you set to Kraken MP3 stay set; 2.x settings
  folder is not deleted). `Kraken MP3 3.0.0.exe` is the portable build.
- v3 settings start fresh (v2's were stored inside Chromium and are not read).

### Not in 3.0.0
- Wallpapers (v2's docked build did not show them either), v2's per-panel
  lock buttons, global media keys when another app has focus.
