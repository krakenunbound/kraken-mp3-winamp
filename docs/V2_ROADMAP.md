# Kraken MP3 (Winamp Edition) — v2.0 Roadmap

**Status:** In progress (Phase 4: magnetic free-order docking ✅; polish 2c/5 next)  
**Target version:** 2.0.0  
**Baseline:** v1.0.x (single Electron window, stacked panels, global particles)  
**Backup before v2 work:** `F:\Kraken_MP3_Winamp_backup_2026-05-27_1050` (create a fresh dated backup before each major phase)

### Window map (target v2.0)

| # | Window | Contents | Notes |
|---|--------|----------|--------|
| 1 | **Main** | Transport, LCD, **mini** spectrum, volume, effects **menu** (popup) | No playlist, no EQ, no full-size viz |
| 2 | **EQ** | 10-band EQ + presets | ✅ Phase 1 — lock/unlock works |
| 3 | **Playlist** | Track list, add/rem/folder, times | ✅ Phase 2a — separate window + lock |
| 4 | **Visualizer** | Bars / wave / circle canvas, **floating album art** | ✅ Phase 2b — separate window + dock |

**Not separate windows (by design):**

| Layer | Role |
|-------|------|
| **Particles overlay** | Bubbles, rain, stars, etc. — **app-wide** across docked stack (Phase 3 ✅) |
| **Wallpapers** | Background images — follow particle overlay or main; TBD |
| **Audio engine** | Stays in **main** renderer only (`<audio>`, Web Audio, analyser feed to viz via IPC) |

### Issue to remember — visualizer vs playlist split

Today `#visualizerCanvas` is **full-size behind the whole stack** (main + playlist). That bleed-through is **intentional in v1**.

When the **playlist detaches**, that canvas must **not** live in the main window anymore (playlist would show empty ocean or wrong viz). Plan:

- **Remove** full-window `visualizerCanvas` from main/playlist HTML.
- **Create** `panels/visualizer.html` + window with the large canvas only.
- **Keep** `miniVizCanvas` on main LCD only.
- **Move** floating album art into the visualizer window (not playlist).
- Viz modes (bars/circle/wave) driven from effects menu on main → IPC → visualizer window draws using shared analyser data (or frequency array broadcast from main).

---

## 1. Vision

Deliver **real Winamp-style composable UI**: Main, EQ, Playlist, and Visualizer as **independently movable** units that can **magnetically dock to any edge** of another panel (any order, vertical or horizontal) or **float on any monitor**, while preserving Kraken’s ocean identity.

### Must keep (non-negotiable)

| Feature | Scope in v2 |
|---------|-------------|
| **Particle effects** (bubbles, rain, etc.) | **Entire active app** — all visible panel windows share one effect system and one on/off toggle |
| **Kraken themes** | All panels use same theme variables |
| **Audio / EQ / playlist logic** | One playback owner; no desync between windows |
| **Existing shortcuts & settings** | Migrate; don’t break `localStorage` keys without migration |

### Must change

| Feature | v1 behavior | v2 behavior |
|---------|-------------|-------------|
| **Panel layout** | Single window, flex column, show/hide | Multi-window dock / undock / reorder |
| **Floating album art** | Inside playlist body | **Visualization** panel/layer only |
| **Main visualizer canvas** | Full-window background | **Visualizer** panel (or shared viz layer) |
| **Drag** | Only main title bar moves app | Each panel title bar moves **that** window |

### Out of scope for v2.0 (defer)

- Milkdrop-style plugin system
- Skins marketplace / user skin compiler
- Library / media database window
- macOS / Linux builds (Windows first)
- Rewriting git history or unrelated repo cleanup

---

## 2. Architecture (decided)

### 2.1 Window model — **Hybrid phased**

```
┌─────────────────────────────────────────────────────────────┐
│  Main process (Node)                                         │
│  • windowManager — create/destroy BrowserWindows             │
│  • dockEngine — snap thresholds, dock groups, move-as-group  │
│  • layoutStore — load/save panel layout JSON                 │
│  • ipcBridge — typed IPC between windows                     │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │  Main    │        │   EQ     │        │ Playlist │
   │  window  │◄─dock─►│  window  │◄─dock─►│  window  │
   └──────────┘        └──────────┘        └──────────┘
         │                                        │
         │         ┌──────────┐                 │
         └─dock───►│Visualizer│◄────────────────┘
                   │  window  │
                   └──────────┘

   ┌──────────────────────────────────────────────────────────┐
   │  Effects layer (Phase 1b+) — optional dedicated window    │
   │  • bubblesCanvas, particlesCanvas                         │
   │  • click-through, sized to union of docked panel bounds   │
   │  • OR single parent “shell” window behind panels (spike) │
   └──────────────────────────────────────────────────────────┘
```

**Playback owner:** **Main** window only — `<audio>`, Web Audio, EQ nodes, playlist state, metadata.

**Satellite windows:** Thin UI + IPC; send commands (play, seek, select track), receive state broadcasts.

### 2.2 Particle effects — **app-wide**

- One particle runtime (same as today: `bubblesCanvas`, `particlesCanvas`).
- **Not** limited to Visualizer window.
- Implementation options (pick in **Spike 0**):

  | Option | Description | Pros | Cons |
  |--------|-------------|------|------|
  | **A. Effects overlay window** | Frameless, transparent, `pointer-events: none`, rect = bounding box of all docked panels | True multi-monitor particles | Sync position on every move |
  | **B. Shell window** | One tall window; panels are child regions (still one HWND) | Simplest port of current code | Weaker “true” multi-monitor |
  | **C. Per-panel canvas** | Duplicate draw in each window | — | CPU sync nightmare — **reject** |

**Recommendation:** Start spike with **A**; fall back to **B** for v2.0.0 if snap/move latency is bad.

### 2.3 Floating album art — **visualization only**

- Move `floatingAlbumStage` from `#playlistPanel` → visualizer host (HTML + bounds logic).
- Effects menu: rename section to **“Album art”** under visualization.
- Playlist: list-only; no cover overlay on rows.
- **Fallback:** if Visualizer closed/hidden, show static art on main LCD only (already partially there).

### 2.4 Docking rules (match Winamp expectations)

| Rule | Behavior |
|------|----------|
| Snap distance | ~15–20 px edge overlap triggers dock |
| Dock direction | Vertical stack primary (v2.0); horizontal later |
| Move group | Dragging docked title bar moves **entire group** |
| Undock | Drag away past threshold → break link, free window |
| Order | User can reorder stack (main ↔ eq ↔ pl ↔ viz) when docked |
| Z-order | Clicked panel raises; effects layer stays below all |

### 2.5 Security / tech debt (do early)

- Replace `nodeIntegration: true` with **`contextIsolation: true`** + **preload** script.
- Split `renderer.js` (~2,570 lines) into modules before multi-window IPC explodes complexity.

---

## 3. Phased delivery

### Phase 0 — Prep (≈ 0.5–1 day)

| ID | Task | Done when |
|----|------|-----------|
| 0.1 | Dated backup (`src`, `assets`, `build`, docs — exclude `node_modules`, `dist`) | Folder on `F:\` |
| 0.2 | Create branch `feature/v2-docking` | Branch exists |
| 0.3 | Add `docs/V2_ROADMAP.md` (this file) | Committed |
| 0.4 | Module skeleton: `src/main/`, `src/preload/`, `src/renderer/` | Requires no behavior change |
| 0.5 | Preload + IPC ping test (`ping` / `pong`) | DevTools shows round-trip |

### Phase 1 — Spike: two windows + snap (≈ 2–4 hours) ← **first coding session**

| ID | Task | Done when |
|----|------|-----------|
| 1.1 | Extract **Main** HTML shell (transport + LCD only) | Main window loads |
| 1.2 | Second **EQ** `BrowserWindow` (frameless, same width) | EQ visible |
| 1.3 | IPC: EQ sliders → main Web Audio graph | EQ still changes sound |
| 1.4 | Drag EQ by title bar; main drags separately | Independent movement |
| 1.5 | Snap: EQ bottom edge ↔ main top edge (one direction) | Release mouse → edges align |
| 1.6 | Move group: drag main title bar moves both when docked | Group move works |
| 1.7 | Persist `{ eqDocked: true, positions }` to `localStorage` | Restart restores layout |

**Spike exit criteria:** Demo video or screenshot of docked + undocked Main+EQ with working audio EQ.

### Phase 2a — Playlist window (next)

| ID | Task |
|----|------|
| 2a.1 | `index-v2.html` — **main only** (remove playlist panel from DOM) |
| 2a.2 | `panels/playlist.html` — list UI, footer buttons, **lock** icon |
| 2a.3 | IPC: playlist ops + state sync (highlight, times, empty state) |
| 2a.4 | Extend `dockEngine` for **main ↔ playlist ↔ eq** chain |
| 2a.5 | **Strip** `#visualizerCanvas` from main stack (no viz behind playlist) |
| 2a.6 | PL toggle + playlist lock functional |

### Phase 2b — Visualizer window (after playlist)

| ID | Task |
|----|------|
| 2b.1 | **New** `panels/visualizer.html` — `#visualizerCanvas` only (bars/wave/circle) |
| 2b.2 | IPC: `kraken:viz` mode + analyser frequency data (or bitmap) from main |
| 2b.3 | Move **floating album art** here; remove from playlist |
| 2b.4 | Visualizer lock + dock in chain; optional hide when mode = Off |
| 2b.5 | Effects menu on main still sets viz mode; visualizer window reflects it |

### Phase 2c — Dock polish

| ID | Task |
|----|------|
| 2c.1 | `layoutStore` — all four rectangles + dock order |
| 2c.2 | Reorder stack (user drag dock order — if time) → **done as Phase 4a magnetic graph** |
| 2c.3 | EQ/PL/Viz toggles open/close/focus satellite windows |

### Phase 3 — Global effects layer (≈ 3–5 days)

| ID | Task |
|----|------|
| 3.1 | Effects overlay window sized to dock group union |
| 3.2 | Reparent particle loop to drive overlay dimensions |
| 3.3 | On dock/undock/move — debounced resize/reposition overlay |
| 3.4 | Single effects toggle applies to overlay; pause when app minimized |

### Phase 4a — Magnetic docking (any order / axis) ✅

| ID | Task |
|----|------|
| 4a.1 | `dockGraph.js` — parent/edge links (N/S/E/W), migrate v4 layout |
| 4a.2 | Snap on drag release; break when pulled beyond threshold |
| 4a.3 | Subtree move (children follow parent); pull ancestors when dragging a docked child |
| 4a.4 | Layout v5 persists `dockGraph.links`; particles overlay when all 4 in one group |

### Phase 4 — Polish & ship v2.0.0 (≈ 1 week)

| ID | Task |
|----|------|
| 4.1 | DPI / multi-monitor edge cases |
| 4.2 | Always-on-top applies to group or per-window (decide + document) |
| 4.3 | Update `USER_GUIDE.md`, `README.md`, screenshots |
| 4.4 | Version bump `2.0.0`, installer smoke test |
| 4.5 | GitHub release + refresh `Install File/` copies |

---

## 4. File / module plan

```
src/
├── main/
│   ├── index.js              # app entry (from main.js)
│   ├── windowManager.js      # BrowserWindow factory
│   ├── dockEngine.js         # magnetic snap, subtree layout
│   ├── dockGraph.js          # link graph + edge geometry
│   └── layoutStore.js        # read/write layout JSON
├── preload/
│   └── preload.js            # contextBridge API
├── renderer/
│   ├── main/                 # playback, LCD, transport
│   │   ├── index.html
│   │   └── main.js
│   ├── eq/
│   │   ├── index.html
│   │   └── eq.js
│   ├── playlist/
│   │   ├── index.html
│   │   └── playlist.js
│   ├── visualizer/
│   │   ├── index.html
│   │   ├── visualizer.js
│   │   └── albumArt.js       # float / bounce
│   └── shared/
│       ├── ipc.js
│       ├── themes.js
│       └── particles.js      # if overlay hosted in main renderer
└── styles/
    ├── shared.css            # variables, panel chrome
    ├── main.css
    ├── eq.css
    ├── playlist.css
    └── visualizer.css
```

**v1 monolith** (`renderer.js`, single `index.html`) stays on `master` until Phase 2 gate passes; develop on `feature/v2-docking`.

---

## 5. IPC contract (draft)

Channel prefix: `kraken:`

### Main → satellites (broadcast)

| Channel | Payload | Purpose |
|---------|---------|---------|
| `kraken:state` | `{ playing, currentIndex, trackMeta, time, duration }` | Sync LCD / playlist highlight |
| `kraken:theme` | `{ themeId, cssVars }` | Theme change |
| `kraken:effects` | `{ particleType, qty, size, speed }` | Particle settings |
| `kraken:viz` | `{ mode: 'bars'|'wave'|'circle'|'none' }` | Visualizer mode |

### Satellites → Main (invoke)

| Channel | Payload | Purpose |
|---------|---------|---------|
| `kraken:transport` | `{ action: 'play'|'pause'|'next'|... }` | Buttons |
| `kraken:eq` | `{ bands, preamp, enabled }` | EQ sliders |
| `kraken:playlist` | `{ action, paths?, index? }` | List ops |
| `kraken:layout` | `{ windowId, x, y }` | Report drag end (optional) |

### Main process only

| Channel | Purpose |
|---------|---------|
| `kraken:dock:attach` | Link two window IDs |
| `kraken:dock:detach` | Break link |
| `kraken:dock:moveGroup` | Move all HWNDs in group |
| `kraken:effects:bounds` | Resize overlay to union rect |

---

## 6. Layout persistence schema

```json
{
  "version": 2,
  "windows": {
    "main":   { "x": 100, "y": 100, "visible": true },
    "eq":     { "x": 100, "y": 280, "visible": false, "dockedTo": "main", "edge": "below" },
    "playlist": { "x": 100, "y": 520, "visible": true, "dockedTo": "eq", "edge": "below" },
    "visualizer": { "x": 520, "y": 100, "visible": true, "dockedTo": null }
  },
  "dockOrder": ["main", "eq", "playlist"],
  "effects": {
    "globalParticles": true,
    "type": "bubbles"
  },
  "albumArt": {
    "mode": "float"
  }
}
```

**Migration from v1:** Map `showEqPanel` → `windows.eq.visible`, `showPlaylistPanel` → `windows.playlist.visible`, default all positions stacked at first run.

---

## 7. Testing plan

### 7.1 Manual test matrix (each phase)

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Fresh install, first run | Bonus track loads; default docked stack |
| T2 | Play / pause / seek | Works from main; playlist stays in sync |
| T3 | EQ adjust while playing | Audible change; no crash when EQ window closed |
| T4 | Dock EQ below main | Edges flush; no gap > 1px |
| T5 | Drag main title while docked | EQ moves with main |
| T6 | Undock EQ | EQ independent; main stays put |
| T7 | Playlist on second monitor | Particles visible on both (Phase 3) |
| T8 | Toggle bubbles off | All panels lose particles instantly |
| T9 | Float / bounce art | Only in visualizer; not over playlist text |
| T10 | Minimize / restore | Layout and playback survive |
| T11 | Always on top | Defined behavior (document which windows) |
| T12 | 125% / 150% Windows scaling | Snap still aligns |
| T13 | File association open | Queues track; focus main |
| T14 | Restart app | Layout JSON restores positions |
| T15 | Upgrade from v1 settings | No corrupt `localStorage`; sensible defaults |

### 7.2 Regression checklist (pre-release)

- [ ] All 8 audio formats open and play  
- [ ] Shuffle / repeat / mute / volume keys  
- [ ] 10-band EQ presets  
- [ ] All 8 particle types + quantity sliders  
- [ ] All 3 visualizer modes + mini LCD viz  
- [ ] Themes switch on all windows  
- [ ] Custom wallpapers path  
- [ ] Uninstall removes file associations  
- [ ] NSIS install / portable both launch  

### 7.3 Automated tests (optional, Phase 4+)

| Test | Tool | Notes |
|------|------|-------|
| IPC contract | Node unit tests on channel names / payload shapes | No Electron needed |
| `dockEngine` snap math | Pure functions: rect + rect → snap? | Jest or node:test |
| E2E smoke | Playwright for Electron | Heavy; one happy-path only |

**Pragmatic v2.0:** Manual matrix is acceptable if spike + Phase 2 gates are disciplined.

---

## 8. Risks & mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Multi-window IPC desync | Wrong track / stuck UI | Single source of truth on main; broadcast after every state change |
| Particle overlay lag on drag | Janky dock | Debounce 16ms; hide overlay during drag optional |
| Scope creep | Never ship v2 | Phase gates; ship 2.0.0 with Main+EQ+PL dock, viz optional |
| `renderer.js` split breaks features | Regressions | Keep v1 branch tag; test matrix each phase |
| DPI misalignment | Visible gaps when docked | Use screen physical pixels in `dockEngine`; test 100% + 150% |
| Memory (4+ windows) | Slower on old PCs | Lazy-create playlist/viz; destroy when closed |

---

## 9. Success criteria for v2.0.0

1. User can **undock** EQ and Playlist and place them on **another monitor**.  
2. User can **redock** by dragging near main (snap).  
3. **Dragging docked** title bar moves **whole group**.  
4. **Particles** (e.g. bubbles) render across **all** open panel windows when enabled.  
5. **Floating album art** plays only in **Visualizer**, not playlist.  
6. No regression on playback, EQ, effects menu, themes, or file associations.  
7. Layout survives restart.

---

## 10. First coding session (2–4 hours) — **do this next**

Copy-paste checklist for the room:

```
[ ] 0. Backup → Kraken_MP3_Winamp_backup_<date>
[ ] 1. git checkout -b feature/v2-docking
[ ] 2. Add src/preload/preload.js + contextIsolation in main
[ ] 3. IPC ping test
[ ] 4. Duplicate minimal EQ window (second BrowserWindow)
[ ] 5. EQ IPC → main audio graph (one slider enough for proof)
[ ] 6. Implement snap EQ.bottom to main.top (hardcoded 15px)
[ ] 7. Group drag when docked
[ ] 8. Save/load one JSON blob in localStorage
[ ] 9. Run T4, T5, T6 from manual matrix
[ ] 10. Note spike result in this doc (Appendix A)
```

**Stop rule:** If snap/group isn’t stable in 4 hours, document blockers in Appendix A and consider **Shell window (option B)** before building playlist/viz.

---

## Appendix A — Spike log (fill in as you go)

| Date | Who | Result | Notes |
|------|-----|--------|-------|
| 2026-05-27 | The Kraken | Phase 1 complete | EQ separate window; lock/unlock dock; `index-v2.html` (main+PL); playlist + viz window split documented for Phase 2a/2b |

### Open decisions

- [ ] Effects overlay **A** vs shell **B** for particles  
- [ ] Always-on-top: all windows vs main only  
- [ ] Visualizer required at first run or optional window  
- [ ] Minimum Windows version (10 vs 11)  

---

## Appendix B — v1 reference (current code anchors)

| Concern | File | Symbol / ID |
|---------|------|-------------|
| Single window | `src/main.js` | `createWindow()` |
| Panel stack | `src/index.html` | `.winamp-layout` |
| Panel show/hide | `src/renderer.js` | `applyPanelVisibility()` |
| Particles | `src/renderer.js` | bubble/particle loops, `#bubblesCanvas` |
| Full visualizer | `src/renderer.js` | `#visualizerCanvas` |
| Floating art | `src/index.html` | `#floatingAlbumStage` in playlist |
| Window drag | `src/styles.css` | `#titleBar` `-webkit-app-region: drag` |
| Settings | `src/renderer.js` | `saveSettings()` / `loadSettings()` |

---

*Document owner: The Kraken (Kraken Unbound). Update this file as phases complete.*
