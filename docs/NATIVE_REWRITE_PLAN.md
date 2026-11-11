# Kraken MP3 — Native Rewrite Plan (v3)

**Status:** proposal, not started · **Written:** 2026-11-10 · **Replaces:** Electron v2 (2.0.5)

## Why

Kraken MP3 v2 is ~9,500 lines of Electron (Chromium + Node). Being a browser
underneath has costs a music player should not pay:

- Chromium pauses drawing in covered/minimized windows (the visualizer froze
  behind other windows; 2.0.5 works around it with command-line switches).
- 6 Chromium processes (main, EQ, playlist, visualizer, effects, overlay) for
  one player: roughly 300–500 MB RAM and a ~78 MB installer.
- Audio runs through `<audio>` + Web Audio, so EQ, FFT and format support are
  whatever Chromium provides.
- No real per-pixel transparency for panels without fighting Electron.

A native Windows app removes all of that: one process, direct audio control,
windows that draw whenever we tell them to.

## Recommended stack

| Concern | Choice | Why |
|---|---|---|
| Language / runtime | **C# on .NET 10 (LTS)** | Installed already (SDK 10.0.101, VS 2022). Fast to build UI in; no browser. |
| UI framework | **WPF** | Mature, custom-chrome borderless windows, easy theming, full Win32 interop for docking. |
| Drawing (visualizer, particles, LCD) | **SkiaSharp** (`SKGLElement`, GPU) | 60 fps immediate-mode drawing; a near 1:1 port of `canvasViz.js` / `particleSystem.js` (same 2D-canvas model). MIT. |
| Audio playback | **NAudio** + Windows **Media Foundation** | MP3, AAC/M4A, WAV, WMA, FLAC decode natively on Windows 10/11. MIT. |
| Extra codecs | **NAudio.Vorbis** (OGG), **Concentus** (Opus) | Covers the two formats Media Foundation lacks. MIT/BSD. |
| EQ | 10 × `BiQuadFilter` peaking bands + preamp, per channel, in an `ISampleProvider` | Same band centres/presets as today; zero-latency, no Web Audio. |
| Spectrum data | NAudio `FastFourierTransform` on a tap after the EQ | Feeds visualizer + mini spectrum; log-frequency mapping ported from `sampleFrequency()`. |
| Tags + cover art | **TagLibSharp** | Title/artist/album/track/comment/duration + embedded pictures for all 8 formats. LGPL (dynamic DLL — fine for an MIT app). |
| Settings / layout | JSON in `%AppData%\Kraken MP3\` | Human-readable, replaces `localStorage` + `layoutStore.js`. |
| Installer | **NSIS** (port of `build/installer-v2.nsh`) + portable single-file exe | Keeps the existing Default-Apps registration logic and registry keys so v3 upgrades v2 in place. |

**Rejected alternatives**

- *C++ / Win32 + Direct2D*: smallest and fastest, but roughly 2–3× the work for
  the UI, docking and theming. Not worth it for a player.
- *BASS audio library*: excellent and handles every format, but its licence is
  free only for non-commercial freeware and it is a closed native DLL. NAudio
  keeps everything MIT/open. Can be revisited if a codec gap appears.
- *WinUI 3*: newer, but custom-chrome multi-window docking and transparent
  overlays are less mature than in WPF.
- *Tauri / Flutter / Qt*: Tauri is still a webview; Flutter and Qt add a large
  runtime and are weaker fits for Win32 docking tricks.

## Expected results vs v2

| | Electron v2 | Native v3 (target) |
|---|---|---|
| Processes | 6 | 1 |
| RAM while playing | ~300–500 MB | ~170 MB measured in the phase 0 spike (target lower after trimming) |
| Installer | ~78 MB | ~40 MB self-contained (or ~5 MB needing .NET Desktop Runtime) |
| Visualizer when covered/minimized | needs workarounds | always draws |
| Transparent visualizer | chroma-key colours only | chroma-key **and** true transparent window option |
| EQ / FFT | Web Audio | direct DSP in the audio pipeline |

## Feature inventory → native mapping

Everything below exists in v2 today and must exist in v3 before v3 replaces it.

**Playback core** (`renderer.js`)
- Play/pause/stop/prev/next, seek bar, volume, mute, balance → NAudio `WasapiOut` + `SampleChannel`.
- Formats: MP3, FLAC, WAV, OGG, M4A, AAC, WMA, Opus.
- Smart shuffle (no repeats per cycle, history-aware Prev/Next) + repeat off/all/one → port the 2.0.4 logic as a tested `PlayQueue` class.
- "Previous restarts track if > 3 s in" behaviour.
- Single instance; files passed by Explorer while running go to the open player (named pipe instead of Electron's second-instance event).
- Drag-and-drop files/folders; File → Open (Ctrl+O); Add folder (recursive scan).

**Main window** (`index-v2.html`)
- LCD: title, artist, album, track no., bitrate, sample rate, mono/stereo lamps, elapsed/total time, mini spectrum, scrolling comment ticker.
- Transport, seek, volume, shuffle/repeat, EQ/PL/viz/effects toggles, always-on-top, lock (regroup).
- Keyboard shortcuts: Space, ←/→, Ctrl+←/→, ↑/↓, M, S, R, Ctrl+O, ~.

**Playlist window** (`panels/playlist*`)
- Track list with title/artist/duration from tags, active-track highlight, auto-scroll, select / select all, double-click to play, add, add folder, remove, clear. Virtualised list (WPF `ListView` virtualisation) so 1,000+ tracks stay instant.

**EQ window** (`panels/eq*`)
- 10 bands, preamp, on/off, presets (Flat, Rock, Pop, Jazz, Classical, Dance, Full Bass, Full Treble, Laptop, Live, Soft, Techno…), double-click band to reset.

**Visualizer window** (`panels/visualizer*`, `shared/canvasViz.js`)
- Modes: Bars, Mirror, LED, Spectrum, Wave, Circle, Waterfall, Off.
- Floating album art: Off / Float / Bounce, plus the ART title-bar button.
- BG button: Normal / Green / Magenta / Black key backgrounds with bars-only drawing — plus a new **Transparent** option (real per-pixel alpha window).
- Viz themes follow the colour theme.

**Effects & themes** (`panels/effects*`, `shared/uiThemes.js`, `colorThemes.js`, `vizThemes.js`)
- 8 colour presets (Kraken, Grayscale, Purple, Red, Blue, Orange, Green, Pink) + Custom slot with per-colour overrides → WPF `ResourceDictionary` themes swapped at runtime.
- Particle overlay over the whole player stack: Bubbles, Rain, Shooting Stars, Embers, Dust, Snow, Fireflies, Off; per-effect quantity/size/speed; track-change bursts → click-through topmost overlay window (`WS_EX_TRANSPARENT | WS_EX_LAYERED`) drawn with SkiaSharp. Port of `particleSystem.js`.
- Rotating wallpapers with crossfade, custom images in `Documents\Kraken MP3\Wallpapers`.
- "Choose defaults for Kraken MP3" button (opens Windows Default Apps page).

**Docking** (`main/dockEngine.js`, `dockGraph.js`, `windowBounds.js`, `layoutStore.js`)
- Default stack Main → EQ → Playlist → Visualizer; magnetic snap when dragged near edges; per-panel lock/detach buttons; main lock regroups; dragging main moves docked panels; click any panel raises the whole stack; one taskbar entry; minimize/restore as a group; layout saved → Win32 `WM_MOVING`/`WM_SIZING` hooks via `HwndSource`, owner-window relationships for single taskbar entry and grouped z-order.

**Windows integration** (`build/*.nsh`, `main.js`)
- Register for the 8 extensions + Capabilities/RegisteredApplications, Default Apps handoff on the Finish page, file icons, uninstall cleanup — same registry layout as v2 so the switch is seamless.

**Dropped**
- Legacy v1 single-window flavor (`index.html`, `npm start`) — v1 ships separately as classic Kraken MP3.
- F12 DevTools (replaced by a log file + optional debug overlay).

## Repository layout

Build v3 in a new `native/` folder in this repo so v2 stays buildable and
shippable until v3 reaches parity:

```
native/
  KrakenMp3.sln
  src/KrakenMp3.App/        WPF app: windows, XAML, themes, docking
  src/KrakenMp3.Audio/      NAudio pipeline, EQ, FFT, decoders, PlayQueue
  src/KrakenMp3.Visuals/    SkiaSharp visualizers + particle system
  tests/KrakenMp3.Tests/    PlayQueue/shuffle, EQ maths, tag reading, settings
  installer/                NSIS script (port of build/installer-v2.nsh)
```

## Phases

Each phase ends with something runnable. Session counts are rough working
sessions of the size we did today.

| # | Phase | Delivers | Est. sessions |
|---|---|---|---|
| 0 | **Spike** (decision gate) | One WPF window playing all 8 formats through NAudio with the 10-band EQ, plus a SkiaSharp Bars visualizer that keeps animating while covered and minimized. Measure RAM/CPU. **Go/no-go before anything else.** | 1 |
| 1 | Playback core + main window | Transport, seek, volume/mute, LCD (tags, bitrate, time, ticker, mini spectrum), smart shuffle/repeat with unit tests, keyboard shortcuts, settings JSON, single instance + Explorer file open. Usable as a basic player. | 1–2 |
| 2 | Playlist + EQ windows | Full playlist (drag-drop, folders, virtualised list) and EQ window with presets. Feature-complete *playback*. | 1 |
| 3 | Visualizer window | All 7 modes ported from `canvasViz.js`, floating art Float/Bounce, ART/BG buttons, key backgrounds + true transparent mode. Ready for streaming. | 1 |
| 4 | Docking engine | Magnetic snap, locks, regroup, grouped z-order/minimize, single taskbar entry, always-on-top, saved layout. | 1–2 |
| 5 | Themes, effects, wallpapers | 8 presets + custom colours, effects window, particle overlay (8 effects + bursts), wallpapers. Visual parity. | 1–2 |
| 6 | Installer + release | NSIS installer and portable exe, file associations, Default Apps handoff, upgrade over Electron v2, docs, v3.0.0. | 1 |

**Total: roughly 7–10 sessions.** Phases 1–3 alone (about 3–4 sessions) give a
native player good enough for streaming; docking and effects can follow.

## Risks and how we handle them

- **Particle overlay performance.** WPF `AllowsTransparency` windows render in
  software. Mitigation: draw particles with SkiaSharp into a bitmap pushed via
  `UpdateLayeredWindow`, sized to the player stack only; verified in phase 5
  (fallback: draw particles inside each panel instead of an overlay).
- **Codec gaps.** Media Foundation FLAC/AAC need Windows 10+ (fine). OGG/Opus
  via managed decoders; any file that fails is reported in the playlist, not
  silently skipped. BASS remains a fallback option.
- **Docking feel.** Win32 snapping is more precise than Electron's, but grouped
  minimize/restore and z-order need care; covered by phase 4 alone.
- **Settings migration.** v2 settings live in Chromium `localStorage`
  (LevelDB) and are not worth parsing. v3 starts with defaults; layout and
  theme take seconds to set again.

## Phase 0 results (2026-11-10) — **GO**

Spike lives in `native/` (`KrakenMp3.sln`: `KrakenMp3.Audio`, `KrakenMp3.Visuals`,
`KrakenMp3.App`). Pinned for the spike: NAudio 2.2.1, NAudio.Vorbis 1.5.0,
Concentus 2.2.2 + Concentus.Oggfile 1.0.7, SkiaSharp(.Views.WPF) 2.88.9.
Newer majors exist (NAudio 3.x, SkiaSharp 3.x/4.x) — evaluate in phase 1.

**Formats** — `Kraken MP3.exe --probe <out.txt> <files…>` decodes 3 s through
the EQ (rock preset) and analyzer, then seeks to 10 s:

| Format | Decoder | Result |
|---|---|---|
| MP3, FLAC, WAV, M4A, AAC, WMA | Media Foundation | OK (seek exact) |
| OGG | NAudio.Vorbis | OK |
| Opus | Concentus (48 kHz) | OK |

Note: raw ADTS `.aac` reports 21.7 s for a 20 s clip (MF estimate for that
container); fix duration from the decoded length in phase 1.

**Visualizer while covered/minimized** — `Kraken MP3.exe --selftest <song> --out <log>`
plays silently, then measures the separate visualizer window (Release build,
SkiaSharp, driven by `CompositionTarget.Rendering`):

| Phase | Frame rate | Frames with signal |
|---|---|---|
| Visible | 158.7 fps | 635 / 635 |
| Covered by another window | 156.3 fps | 623 / 623 |
| Main window minimized | 159.0 fps | 635 / 635 |

The visualizer runs at the monitor refresh rate no matter what covers it —
the exact case that froze Electron v2.

**Resources** (one process): working set ~170 MB, private ~125 MB, CPU ≈ 0.7 %
of 28 logical cores (~20 % of one core) while drawing at ~160 fps.
RAM is higher than the 80–150 MB estimate; most is the WPF + Media Foundation
baseline. Phase 1 should cap the visualizer at 60 fps (option for "match
display") to cut CPU, and re-measure after trimming.

**Also proven:** 10-band EQ applied live; Web-Audio-compatible spectrum
(Blackman, 512-pt FFT, 0.8 smoothing, −100…−30 dB) so v2 visualizer maths
port 1:1; Bars + LED ported; bare chroma-key drawing; real transparent
visualizer window (`AllowsTransparency`, recreated on toggle).

**Spike shortcuts to replace in later phases:** spectrum timing uses a fixed
100 ms latency offset (use WASAPI's reported latency); the visualizer window
is unowned so it survives main-window minimize (phase 4 docking must keep
that behaviour for streaming); no playlist/settings yet.

## Phase 1 results (2026-11-10) — done

`Kraken MP3.exe` (3.0.0-alpha.1) is now a usable basic player.

**New projects:** `KrakenMp3.Core` (no UI/audio: `PlayQueue`, `AppSettings`) and
`tests/KrakenMp3.Tests` (xUnit, 21 tests, all passing: `dotnet test native/tests/KrakenMp3.Tests`).

**Done**
- Borderless Kraken-themed main window: title bar (PL, VIZ, always-on-top,
  minimise, close), LCD with 30 fps mini spectrum, glowing clock (click for
  remaining time), scrolling ticker, kbps / kHz / mono-stereo from tags
  (TagLibSharp 2.3.0), VOL and BAL sliders (double-click BAL to centre).
- Transport: previous (restarts if past 3 s), play/pause, stop, next, open;
  seek bar; SHUFFLE and REPEAT (off / all / one) buttons; EQ on/off button;
  right-click menu for EQ presets, visualizer mode / background / frame rate.
- `PlayQueue`: v2.0.4 smart-shuffle rules (each track once per cycle; Previous
  and Next walk real history; a new cycle never repeats the last track),
  repeat modes, duplicates kept distinct by id, safe removal/move of the
  current track. Unit tested, including the reported "skip brings song one
  back" bug over 200 seeds.
- Keyboard: Space, Ctrl+←/→, ←/→ ±5 s, ↑/↓ volume, M, S, R, V, Ctrl+O,
  Ctrl+Shift+O, Delete/Enter in the list, media keys while focused.
- Settings JSON at `%APPDATA%\Kraken MP3 Native\settings.json` (atomic save,
  1.5 s debounce, every 15 s while playing, on close; damaged file → defaults).
  Restores playlist, track, position (paused), volume/mute/balance, EQ,
  shuffle/repeat, visualizer settings and window positions (only if still on
  a monitor). `--settings <path>` runs a separate profile for testing.
- Single instance per user session: a second launch hands its files over a
  named pipe (measured 152 ms) and exits; files from Explorer are appended
  and played.
- Basic in-window playlist (virtualised, drag-drop files/folders, add files /
  folder, remove, clear, tag loading in the background, failed files in red
  and skipped). The full playlist window is still phase 2.

**Phase 0 follow-ups closed**
- Visualizer capped at 60 fps by default (30 / 60 / match display in the menu).
- Position and spectrum now follow WASAPI's played-sample clock instead of a
  fixed 100 ms guess; spectrum smoothing is time-based, so it looks the same
  at any frame rate and two views never double-smooth.
- Raw `.aac` duration measured by decoding in the background: 20.0 s (was 21.7).

**Measured (Release, self-test, muted)**

| Phase | Visualizer fps | Frames with signal |
|---|---|---|
| Visible (60 cap) | 60.5 | 241 / 241 |
| Covered | 59.7 | 238 / 238 |
| Main window minimised | 59.5 | 238 / 238 |
| Uncapped | 159.2 | 635 / 635 |

Working set ~180 MB with the main window, playlist and visualizer open;
private ~112 MB.

**Still open:** global media keys (when another app has focus); evaluate
NAudio 3.x and SkiaSharp 3.x (deferred: the pinned versions work, and an
upgrade is safer once the UI settles); RAM trimming.

## Phase 2 results (2026-11-10) — done, plus docking from phase 4

**Playlist window** (`PlaylistWindow`, separate, resizable, owned by the player):
virtualised list; multi-select; drag rows to reorder (insertion marker,
auto-scroll); drop files, folders or M3U playlists at any position; type-ahead
by title; Delete, Enter, Alt+↑/↓/Home/End to move, Ctrl+S save, Ctrl+J jump to
playing; footer ADD (files / folder / M3U), REM (selected, crop, missing,
duplicates), SEL (all / none / invert / jump), MISC (sort by title, artist,
album, file name, folder, length; reverse; randomise; save/load M3U8),
FOLDER, CLEAR; row menu (play, remove, move to top/bottom, show in Explorer,
copy path); position/total time. `PlaylistModel` keeps rows in step with the
queue in place (selection and scroll survive) and only rebuilds for big
reorders.

**EQ window** (`EqWindow`): ON/OFF, RESET, presets menu, preamp + 10 vertical
levers (−12…+12 dB, 0.5 steps, double-click for 0), live readout. Hand edits
switch to **Custom**, which remembers that curve. Presets now use the v2
equalizer-window values (`src/panels/eq-renderer.js`); phase 0/1 had copied
the older table from `renderer.js`, which the docked v2 build does not use.

**Magnetic docking** (pulled forward from phase 4 at the user's request):
`DockManager` (Win32 move loop) + `DockGeometry` (pure, unit tested).
Windows snap within 10 px (DPI-scaled) to each other and to the work area,
including while resizing. Touching windows form a group: dragging the player
moves everything chained to it; dragging any panel pulls it off alone, and
dropping it near an edge snaps it back on. Shift+drag moves the player alone.
An attached visualizer is kept just under the player in z-order.
Defaults stack main → EQ → playlist → visualizer flush, so they start docked.

Fix found by the docking test: the player's saved position used to be applied
after the window was created, so panels opened under the OS default spot (on
the primary monitor). It is now applied before creation.

**Tests:** 31 unit tests (queue, settings, M3U, docking geometry) and
`Kraken MP3.exe --docktest --settings <json> --out <log>`: 23 checks run in
the real windows by sending the same move messages a drag produces (no mouse
or keyboard input) plus the playlist-model edits — all pass.

**Phase 4 still open:** per-panel lock buttons as in v2, minimising/restoring
the visualizer with the group (deliberately not done yet: streaming needs it to
keep running when the player is minimised), resize of a panel pushing the
windows docked below it, Shift+drag not covered by the automated test.

## Phase 3 results (2026-11-10) — done

**Visualizer modes:** every mode of v2 `canvasViz.js` ported to SkiaSharp with
the same maths: Off, Bars, Mirror, LED, Spectrum, Wave (new
`GetByteTimeDomainData`), Circle, Waterfall (scrolls by time, so the speed is
the same at any frame cap). Sizes are scaled by the display DPI. Off-screen
draw cost at 440×162: 0.05–0.31 ms per frame.

**Floating album art** (`FloatingArt`): embedded front cover, else
`cover/folder/front/album.*` or a same-named image in the track's folder,
loaded off the UI thread. Float = the v2 3D spin (true perspective,
rotateY over 14 s, rotateX rocking), Bounce = v2 drift/bounce/spin speeds;
half-transparent with glow in Normal, fully opaque on key backgrounds. Capped
at 85 % of the window's short side so it always fits.

**Visualizer window:** title-bar MODE (cycles), ART (Off/Float/Bounce), BG
(Normal, Green, Magenta, Black, Transparent), ×; click the visualizer to cycle
modes; right-click for mode / art / background / frame-rate menus. Background
changes are applied in place; only switching to/from Transparent recreates
the window (keeping size, position, docking, mode and art). Mode, art and
background are saved.

**Tests:** `Kraken MP3.exe --vizrender <song> <out.png>` renders every mode
(normal and green-key) and both art modes from real audio into one contact
sheet without opening a window; checked visually. Docking test still passes;
live window checked on a side monitor (Spectrum + Float art).

## Phase 5 results (2026-11-10) — done (wallpapers deferred)

**Themes** (`Themes`): all 8 v2 presets (Kraken, Gray, Purple, Crimson,
Sapphire, Amber, Emerald, Rose) with v2's exact colours, plus a Custom palette
built on the current preset (accent, accent bright, LCD text, primary and
secondary text, button face/hover, panel background, title bar). Every window
uses DynamicResource, so a theme change recolours all panels at once; the
visualizer, mini spectrum, clock glow and particles follow it too. Colours are
picked with the Windows colour dialog or typed as #rrggbb.

**Particles** (`ParticleSystem`, port of v2 `particleSystem.js`): Off, Bubbles,
Rain, Stars, Embers, Dust, Snow, Fireflies with Quantity 5–100, Size 1–20,
Speed 1–100, and the 40-particle burst on every track change. Motion is
time-based (v2 assumed 60 fps). Drawn in a click-through layered Win32 window
(`ParticleOverlay`, SkiaSharp → DIB → UpdateLayeredWindow) over the docked
stack only when at least two panels are docked in one compact column, as in
v2. Worst case (Snow, 100 flakes, 440×800): 1.2 ms per frame.

**Effects window** (`EffectsWindow`, `~` key, FX button, right-click menu):
same sections as v2 — particle effect and sliders, visualizer mode, floating
album art, colour themes, custom colours, Windows default-apps shortcut.

**Album art bounce, matched to v2 exactly** (user request): always 180 px
(in a shorter window it stays at the top and bounces sideways, clipped),
square corners (v2 runs `theme-square`), 50 % opacity with the shadow and
accent glow drawn only outside the box so bars show through.

**Docking fix found in the live check:** resizable borderless windows had an
invisible 7–8 px resize border (and a white top edge) inside their window
rectangle, so the playlist and visualizer docked by invisible edges and looked
offset. `FlatFrame` (WindowChrome without caption/glass) removes it; the
docking test now also checks that every window's visible frame equals its
docking rectangle.

**Measured:** full stack with Snow (60), visualizer at 60 fps and Bounce art:
~19 % of one core, ~200 MB working set.

**Wallpapers deferred:** v2's docked build hides the wallpaper layer
(`body.v2-main .background-layer { display: none }`); only the old
single-window mode showed one. Porting needs a design decision (behind which
panels, and how it interacts with the opaque native panels).

**Tests:** `--fxrender <out.png>` renders every effect and the burst in two
themes off-screen; `--vizrender` now shows Float and the v2-style Bounce; docking
test (27 checks) and 31 unit tests pass; live check on a side monitor.

## Phase 6 results (2026-11-10) — 3.0.0 built

- Version 3.0.0 (product "Kraken MP3", company "Kraken Unbound"), self-contained
  win-x64: `Install File\Kraken MP3 Setup 3.0.0.exe` (51 MB, installs a 167 MB
  folder) and portable `Install File\Kraken MP3 3.0.0.exe` (71 MB single file).
- `nativeuild-release.ps1`: unit tests → publish folder + single file → NSIS →
  copy to `Install File`.
- Installer (`native\installer\KrakenMP3.nsi`, NSIS 3, per-machine): upgrades
  v2 in place — reuses electron-builder's Apps & Features key
  (`5409cd53-…`, appId `com.krakenunbound.mp3player.v2`) and folder, removes
  v2's program files only if the folder holds v2's `resourcespp.asar`,
  keeps v2's settings, keeps the `KrakenMP3V2.<ext>` ProgIDs so existing
  defaults still work. Optional audio registration (8 audio types + M3U/M3U8,
  Capabilities, RegisteredApplications, SupportedTypes), App Paths, shortcuts,
  waits for a running player, finish page launches un-elevated and offers
  Default Apps. Uninstaller removes everything and asks before deleting
  settings.
- Verified: both builds decode all 8 formats headless; the installer compiles
  without warnings; its detection logic was run read-only against this PC's
  v2 2.0.2 install (finds `C:\Program Files\Kraken MP3`, recognises v2, running
  check works). **The installer has not been run** (it would replace the
  installed v2) — first real install is the user's.

## Decisions needed before phase 0

1. **Self-contained (~40 MB, nothing to install) or framework-dependent
   (~5 MB, installer adds the .NET Desktop Runtime)?** Recommendation:
   self-contained.
2. **Keep v2 (Electron) shipping until v3 reaches parity?** Recommendation: yes.
3. **Version and identity:** ship as Kraken MP3 **3.0.0**, upgrading v2 in place
   (same product name and registry keys). Recommendation: yes.
