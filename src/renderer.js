const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

function detectV2Docking() {
    try {
        if (/index-v2\.html$/i.test(window.location.pathname)) return true;
        if (new URLSearchParams(window.location.search).get('v2') === '1') return true;
    } catch (_) { /* ignore */ }
    return process.argv.includes('--v2-docking');
}
const isV2Docking = detectV2Docking();
if (isV2Docking) console.log('[Kraken] v2 docking mode — embedded EQ disabled');

// Metadata parsing runs in the main process. This keeps the renderer compatible
// with the ESM-only current music-metadata package and centralizes file parsing.
function parseAudioMetadata(filePath, options) {
    return ipcRenderer.invoke('parse-audio-metadata', filePath, options);
}

// ============================================================================
// STATE
// ============================================================================
let playlist = [];
let currentIndex = 0;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0; // 0: off, 1: all, 2: one
let backgroundImages = [];
let currentBgIndex = 0;
let isDraggingProgress = false;

// Effects state
let currentEffect = 'bubbles';
let currentViz = 'none';
let currentTheme = 'kraken';
let floatArtMode = 'off'; // off | float | bounce

// Floating album art
let currentAlbumArtUrl = null;
const FLOAT_ART_SIZE = 180;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let albumArtBounce = {
    x: 20, y: 20, vx: 90, vy: 70,
    rotZ: 0, vRotZ: 45, lastTime: 0
};

const {
    PRESETS,
    buildThemePayload,
    applyThemePayload,
    applyDockStackChrome,
    getParticleTheme
} = require('./shared/uiThemes');
const { drawVisualizerMode, resetWaterfall } = require('./shared/canvasViz');

let activeThemeColors = getParticleTheme('kraken');
let customThemeColors = {};
/**
 * Which preset the 'custom' slot is layered on top of. The Custom theme
 * button shows PRESETS[customBaseTheme] + customThemeColors overrides.
 * Updated when the user edits a color while on a preset (the active preset
 * becomes the new base and the edit lands in the custom slot).
 */
let customBaseTheme = 'kraken';

// Per-effect settings - each effect has its own quantity, size, speed
const defaultEffectSettings = {
    none: { quantity: 25, size: 8, speed: 30 },
    bubbles: { quantity: 20, size: 10, speed: 40 },
    rain: { quantity: 60, size: 8, speed: 50 },
    stars: { quantity: 50, size: 10, speed: 50 },  // quantity = spawn frequency for stars
    embers: { quantity: 15, size: 8, speed: 25 },
    dust: { quantity: 30, size: 6, speed: 20 },
    snow: { quantity: 40, size: 10, speed: 30 },
    fireflies: { quantity: 12, size: 10, speed: 30 }
};

let perEffectSettings = JSON.parse(JSON.stringify(defaultEffectSettings));
let effectSettings = perEffectSettings.bubbles; // Current effect's settings

// Graphic EQ settings
const eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const defaultEqSettings = {
    enabled: false,
    preamp: 0,
    bands: eqFrequencies.map(() => 0),
    preset: 'flat'
};
const eqPresets = {
    flat: { preamp: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    rock: { preamp: 0, bands: [3, 2, 1, 0, -1, -1, 1, 2, 3, 4] },
    pop: { preamp: 0, bands: [-1, 1, 2, 3, 1, -1, -1, 0, 1, 2] },
    jazz: { preamp: 0, bands: [2, 1, 0, 1, 2, 2, 1, 0, 1, 2] },
    classical: { preamp: 0, bands: [0, 0, -1, -2, -1, 1, 2, 3, 4, 5] },
    'bass-boost': { preamp: 0, bands: [5, 4, 3, 2, 1, 0, -1, -2, -3, -4] }
};
let eqEnabled = defaultEqSettings.enabled;
let eqPreampDb = defaultEqSettings.preamp;
let eqBandGains = [...defaultEqSettings.bands];
let eqPreset = defaultEqSettings.preset;

// Canvas contexts
let bubblesCtx = null;
let particlesCtx = null;
let visualizerCtx = null;
let miniVizCtx = null;
let effectParticles = [];
let burstParticles = [];

// Balance / panner
let stereoPannerNode = null;

// Panel visibility
let showEqPanel = false;
let showPlaylistPanel = true;
let showVizPanel = true;
let vizAlbumArtDataUrl = null;

// Playlist metadata (durations, display titles)
let playlistMeta = []; // array of {title, duration} per playlist index

// Monotonic token guarding async loadMetadata() against races.
// Each call captures its token; if the global has advanced by the time
// parseFile() resolves, the result is stale and gets discarded.
// Without this, a slow parseFile on a previous track can clobber the
// currently-displayed track's metadata — most visibly on .wav files,
// which have no ID3 tags of their own to "fight back" once the stale
// result lands.
let metadataLoadToken = 0;

// Selected playlist item
let selectedPlaylistIdx = -1;

// Time display mode: false = elapsed, true = remaining
let showRemainingTime = false;

// Audio context for visualizer
let audioContext = null;
let analyser = null;
let dataArray = null;
let timeDomainArray = null;
let audioSource = null;
let eqPreampNode = null;
let eqFilters = [];

// Ticker state
let tickerText = '';
let tickerAnimationId = null;
let tickerTimeoutId = null;
const TICKER_SPEED = 60; // pixels per second
const TICKER_DELAY = 8; // seconds between scrolls

// ============================================================================
// DOM ELEMENTS
// ============================================================================
const audio = document.getElementById('audioPlayer');
const albumArt = document.getElementById('albumArt');
const trackTitle = document.getElementById('trackTitle');
const trackArtist = document.getElementById('trackArtist');
const trackAlbum = document.getElementById('trackAlbum');
const trackNumber = document.getElementById('trackNumber');
const trackComment = document.getElementById('trackComment');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');
const progressContainer = document.getElementById('progressContainer');
const currentTimeEl = document.getElementById('currentTime');
const totalTimeEl = document.getElementById('totalTime');
const volumeSlider = document.getElementById('volumeSlider');
const backgroundLayer = document.getElementById('backgroundLayer');
const bubblesCanvas = document.getElementById('bubblesCanvas');
const particlesCanvas = document.getElementById('particlesCanvas');
const visualizerCanvas = document.getElementById('visualizerCanvas');
const dropOverlay = document.getElementById('dropOverlay');
const effectsMenu = document.getElementById('effectsMenu');
const eqToggle = document.getElementById('eqToggle');
const eqReset = document.getElementById('eqReset');
const eqPresetSelect = document.getElementById('eqPreset');
const eqPreampSlider = document.getElementById('eqPreamp');
const eqPreampVal = document.getElementById('eqPreampVal');
const eqBandSliders = Array.from(document.querySelectorAll('.eq-slider'));

// Buttons
const btnPlay = document.getElementById('btnPlay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnStop = document.getElementById('btnStop');
const btnShuffle = document.getElementById('btnShuffle');
const btnRepeat = document.getElementById('btnRepeat');
const btnMute = document.getElementById('btnMute');
const btnOpen = document.getElementById('btnOpen');
const btnEffects = document.getElementById('btnEffects');
const btnMinimize = document.getElementById('btnMinimize');
const btnClose = document.getElementById('btnClose');
const btnAlwaysOnTop = document.getElementById('btnAlwaysOnTop');

// Panel toggle buttons
const btnEqToggle = document.getElementById('btnEqToggle');
const btnPlToggle = document.getElementById('btnPlToggle');
const btnVizToggle = document.getElementById('btnVizToggle');
const btnEqClose = document.getElementById('btnEqClose');
const btnPlClose = document.getElementById('btnPlClose');
const eqPanel = document.getElementById('eqPanel');
const playlistPanel = document.getElementById('playlistPanel');

// Icons
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const volumeIcon = document.getElementById('volumeIcon');
const muteIcon = document.getElementById('muteIcon');

// Winamp display elements
const balanceSlider = document.getElementById('balanceSlider');
const volValue = document.getElementById('volValue');
const balValue = document.getElementById('balValue');
const trackBitrate = document.getElementById('trackBitrate');
const trackSampleRate = document.getElementById('trackSampleRate');
const monoInd = document.getElementById('monoInd');
const stereoInd = document.getElementById('stereoInd');
const miniVizCanvas = document.getElementById('miniVizCanvas');
const timeModeBtn = document.getElementById('timeModeBtn');

// Playlist
const playlistTracks = document.getElementById('playlistTracks');
const plCurrentTime = document.getElementById('plCurrentTime');
const plBtnAdd = document.getElementById('plBtnAdd');
const plBtnRem = document.getElementById('plBtnRem');
const plBtnSel = document.getElementById('plBtnSel');
const plBtnMisc = document.getElementById('plBtnMisc');
const plBtnFolder = document.getElementById('plBtnFolder');
const plBtnClear = document.getElementById('plBtnClear');

// Floating album art
const floatingAlbumStage = document.getElementById('floatingAlbumStage');
const floatingAlbum = document.getElementById('floatingAlbum');
const floatingAlbumImg = document.getElementById('floatingAlbumImg');

// Effect sliders
const effectQuantitySlider = document.getElementById('effectQuantity');
const effectSizeSlider = document.getElementById('effectSize');
const effectSpeedSlider = document.getElementById('effectSpeed');
const effectQuantityVal = document.getElementById('effectQuantityVal');
const effectSizeVal = document.getElementById('effectSizeVal');
const effectSpeedVal = document.getElementById('effectSpeedVal');

// ============================================================================
// INITIALIZATION
// ============================================================================
async function init() {
    console.log('Kraken MP3 initializing...');

    // Load settings
    loadSettings();

    // Setup audio
    audio.volume = volumeSlider.value / 100;
    updateVolumeSlider();

    // Load background images
    await loadBackgrounds();

    // Initialize visual effects
    initCanvases();

    // Initialize audio context for visualizer
    initAudioContext();

    // Setup event listeners
    setupEventListeners();
    // Tell the main process it is now safe to deliver startup/association
    // file events. did-finish-load alone is too early because init() awaits
    // background loading before installing these listeners.
    ipcRenderer.send('kraken:renderer-ready');

    if (isV2Docking) {
        setupDockLockUI();
        document.body.classList.add('theme-square');
    }

    // Start background rotation
    setInterval(rotateBackground, 30000);

    // Start animation loops
    requestAnimationFrame(animationLoop);

    console.log('Kraken MP3 initialized! Effect:', currentEffect);
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('krakenMp3Settings') || '{}');
    volumeSlider.value = settings.volume ?? 80;
    currentEffect = settings.effect ?? 'bubbles';
    currentViz = settings.visualizer ?? 'none';
    currentTheme = settings.theme ?? 'kraken';
    customThemeColors = settings.customThemeColors || {};
    customBaseTheme = settings.customBaseTheme || 'kraken';
    // Migration: pre-custom-slot users had customThemeColors overlaid on every
    // preset. Promote them into the Custom slot so they see their work after
    // the behavior change (presets are now clean).
    if (settings.customBaseTheme === undefined
        && Object.keys(customThemeColors).length > 0
        && currentTheme !== 'custom') {
        customBaseTheme = PRESETS[currentTheme] ? currentTheme : 'kraken';
        currentTheme = 'custom';
    }
    floatArtMode = settings.floatArtMode ?? 'off';
    isShuffle = settings.shuffle ?? false;
    repeatMode = settings.repeat ?? 0;
    const storedEq = settings.eq ?? {};
    eqEnabled = storedEq.enabled ?? defaultEqSettings.enabled;
    eqPreampDb = storedEq.preamp ?? defaultEqSettings.preamp;
    eqBandGains = Array.isArray(storedEq.bands) && storedEq.bands.length === eqFrequencies.length
        ? [...storedEq.bands]
        : [...defaultEqSettings.bands];
    eqPreset = storedEq.preset ?? defaultEqSettings.preset;

    // Load per-effect settings, merging with defaults
    if (settings.perEffectSettings) {
        Object.keys(defaultEffectSettings).forEach(effect => {
            if (settings.perEffectSettings[effect]) {
                perEffectSettings[effect] = {
                    ...defaultEffectSettings[effect],
                    ...settings.perEffectSettings[effect]
                };
            }
        });
    }

    // Set current effect's settings
    effectSettings = perEffectSettings[currentEffect] || perEffectSettings.bubbles;

    // Panel visibility
    showEqPanel = settings.showEqPanel ?? (isV2Docking ? true : false);
    showPlaylistPanel = settings.showPlaylistPanel ?? true;
    showVizPanel = settings.showVizPanel ?? true;

    // Apply settings to UI
    if (isShuffle) btnShuffle.classList.add('active');
    if (repeatMode > 0) btnRepeat.classList.add('active');

    // Update effect sliders to show current effect's settings
    updateSlidersForCurrentEffect();

    // Update effect buttons
    document.querySelectorAll('.effect-btn[data-effect]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.effect === currentEffect);
    });
    document.querySelectorAll('.effect-btn[data-viz]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.viz === currentViz);
    });

    document.querySelectorAll('.effect-btn[data-float-art]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.floatArt === floatArtMode);
    });

    applyFloatArtMode(floatArtMode);

    applyTheme(currentTheme, { broadcast: false });

    updateEqUI();
    applyPanelVisibility();
    if (isV2Docking && !showEqPanel) {
        ipcRenderer.send('kraken:window:close-eq');
    }
    if (isV2Docking) {
        broadcastVizConfig();
        if (currentViz !== 'none' && showVizPanel) {
            ipcRenderer.send('kraken:viz:ensure-visible');
        }
    }
}

function updateSlidersForCurrentEffect() {
    if (!effectQuantitySlider) return;
    effectQuantitySlider.value = effectSettings.quantity;
    effectSizeSlider.value = effectSettings.size;
    effectSpeedSlider.value = effectSettings.speed;
    effectQuantityVal.textContent = effectSettings.quantity;
    effectSizeVal.textContent = effectSettings.size;
    effectSpeedVal.textContent = effectSettings.speed;
}

function updateEqUI() {
    if (!eqToggle) return;
    eqToggle.classList.toggle('active', eqEnabled);
    eqToggle.textContent = eqEnabled ? 'ON' : 'OFF';
    if (eqPresetSelect) eqPresetSelect.value = eqPreset;
    if (eqPreampSlider) eqPreampSlider.value = eqPreampDb;
    if (eqPreampVal) eqPreampVal.textContent = `${eqPreampDb > 0 ? '+' : ''}${eqPreampDb} dB preamp`;
    eqBandSliders.forEach((slider, index) => {
        slider.value = eqBandGains[index] ?? 0;
    });
}

function setEqPreset(presetName, { updateSelect = true } = {}) {
    const preset = eqPresets[presetName];
    if (!preset) return;
    eqPreset = presetName;
    eqPreampDb = preset.preamp;
    eqBandGains = [...preset.bands];
    if (updateSelect) {
        eqPresetSelect.value = presetName;
    }
    updateEqUI();
    applyEqSettings();
    saveSettings();
}

function markEqCustom() {
    eqPreset = 'custom';
    eqPresetSelect.value = 'custom';
}

function applyEqSettings() {
    if (!audioContext) return;
    if (eqPreampNode) {
        const preampGain = eqEnabled ? Math.pow(10, eqPreampDb / 20) : 1;
        eqPreampNode.gain.value = preampGain;
    }
    eqFilters.forEach((filter, index) => {
        const gain = eqEnabled ? (eqBandGains[index] ?? 0) : 0;
        filter.gain.value = gain;
    });
}

function applyEqFromRemote(payload) {
    if (!payload) return;
    eqEnabled = payload.enabled ?? eqEnabled;
    eqPreampDb = payload.preamp ?? eqPreampDb;
    if (Array.isArray(payload.bands) && payload.bands.length === eqFrequencies.length) {
        eqBandGains = [...payload.bands];
    }
    eqPreset = payload.preset ?? eqPreset;
    if (!isV2Docking) updateEqUI();
    applyEqSettings();
    saveSettings();
}

window.getEqStateForIpc = function getEqStateForIpc() {
    return {
        enabled: eqEnabled,
        preamp: eqPreampDb,
        bands: [...eqBandGains],
        preset: eqPreset
    };
};

if (isV2Docking) {
    ipcRenderer.on('kraken:eq:apply', (_event, payload) => applyEqFromRemote(payload));
    ipcRenderer.on('kraken:v2-mode', () => {
        if (eqPanel) eqPanel.style.display = 'none';
        applyPanelVisibility();
    });
    ipcRenderer.on('kraken:playlist:push-sync', () => broadcastPlaylistState());
    ipcRenderer.on('kraken:playlist:action', (_event, payload) => handlePlaylistPanelAction(payload));
    ipcRenderer.on('kraken:playlist:visibility', (_event, visible) => {
        showPlaylistPanel = !!visible;
        if (btnPlToggle) btnPlToggle.classList.toggle('active', showPlaylistPanel);
        saveSettings();
    });
    ipcRenderer.on('kraken:viz:visibility', (_event, visible) => {
        showVizPanel = !!visible;
        if (btnVizToggle) btnVizToggle.classList.toggle('active', showVizPanel);
        saveSettings();
    });
    ipcRenderer.on('kraken:viz:request-sync', () => {
        broadcastVizConfig();
        refreshVizAlbumArtIpc();
    });
    ipcRenderer.on('kraken:effects:apply', (_event, payload) => handleEffectsPanelApply(payload));
    ipcRenderer.on('kraken:effects:request-sync', () => broadcastEffectsState());
    ipcRenderer.on('kraken:effects:visibility', (_event, visible) => {
        if (btnEffects) btnEffects.classList.toggle('active', !!visible);
    });
}

window.getEffectsStateForIpc = function getEffectsStateForIpc() {
    return {
        effect: currentEffect,
        visualizer: currentViz,
        floatArtMode,
        theme: currentTheme,
        customBaseTheme,
        customThemeColors: { ...customThemeColors },
        effectSettings: { ...effectSettings }
    };
};

window.getThemePayloadForIpc = function getThemePayloadForIpc() {
    const isCustom = currentTheme === 'custom';
    const baseId = isCustom ? (PRESETS[customBaseTheme] ? customBaseTheme : 'kraken') : currentTheme;
    const overrides = isCustom ? customThemeColors : {};
    const payload = buildThemePayload(baseId, overrides);
    payload.themeId = currentTheme;
    return payload;
};

function broadcastEffectsState() {
    if (!isV2Docking) return;
    ipcRenderer.send('kraken:effects:state', getEffectsStateForIpc());
}

function handleEffectsPanelApply(payload) {
    if (!payload || !payload.action) return;
    switch (payload.action) {
        case 'set-effect':
            currentEffect = payload.effect;
            effectSettings = perEffectSettings[currentEffect] || perEffectSettings.bubbles;
            if (bubblesCanvas) initEffectParticles();
            saveSettings();
            broadcastEffectsState();
            break;
        case 'set-viz': {
            const prev = currentViz;
            currentViz = payload.visualizer;
            if (prev !== currentViz && (prev === 'waterfall' || currentViz === 'waterfall')) {
                resetWaterfall();
            }
            onVizModeChanged();
            saveSettings();
            broadcastEffectsState();
            break;
        }
        case 'set-float-art':
            applyFloatArtMode(payload.floatArtMode);
            document.querySelectorAll('.effect-btn[data-float-art]').forEach((b) => {
                b.classList.toggle('active', b.dataset.floatArt === floatArtMode);
            });
            saveSettings();
            broadcastEffectsState();
            break;
        case 'set-theme':
            applyTheme(payload.theme);
            break;
        case 'set-custom-color':
            if (payload.key && payload.value) {
                // Editing while on a preset rebases the Custom slot to that
                // preset and switches into the slot — the user keeps the
                // colors they're staring at as the starting point.
                if (currentTheme !== 'custom') {
                    customBaseTheme = PRESETS[currentTheme] ? currentTheme : 'kraken';
                    currentTheme = 'custom';
                }
                customThemeColors[payload.key] = payload.value;
            }
            // Broadcast effects state so the panel learns we switched to
            // 'custom' and rebuilds the swatch grid with the new overrides.
            // Without this, the panel's lastState.theme stays at the preset,
            // resolveOverrides() returns {}, and the next theme-apply hook
            // overwrites the just-applied swatch with the bare preset value.
            applyTheme(currentTheme);
            break;
        case 'reset-custom-colors':
            // Clear overrides. If currently on Custom, the user sees the bare
            // base preset. If on a real preset, nothing visually changes —
            // but the saved custom slot is now empty.
            customThemeColors = {};
            applyTheme(currentTheme);
            break;
        case 'set-slider': {
            const key = payload.key;
            const val = payload.value;
            if (key === 'quantity') effectSettings.quantity = val;
            else if (key === 'size') effectSettings.size = val;
            else if (key === 'speed') effectSettings.speed = val;
            perEffectSettings[currentEffect][key] = val;
            if (!isV2Docking && bubblesCanvas) initEffectParticles();
            saveSettings();
            broadcastEffectsState();
            break;
        }
        default:
            break;
    }
}

window.getVizConfigForIpc = function getVizConfigForIpc() {
    return {
        themeId: currentTheme,
        mode: currentViz,
        floatArtMode
    };
};

window.getVizAlbumArtForIpc = function getVizAlbumArtForIpc() {
    return { url: vizAlbumArtDataUrl, mode: floatArtMode };
};

function broadcastVizConfig() {
    if (!isV2Docking) return;
    ipcRenderer.send('kraken:viz:config', {
        themeId: currentTheme,
        mode: currentViz,
        floatArtMode
    });
}

function broadcastVizFrame() {
    if (!isV2Docking || !showVizPanel || currentViz === 'none' || !analyser || !dataArray) return;
    analyser.getByteFrequencyData(dataArray);
    const payload = { mode: currentViz, freq: Uint8Array.from(dataArray) };
    if (currentViz === 'wave' && timeDomainArray) {
        analyser.getByteTimeDomainData(timeDomainArray);
        payload.wave = timeDomainArray;
    }
    ipcRenderer.send('kraken:viz:frame', payload);
}

async function refreshVizAlbumArtIpc() {
    if (!isV2Docking) return;
    if (!currentAlbumArtUrl || floatArtMode === 'off') {
        vizAlbumArtDataUrl = null;
        ipcRenderer.send('kraken:viz:album-art', { url: null, mode: floatArtMode });
        return;
    }
    try {
        const resp = await fetch(currentAlbumArtUrl);
        const blob = await resp.blob();
        vizAlbumArtDataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        });
        ipcRenderer.send('kraken:viz:album-art', { url: vizAlbumArtDataUrl, mode: floatArtMode });
    } catch (err) {
        console.error('viz album art IPC:', err);
    }
}

function onVizModeChanged() {
    broadcastVizConfig();
    if (!isV2Docking) return;
    if (currentViz === 'none') {
        ipcRenderer.send('kraken:window:close-viz');
    } else {
        ipcRenderer.send('kraken:viz:ensure-visible');
    }
}

function applyDockLockState(state) {
    if (!state) return;
    applyDockStackChrome(document, 'main', state);
    document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
        const panel = btn.dataset.panel;
        if (!panel || !state[panel]) return;
        const locked = !!state[panel].locked;
        btn.classList.remove('dock-lock-pending');
        btn.classList.toggle('is-locked', locked);
        btn.classList.toggle('is-unlocked', !locked);
        if (panel === 'main') {
            btn.title = locked
                ? 'Stack grouped — click to regroup / snap all panels to main'
                : 'Panels scattered — click to regroup into one stack';
        } else {
            btn.title = locked
                ? 'Magnetically docked — click to detach (or drag away)'
                : 'Detached — drag near another panel edge to snap';
        }
    });
}

function showDockMessage(message) {
    let toast = document.getElementById('dockToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dockToast';
        toast.style.cssText = [
            'position:fixed', 'bottom:12px', 'left:50%', 'transform:translateX(-50%)',
            'padding:6px 12px', 'background:rgba(10,16,24,0.92)', 'border:1px solid var(--accent)',
            'color:var(--lcd-text)', 'font-size:10px', 'z-index:9999', 'pointer-events:none',
            'transition:opacity 0.3s', 'opacity:0'
        ].join(';');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(showDockMessage._hideTimer);
    showDockMessage._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2800);
}

function setupDockLockUI() {
    document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const panel = btn.dataset.panel || 'eq';
            if (panel === 'main') {
                ipcRenderer.send('kraken:dock:regroup');
            } else {
                ipcRenderer.send('kraken:dock:toggle', { panel });
            }
        });
    });
    ipcRenderer.on('kraken:dock:state', (_event, state) => applyDockLockState(state));
    ipcRenderer.on('kraken:dock:message', (_event, message) => showDockMessage(message));
    ipcRenderer.invoke('kraken:dock:get-state').then(applyDockLockState).catch(() => {});
}

function saveSettings() {
    localStorage.setItem('krakenMp3Settings', JSON.stringify({
        volume: volumeSlider.value,
        effect: currentEffect,
        visualizer: currentViz,
        theme: currentTheme,
        customBaseTheme,
        customThemeColors,
        perEffectSettings,
        shuffle: isShuffle,
        repeat: repeatMode,
        showEqPanel,
        showPlaylistPanel,
        showVizPanel,
        floatArtMode,
        eq: {
            enabled: eqEnabled,
            preamp: eqPreampDb,
            bands: eqBandGains,
            preset: eqPreset
        }
    }));
}

async function loadBackgrounds() {
    try {
        const bgPath = await ipcRenderer.invoke('get-backgrounds-path');
        console.log('Background path:', bgPath);
        const files = await ipcRenderer.invoke('list-backgrounds', bgPath);
        console.log('Background files:', files);
        backgroundImages = files.map(f => path.join(bgPath, f));

        if (backgroundImages.length > 0) {
            currentBgIndex = Math.floor(Math.random() * backgroundImages.length);
            setBackground(backgroundImages[currentBgIndex]);
        }
    } catch (err) {
        console.error('Error loading backgrounds:', err);
    }
}

function setBackground(imagePath, crossfade = false) {
    const url = imagePath.replace(/\\/g, '/');

    if (crossfade) {
        // Create a temporary layer for crossfade
        const tempLayer = document.createElement('div');
        tempLayer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-image: url("file:///${url}");
            background-size: cover;
            background-position: center;
            opacity: 0;
            transition: opacity 2s ease-in-out;
            z-index: 0;
            pointer-events: none;
        `;
        document.body.insertBefore(tempLayer, backgroundLayer);

        // Fade in new background — match opacity in styles.css
        requestAnimationFrame(() => {
            tempLayer.style.opacity = '0.35';
        });

        // After transition, update main layer and remove temp
        setTimeout(() => {
            backgroundLayer.style.backgroundImage = `url("file:///${url}")`;
            tempLayer.remove();
        }, 2000);
    } else {
        backgroundLayer.style.backgroundImage = `url("file:///${url}")`;
    }
}

async function rotateBackground() {
    // Refresh list to find new files
    await loadBackgrounds();

    if (backgroundImages.length <= 1) return;
    currentBgIndex = (currentBgIndex + 1) % backgroundImages.length;
    setBackground(backgroundImages[currentBgIndex], true); // Use crossfade
}

// ============================================================================
// AUDIO CONTEXT FOR VISUALIZER
// ============================================================================
function initAudioContext() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        timeDomainArray = new Uint8Array(analyser.frequencyBinCount);

        // Connect audio element to analyser (with EQ chain)
        audioSource = audioContext.createMediaElementSource(audio);
        eqPreampNode = audioContext.createGain();
        eqFilters = eqFrequencies.map((frequency) => {
            const filter = audioContext.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = frequency;
            filter.Q.value = 1;
            filter.gain.value = 0;
            return filter;
        });

        audioSource.connect(eqPreampNode);
        let currentNode = eqPreampNode;
        eqFilters.forEach((filter) => {
            currentNode.connect(filter);
            currentNode = filter;
        });
        // Stereo panner (balance control)
        stereoPannerNode = audioContext.createStereoPanner();
        stereoPannerNode.pan.value = 0;
        currentNode.connect(stereoPannerNode);
        stereoPannerNode.connect(analyser);
        analyser.connect(audioContext.destination);

        applyEqSettings();

        console.log('Audio context initialized for visualizer');
    } catch (err) {
        console.error('Error initializing audio context:', err);
    }
}

// ============================================================================
// CANVAS SETUP
// ============================================================================
function initCanvases() {
    if (miniVizCanvas) miniVizCtx = miniVizCanvas.getContext('2d');
    if (isV2Docking) return;
    if (!bubblesCanvas || !particlesCanvas) return;
    bubblesCtx = bubblesCanvas.getContext('2d');
    particlesCtx = particlesCanvas.getContext('2d');
    if (visualizerCanvas) visualizerCtx = visualizerCanvas.getContext('2d');

    resizeCanvases();
    initEffectParticles();

    console.log('Canvases initialized. Size:', bubblesCanvas.width, 'x', bubblesCanvas.height);
}

function resizeCanvases() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (bubblesCanvas) {
        bubblesCanvas.width = width;
        bubblesCanvas.height = height;
    }
    if (particlesCanvas) {
        particlesCanvas.width = width;
        particlesCanvas.height = height;
    }
    if (visualizerCanvas) {
        visualizerCanvas.width = width;
        visualizerCanvas.height = height;
    }
}

function initEffectParticles() {
    effectParticles = [];
    if (!bubblesCanvas && !isV2Docking) return;
    const count = effectSettings.quantity;

    for (let i = 0; i < count; i++) {
        effectParticles.push(createEffectParticle(true));
    }
}

// ============================================================================
// PARTICLE EFFECT CREATORS
// Slider ranges: quantity 5-100, size 1-20, speed 1-100
// We scale these so middle values (50) feel natural
// ============================================================================
function createEffectParticle(randomY = false) {
    const canvas = bubblesCanvas || { width: 500, height: 600 };
    // Scale settings so slider middle (50) feels right
    const sizeScale = effectSettings.size / 10;      // 0.1 to 2.0
    const speedScale = effectSettings.speed / 50;    // 0.02 to 2.0

    switch (currentEffect) {
        case 'bubbles':
            return {
                x: Math.random() * canvas.width,
                y: randomY ? Math.random() * canvas.height : canvas.height + 20,
                size: (Math.random() * 8 + 4) * sizeScale,
                speed: (Math.random() * 20 + 15) * speedScale,
                wobbleSpeed: Math.random() * 2 + 1,
                wobbleAmp: Math.random() * 25 + 10,
                wobbleOffset: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.4 + 0.2
            };

        case 'rain':
            return {
                x: Math.random() * canvas.width,
                y: randomY ? Math.random() * canvas.height : -20,
                length: (Math.random() * 15 + 10) * sizeScale,
                speed: (Math.random() * 300 + 200) * speedScale,
                opacity: Math.random() * 0.5 + 0.3
            };

        case 'stars':
            // Shooting stars - spawn from edges, travel toward center
            // Like kraken-radio implementation
            const buffer = 50;
            const skyHeight = canvas.height * 0.7;  // Top 70% only
            let startX, startY;
            const side = Math.floor(Math.random() * 3);

            switch (side) {
                case 0: startX = Math.random() * canvas.width; startY = -buffer; break;  // Top
                case 1: startX = -buffer; startY = Math.random() * skyHeight; break;     // Left
                case 2: startX = canvas.width + buffer; startY = Math.random() * skyHeight; break; // Right
            }

            // Calculate velocity toward center
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const dx = centerX - startX;
            const dy = centerY - startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const duration = 0.6 + Math.random() * 0.4;  // 0.6-1.0 seconds
            const pixelsPerFrame = distance / (duration * 60);
            const starVx = (dx / distance) * pixelsPerFrame * speedScale;
            const starVy = (dy / distance) * pixelsPerFrame * speedScale;

            return {
                x: startX,
                y: startY,
                vx: starVx,
                vy: starVy,
                tailLength: 60 + Math.random() * 80,
                life: Math.ceil(distance / pixelsPerFrame) + 25,
                maxLife: Math.ceil(distance / pixelsPerFrame) + 25,
                brightness: 0.8 + Math.random() * 0.2,
                size: (1 + Math.random()) * sizeScale
            };

        case 'embers':
            // Slow rising glowing embers
            return {
                x: Math.random() * canvas.width,
                y: randomY ? Math.random() * canvas.height : canvas.height + 20,
                size: (Math.random() * 2 + 1) * sizeScale,
                speed: (Math.random() * 8 + 5) * speedScale,  // Much slower
                wobbleSpeed: Math.random() * 1.5 + 0.5,
                wobbleAmp: Math.random() * 20 + 10,
                wobbleOffset: Math.random() * Math.PI * 2,
                hue: Math.random() * 40 + 10, // Orange-red
                life: 1,
                decay: 0.0003 + Math.random() * 0.0003  // Very slow fade
            };

        case 'dust':
            // Gentle floating dust motes
            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: (Math.random() * 1.5 + 0.5) * sizeScale,
                vx: (Math.random() - 0.5) * 6 * speedScale,  // Faster drift
                vy: (Math.random() - 0.5) * 4 * speedScale,
                wobbleSpeed: Math.random() * 0.3 + 0.1,
                wobbleOffset: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.2 + 0.05
            };

        case 'snow':
            // Snowflakes with 6-point star shape
            return {
                x: Math.random() * canvas.width,
                y: randomY ? Math.random() * canvas.height : -20,
                size: (Math.random() * 3 + 2) * sizeScale,
                speed: (Math.random() * 15 + 10) * speedScale,  // Gentle fall
                wobbleSpeed: Math.random() * 1.5 + 0.5,
                wobbleAmp: Math.random() * 20 + 10,
                wobbleOffset: Math.random() * Math.PI * 2,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.5,
                opacity: Math.random() * 0.6 + 0.4
            };

        case 'fireflies':
            // Fireflies with proper on/off glow cycle
            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: (Math.random() * 2 + 1) * sizeScale,
                vx: (Math.random() - 0.5) * 5 * speedScale,
                vy: (Math.random() - 0.5) * 5 * speedScale,
                targetX: Math.random() * canvas.width,
                targetY: Math.random() * canvas.height,
                glowPhase: Math.random() * Math.PI * 2,
                glowSpeed: Math.random() * 0.8 + 0.3,  // Slower glow cycle
                glowOn: Math.random() > 0.5,  // Start on or off
                glowTimer: Math.random() * 3  // Time until next toggle
            };

        default:
            return null;
    }
}

// ============================================================================
// FLOATING ALBUM ART
// ============================================================================
function revokeAlbumArtUrl() {
    if (currentAlbumArtUrl) {
        URL.revokeObjectURL(currentAlbumArtUrl);
        currentAlbumArtUrl = null;
    }
}

function applyFloatArtMode(mode) {
    floatArtMode = mode;
    if (isV2Docking) {
        refreshVizAlbumArtIpc();
        return;
    }
    if (!floatingAlbumStage) return;

    floatingAlbumStage.classList.remove('mode-float', 'mode-bounce', 'active');
    if (mode === 'float') {
        floatingAlbumStage.classList.add('mode-float');
    } else if (mode === 'bounce') {
        floatingAlbumStage.classList.add('mode-bounce');
    }

    syncFloatingAlbumArt();
}

function syncFloatingAlbumArt() {
    if (isV2Docking) {
        refreshVizAlbumArtIpc();
        return;
    }
    if (!floatingAlbumStage || !floatingAlbumImg) return;

    const show = floatArtMode !== 'off' && !!currentAlbumArtUrl;
    floatingAlbumStage.classList.toggle('active', show);
    floatingAlbumStage.setAttribute('aria-hidden', show ? 'false' : 'true');

    if (!show) {
        floatingAlbumImg.removeAttribute('src');
        if (floatingAlbum) floatingAlbum.style.transform = '';
        return;
    }

    floatingAlbumImg.src = currentAlbumArtUrl;
    if (floatArtMode === 'bounce') {
        resetFloatArtBounce();
    } else if (floatingAlbum) {
        floatingAlbum.style.transform = '';
    }
}

function resetFloatArtBounce() {
    const body = floatingAlbumStage?.parentElement;
    if (!body) return;
    const maxX = Math.max(0, body.clientWidth - FLOAT_ART_SIZE);
    const maxY = Math.max(0, body.clientHeight - FLOAT_ART_SIZE);
    albumArtBounce.x = maxX * 0.5;
    albumArtBounce.y = maxY * 0.5;
    albumArtBounce.vx = (Math.random() > 0.5 ? 1 : -1) * (70 + Math.random() * 40);
    albumArtBounce.vy = (Math.random() > 0.5 ? 1 : -1) * (55 + Math.random() * 35);
    albumArtBounce.vRotZ = (Math.random() - 0.5) * 55;
    albumArtBounce.rotZ = 0;
    albumArtBounce.lastTime = 0;
}

function tickFloatArtBounce() {
    if (floatArtMode !== 'bounce' || !floatingAlbumStage?.classList.contains('active') || !floatingAlbum) {
        return;
    }
    if (prefersReducedMotion) return;

    const body = floatingAlbumStage.parentElement;
    if (!body) return;

    const now = performance.now() / 1000;
    const dt = albumArtBounce.lastTime
        ? Math.min(now - albumArtBounce.lastTime, 0.05)
        : 0.016;
    albumArtBounce.lastTime = now;

    const maxX = Math.max(0, body.clientWidth - FLOAT_ART_SIZE);
    const maxY = Math.max(0, body.clientHeight - FLOAT_ART_SIZE);
    const b = albumArtBounce;

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rotZ += b.vRotZ * dt;

    if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); b.vRotZ *= -1; }
    else if (b.x >= maxX) { b.x = maxX; b.vx = -Math.abs(b.vx); b.vRotZ *= -1; }
    if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); }
    else if (b.y >= maxY) { b.y = maxY; b.vy = -Math.abs(b.vy); }

    floatingAlbum.style.transform =
        `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.rotZ}deg)`;
}

function setAlbumArtFromPicture(pic) {
    revokeAlbumArtUrl();
    const blob = new Blob([pic.data], { type: pic.format });
    currentAlbumArtUrl = URL.createObjectURL(blob);
    albumArt.innerHTML = `<img src="${currentAlbumArtUrl}" alt="Album Art">`;
    syncFloatingAlbumArt();
}

// ============================================================================
// ANIMATION LOOP
// ============================================================================
let lastTime = 0;
function animationLoop(time = 0) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    // Clear canvases
    if (bubblesCtx) {
        bubblesCtx.clearRect(0, 0, bubblesCanvas.width, bubblesCanvas.height);
    }
    if (particlesCtx) {
        particlesCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);
    }
    if (visualizerCtx) {
        visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    }

    // Draw effect particles (legacy single-window only; v2 uses overlay — Phase 3)
    if (!isV2Docking) {
        if (currentEffect !== 'none') {
            drawEffectParticles(dt, time);
        }
        drawBurstParticles(dt);
    }

    // Draw visualizer (v2 uses satellite window)
    if (isV2Docking) {
        broadcastVizFrame();
    } else if (currentViz !== 'none' && analyser) {
        drawVisualizer();
    }

    // Draw mini visualizer in main display
    if (miniVizCtx && analyser) {
        drawMiniViz();
    }

    if (!isV2Docking) tickFloatArtBounce();

    requestAnimationFrame(animationLoop);
}

// ============================================================================
// EFFECT PARTICLE DRAWING
// ============================================================================
function drawEffectParticles(dt, time) {
    if (!bubblesCtx) return;

    const canvas = bubblesCanvas;
    const now = time / 1000;

    for (let i = effectParticles.length - 1; i >= 0; i--) {
        const p = effectParticles[i];
        if (!p) continue;

        switch (currentEffect) {
            case 'bubbles':
                drawBubble(p, now, canvas, i);
                break;
            case 'rain':
                drawRain(p, dt, canvas, i);
                break;
            case 'stars':
                drawShootingStar(p, dt, canvas, i);
                break;
            case 'embers':
                drawEmber(p, dt, now, canvas, i);
                break;
            case 'dust':
                drawDust(p, dt, now, canvas, i);
                break;
            case 'snow':
                drawSnow(p, dt, now, canvas, i);
                break;
            case 'fireflies':
                drawFirefly(p, dt, now, canvas, i);
                break;
        }
    }

    // Maintain particle count
    // Stars spawn rarely and occasionally, not constantly (like kraken-radio)
    if (currentEffect === 'stars') {
        // Very rare spawn - 0.3% chance per frame, scaled by quantity setting
        const spawnChance = 0.003 * (effectSettings.quantity / 50);
        if (Math.random() < spawnChance) {
            effectParticles.push(createEffectParticle(false));
        }
    } else {
        while (effectParticles.length < effectSettings.quantity) {
            effectParticles.push(createEffectParticle(false));
        }
    }
}

function drawBubble(p, now, canvas, index) {
    p.y -= p.speed * 0.016;
    const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * 0.016;
    p.x += wobble;

    // Draw bubble body
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

    const gradient = bubblesCtx.createRadialGradient(
        p.x - p.size * 0.3, p.y - p.size * 0.3, 0,
        p.x, p.y, p.size
    );
    const [hr, hg, hb] = activeThemeColors.bubbleHighRgb;
    const [ar, ag, ab] = activeThemeColors.accentRgb;
    gradient.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${p.opacity})`);
    gradient.addColorStop(0.5, `rgba(${ar}, ${ag}, ${ab}, ${p.opacity * 0.5})`);
    gradient.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, ${p.opacity * 0.1})`);

    bubblesCtx.fillStyle = gradient;
    bubblesCtx.fill();

    // Shine highlight
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.7})`;
    bubblesCtx.fill();

    // Reset if off screen
    if (p.y + p.size < -10) {
        effectParticles[index] = createEffectParticle(false);
    }
}

function drawRain(p, dt, canvas, index) {
    p.y += p.speed * dt;

    bubblesCtx.beginPath();
    bubblesCtx.moveTo(p.x, p.y);
    bubblesCtx.lineTo(p.x + 1, p.y + p.length);
    const [rr, rg, rb] = activeThemeColors.rainRgb;
    bubblesCtx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${p.opacity})`;
    bubblesCtx.lineWidth = 1;
    bubblesCtx.stroke();

    if (p.y > canvas.height + p.length) {
        effectParticles[index] = createEffectParticle(false);
    }
}

function drawShootingStar(p, dt, canvas, index) {
    // Move the star
    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    // Remove if off screen or life expired
    if (p.life <= 0 || p.x < -300 || p.x > canvas.width + 300 ||
        p.y < -300 || p.y > canvas.height + 300) {
        effectParticles.splice(index, 1);
        return;
    }

    // Calculate alpha based on remaining life
    const alpha = p.life / p.maxLife;

    // Draw the streak (like kraken-radio)
    bubblesCtx.strokeStyle = `rgba(255, 255, 255, ${alpha * p.brightness})`;
    bubblesCtx.lineWidth = 2 + alpha;
    bubblesCtx.lineCap = 'round';

    bubblesCtx.beginPath();
    bubblesCtx.moveTo(p.x, p.y);

    // Calculate tail end point
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const tailScale = p.tailLength / speed;
    const tailX = p.x - p.vx * tailScale;
    const tailY = p.y - p.vy * tailScale;

    bubblesCtx.lineTo(tailX, tailY);
    bubblesCtx.stroke();
}

function drawEmber(p, dt, now, canvas, index) {
    // Slow gentle rise
    p.y -= p.speed * dt;
    const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * dt * 0.5;
    p.x += wobble;
    p.life -= p.decay;

    if (p.life <= 0 || p.y < -20) {
        effectParticles[index] = createEffectParticle(false);
        return;
    }

    // Flickering glow effect
    const flicker = 0.6 + Math.sin(now * 8 + p.wobbleOffset) * 0.2 + Math.sin(now * 13 + p.wobbleOffset * 2) * 0.2;

    // Outer soft glow
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `hsla(${p.hue}, 100%, 50%, ${p.life * flicker * 0.15})`;
    bubblesCtx.fill();

    // Middle glow
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `hsla(${p.hue + 10}, 100%, 60%, ${p.life * flicker * 0.4})`;
    bubblesCtx.fill();

    // Hot core
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `hsla(${p.hue + 30}, 100%, 85%, ${p.life * flicker})`;
    bubblesCtx.fill();
}

function drawDust(p, dt, now, canvas, index) {
    // Very gentle floating motion
    const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset);
    p.x += (p.vx + wobble * 2) * dt;
    p.y += (p.vy + wobble * 1) * dt;

    // Wrap around screen
    if (p.x < -10) p.x = canvas.width + 10;
    if (p.x > canvas.width + 10) p.x = -10;
    if (p.y < -10) p.y = canvas.height + 10;
    if (p.y > canvas.height + 10) p.y = -10;

    // Subtle opacity variation
    const fadeVar = 0.8 + Math.sin(now * 0.5 + p.wobbleOffset) * 0.2;

    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(220, 215, 200, ${p.opacity * fadeVar})`;
    bubblesCtx.fill();
}

function drawSnow(p, dt, now, canvas, index) {
    // Gentle falling
    p.y += p.speed * dt;
    const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * dt * 0.3;
    p.x += wobble;
    p.rotation += p.rotationSpeed * dt;

    if (p.y > canvas.height + p.size) {
        effectParticles[index] = createEffectParticle(false);
        return;
    }

    // Draw 6-point snowflake
    bubblesCtx.save();
    bubblesCtx.translate(p.x, p.y);
    bubblesCtx.rotate(p.rotation);
    bubblesCtx.strokeStyle = `rgba(255, 255, 255, ${p.opacity})`;
    bubblesCtx.lineWidth = p.size * 0.15;
    bubblesCtx.lineCap = 'round';

    // Draw 6 arms
    for (let i = 0; i < 6; i++) {
        bubblesCtx.save();
        bubblesCtx.rotate((i * Math.PI) / 3);

        // Main arm
        bubblesCtx.beginPath();
        bubblesCtx.moveTo(0, 0);
        bubblesCtx.lineTo(0, -p.size);
        bubblesCtx.stroke();

        // Small branches on each arm
        bubblesCtx.beginPath();
        bubblesCtx.moveTo(0, -p.size * 0.4);
        bubblesCtx.lineTo(p.size * 0.25, -p.size * 0.6);
        bubblesCtx.moveTo(0, -p.size * 0.4);
        bubblesCtx.lineTo(-p.size * 0.25, -p.size * 0.6);
        bubblesCtx.stroke();

        bubblesCtx.restore();
    }

    // Center dot
    bubblesCtx.beginPath();
    bubblesCtx.arc(0, 0, p.size * 0.1, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
    bubblesCtx.fill();

    bubblesCtx.restore();
}

function drawFirefly(p, dt, now, canvas, index) {
    // Slow gentle movement toward target
    const dx = p.targetX - p.x;
    const dy = p.targetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 30) {
        // Pick new target - lazy wandering
        p.targetX = Math.random() * canvas.width;
        p.targetY = Math.random() * canvas.height;
    }

    // Very gentle movement
    p.vx += (dx / dist) * 5 * dt;
    p.vy += (dy / dist) * 5 * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    p.x += p.vx * dt * 20;
    p.y += p.vy * dt * 20;

    // Update glow timer for on/off cycle
    p.glowTimer -= dt;
    if (p.glowTimer <= 0) {
        p.glowOn = !p.glowOn;
        // Random time until next toggle (1-4 seconds)
        p.glowTimer = 1 + Math.random() * 3;
    }

    // Smooth fade transition between on and off
    if (!p.glowIntensity) p.glowIntensity = p.glowOn ? 1 : 0;
    const targetIntensity = p.glowOn ? 1 : 0;
    p.glowIntensity += (targetIntensity - p.glowIntensity) * dt * 3; // Smooth fade

    // Only draw if there's some glow
    if (p.glowIntensity < 0.02) return;

    const glow = p.glowIntensity;

    // Outer soft glow (yellow-green)
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(180, 255, 80, ${glow * 0.1})`;
    bubblesCtx.fill();

    // Middle glow
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(200, 255, 120, ${glow * 0.3})`;
    bubblesCtx.fill();

    // Bright core
    bubblesCtx.beginPath();
    bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    bubblesCtx.fillStyle = `rgba(255, 255, 180, ${glow * 0.9})`;
    bubblesCtx.fill();
}

// ============================================================================
// BURST PARTICLES (for track changes)
// ============================================================================
function createBurstParticle(x, y) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 200 + 80;
    const hue = activeThemeColors.hueBase + Math.random() * activeThemeColors.hueRange;
    return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 5 + 2,
        color: `hsl(${hue}, 80%, 60%)`,
        life: 1,
        decay: Math.random() * 0.015 + 0.01
    };
}

function triggerTrackChangeEffect() {
    if (isV2Docking) {
        ipcRenderer.send('kraken:effects:burst');
        return;
    }
    if (!particlesCanvas) return;
    const centerX = particlesCanvas.width / 2;
    const centerY = particlesCanvas.height / 2;

    for (let i = 0; i < 40; i++) {
        burstParticles.push(createBurstParticle(centerX, centerY));
    }
}

function drawBurstParticles(dt) {
    if (!particlesCtx) return;

    for (let i = burstParticles.length - 1; i >= 0; i--) {
        const p = burstParticles[i];

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 80 * dt;
        p.vx *= 0.98;
        p.life -= p.decay;

        if (p.life <= 0) {
            burstParticles.splice(i, 1);
            continue;
        }

        particlesCtx.beginPath();
        particlesCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        particlesCtx.fillStyle = p.color.replace('hsl', 'hsla').replace(')', `, ${p.life})`);
        particlesCtx.fill();
    }
}

// ============================================================================
// AUDIO VISUALIZERS
// ============================================================================
function drawVisualizer() {
    if (!visualizerCtx || !analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);
    const canvas = visualizerCanvas;
    const ctx = visualizerCtx;
    const theme = activeThemeColors;

    if (currentViz === 'wave' && timeDomainArray) {
        analyser.getByteTimeDomainData(timeDomainArray);
        if (currentViz !== 'waterfall') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        drawVisualizerMode(ctx, canvas, currentViz, dataArray, timeDomainArray, theme);
        return;
    }

    if (currentViz !== 'waterfall') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawVisualizerMode(ctx, canvas, currentViz, dataArray, null, theme);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
    // Window controls
    btnMinimize.addEventListener('click', () => ipcRenderer.send('minimize-window'));
    btnClose.addEventListener('click', () => ipcRenderer.send('close-window'));
    btnAlwaysOnTop.addEventListener('click', () => {
        btnAlwaysOnTop.classList.toggle('active');
        ipcRenderer.send('toggle-always-on-top', btnAlwaysOnTop.classList.contains('active'));
    });

    // Playback controls
    btnPlay.addEventListener('click', togglePlay);
    btnPrev.addEventListener('click', playPrevious);
    btnNext.addEventListener('click', playNext);
    btnShuffle.addEventListener('click', toggleShuffle);
    btnRepeat.addEventListener('click', toggleRepeat);

    // Volume
    btnMute.addEventListener('click', toggleMute);
    volumeSlider.addEventListener('input', handleVolumeChange);

    // Open files
    btnOpen.addEventListener('click', openFileMenu);

    // Effects menu (v2 opens satellite window via IPC)
    if (btnEffects) btnEffects.addEventListener('click', toggleEffectsMenu);

    if (!isV2Docking) {
    // Effect buttons - switch to per-effect settings when changing effects
    document.querySelectorAll('.effect-btn[data-effect]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentEffect = btn.dataset.effect;
            document.querySelectorAll('.effect-btn[data-effect]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Switch to this effect's saved settings
            effectSettings = perEffectSettings[currentEffect] || perEffectSettings.bubbles;
            updateSlidersForCurrentEffect();

            initEffectParticles();
            saveSettings();
        });
    });

    // Visualizer buttons
    document.querySelectorAll('.effect-btn[data-viz]').forEach(btn => {
        btn.addEventListener('click', () => {
            const prev = currentViz;
            currentViz = btn.dataset.viz;
            if (prev !== currentViz && (prev === 'waterfall' || currentViz === 'waterfall')) {
                resetWaterfall();
            }
            document.querySelectorAll('.effect-btn[data-viz]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onVizModeChanged();
            saveSettings();
        });
    });

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
        });
    });

    // Floating album art
    document.querySelectorAll('.effect-btn[data-float-art]').forEach(btn => {
        btn.addEventListener('click', () => {
            applyFloatArtMode(btn.dataset.floatArt);
            document.querySelectorAll('.effect-btn[data-float-art]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            saveSettings();
        });
    });

    if (plBtnMisc) {
        plBtnMisc.addEventListener('click', () => {
            if (isV2Docking) {
                ipcRenderer.send('kraken:window:toggle-effects');
            } else if (effectsMenu) {
                effectsMenu.classList.add('active');
                btnEffects.classList.add('active');
            }
        });
    }

    // Effect sliders - update current effect's settings and save to perEffectSettings
    effectQuantitySlider.addEventListener('input', () => {
        const val = parseInt(effectQuantitySlider.value);
        effectSettings.quantity = val;
        perEffectSettings[currentEffect].quantity = val;
        effectQuantityVal.textContent = val;
        initEffectParticles();
        saveSettings();
    });

    effectSizeSlider.addEventListener('input', () => {
        const val = parseInt(effectSizeSlider.value);
        effectSettings.size = val;
        perEffectSettings[currentEffect].size = val;
        effectSizeVal.textContent = val;
        initEffectParticles();
        saveSettings();
    });

    effectSpeedSlider.addEventListener('input', () => {
        const val = parseInt(effectSpeedSlider.value);
        effectSettings.speed = val;
        perEffectSettings[currentEffect].speed = val;
        effectSpeedVal.textContent = val;
        initEffectParticles();
        saveSettings();
    });

    // Graphic EQ (embedded panel — legacy mode only)
    if (!isV2Docking && eqToggle) {
        eqToggle.addEventListener('click', () => {
            eqEnabled = !eqEnabled;
            updateEqUI();
            applyEqSettings();
            saveSettings();
        });

        eqReset.addEventListener('click', () => {
            setEqPreset('flat');
        });

        eqPresetSelect.addEventListener('change', () => {
            const presetName = eqPresetSelect.value;
            if (presetName === 'custom') {
                markEqCustom();
                saveSettings();
                return;
            }
            setEqPreset(presetName);
        });

        eqPreampSlider.addEventListener('input', () => {
            eqPreampDb = parseFloat(eqPreampSlider.value);
            eqPreampVal.textContent = `${eqPreampDb} dB`;
            markEqCustom();
            applyEqSettings();
            saveSettings();
        });

        eqBandSliders.forEach((slider) => {
            slider.addEventListener('input', () => {
                const bandIndex = parseInt(slider.dataset.band, 10);
                eqBandGains[bandIndex] = parseFloat(slider.value);
                markEqCustom();
                applyEqSettings();
                saveSettings();
            });
        });
    }

    // Close effects menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#effectsMenu') && !e.target.closest('#btnEffects')) {
            effectsMenu.classList.remove('active');
            btnEffects.classList.remove('active');
        }
    });
    }

    // Progress bar
    progressContainer.addEventListener('click', handleProgressClick);
    progressContainer.addEventListener('mousedown', startProgressDrag);
    document.addEventListener('mousemove', handleProgressDrag);
    document.addEventListener('mouseup', endProgressDrag);

    // Audio events
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleTrackEnd);
    audio.addEventListener('loadedmetadata', handleMetadataLoaded);
    audio.addEventListener('play', () => {
        updatePlayButton(true);
        // Resume audio context if suspended
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });
    audio.addEventListener('pause', () => updatePlayButton(false));

    // Drag and drop
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropOverlay.classList.add('active');
    });

    document.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === dropOverlay) {
            dropOverlay.classList.remove('active');
        }
    });

    document.addEventListener('drop', handleDrop);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // IPC: file opened from command line or file association
    ipcRenderer.on('file-opened', (event, filePath) => {
        replacePlaylist([filePath]);
    });

    // Double-click display area to open files
    const dispCenter = document.querySelector('.disp-center');
    if (dispCenter) dispCenter.addEventListener('dblclick', openFileMenu);

    // Stop button
    btnStop.addEventListener('click', stopAudio);

    // Balance slider
    if (balanceSlider) {
        balanceSlider.addEventListener('input', () => {
            if (stereoPannerNode) {
                stereoPannerNode.pan.value = balanceSlider.value / 100;
            }
            updateBalanceIndicator();
        });
        // Center on double-click
        balanceSlider.addEventListener('dblclick', () => {
            balanceSlider.value = 0;
            if (stereoPannerNode) stereoPannerNode.pan.value = 0;
            updateBalanceIndicator();
        });
        updateBalanceIndicator();
    }

    // Time mode toggle (elapsed / remaining)
    if (timeModeBtn) {
        timeModeBtn.addEventListener('click', () => {
            showRemainingTime = !showRemainingTime;
            timeModeBtn.textContent = showRemainingTime ? '−' : '+';
        });
    }

    // EQ panel toggle (title bar button)
    if (btnEqToggle) {
        btnEqToggle.addEventListener('click', () => {
            if (isV2Docking) {
                showEqPanel = !showEqPanel;
                ipcRenderer.send('kraken:window:toggle-eq');
                btnEqToggle.classList.toggle('active', showEqPanel);
                saveSettings();
                return;
            }
            showEqPanel = !showEqPanel;
            applyPanelVisibility();
            saveSettings();
        });
    }
    if (btnEqClose && !isV2Docking) {
        btnEqClose.addEventListener('click', () => {
            showEqPanel = false;
            applyPanelVisibility();
            saveSettings();
        });
    }

    // Playlist panel toggle
    if (btnPlToggle) {
        btnPlToggle.addEventListener('click', () => {
            if (isV2Docking) {
                ipcRenderer.send('kraken:window:toggle-playlist');
                return;
            }
            showPlaylistPanel = !showPlaylistPanel;
            applyPanelVisibility();
            saveSettings();
        });
    }
    if (btnVizToggle) {
        btnVizToggle.addEventListener('click', () => {
            if (isV2Docking) {
                ipcRenderer.send('kraken:window:toggle-viz');
                return;
            }
        });
    }
    if (btnPlClose && !isV2Docking) {
        btnPlClose.addEventListener('click', () => {
            showPlaylistPanel = false;
            applyPanelVisibility();
            saveSettings();
        });
    }

    // Playlist footer buttons
    if (plBtnAdd) plBtnAdd.addEventListener('click', openFiles);
    if (plBtnFolder) plBtnFolder.addEventListener('click', openFolder);
    if (plBtnClear) plBtnClear.addEventListener('click', () => {
        playlist = []; playlistMeta = []; currentIndex = 0; selectedPlaylistIdx = -1;
        stopAudio(); renderPlaylist();
        totalTimeEl.textContent = '0:00';
        currentTimeEl.textContent = '0:00';
        if (plCurrentTime) plCurrentTime.textContent = '0:00';
        stopTicker();
    });
    if (plBtnRem) plBtnRem.addEventListener('click', () => {
        if (selectedPlaylistIdx >= 0 && playlist.length > 0) {
            playlist.splice(selectedPlaylistIdx, 1);
            playlistMeta.splice(selectedPlaylistIdx, 1);
            if (currentIndex >= selectedPlaylistIdx && currentIndex > 0) currentIndex--;
            selectedPlaylistIdx = Math.min(selectedPlaylistIdx, playlist.length - 1);
            renderPlaylist();
        }
    });
    if (plBtnSel) plBtnSel.addEventListener('click', () => {
        document.querySelectorAll('.pl-track').forEach(el => el.classList.add('pl-selected'));
    });

    // Window resize
    window.addEventListener('resize', resizeCanvases);
}

function toggleEffectsMenu() {
    if (isV2Docking) {
        ipcRenderer.send('kraken:window:toggle-effects');
        return;
    }
    if (!effectsMenu) return;
    effectsMenu.classList.toggle('active');
    btnEffects.classList.toggle('active', effectsMenu.classList.contains('active'));
}

// ============================================================================
// FILE MENU (Files or Folder)
// ============================================================================
async function openFileMenu() {
    // Create a simple context menu choice
    const choice = await showFileMenuDialog();
    if (choice === 'files') {
        await openFiles();
    } else if (choice === 'folder') {
        await openFolder();
    }
}

function showFileMenuDialog() {
    return new Promise((resolve) => {
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--panel-bg);
            border: 1px solid var(--accent);
            padding: 20px;
            text-align: center;
        `;

        dialog.innerHTML = `
            <div style="color: var(--accent-bright); font-size: 12px; margin-bottom: 15px; letter-spacing: 1px; text-transform: uppercase;">Open Music</div>
            <button id="openFilesBtn" style="
                padding: 8px 18px; margin: 4px;
                background: var(--btn-bg);
                border-top: 1px solid var(--bevel-light); border-left: 1px solid var(--bevel-light);
                border-bottom: 1px solid var(--bevel-dark); border-right: 1px solid var(--bevel-dark);
                color: var(--text-hi); font-size: 11px; cursor: pointer;
            ">Select Files</button>
            <button id="openFolderBtn" style="
                padding: 8px 18px; margin: 4px;
                background: var(--btn-bg);
                border-top: 1px solid var(--bevel-light); border-left: 1px solid var(--bevel-light);
                border-bottom: 1px solid var(--bevel-dark); border-right: 1px solid var(--bevel-dark);
                color: var(--text-hi); font-size: 11px; cursor: pointer;
            ">Select Folder</button>
            <button id="cancelBtn" style="
                display: block; margin: 12px auto 0; padding: 4px 12px;
                background: transparent; border: none;
                color: var(--text-lo); font-size: 10px; cursor: pointer;
            ">Cancel</button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        dialog.querySelector('#openFilesBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve('files');
        });

        dialog.querySelector('#openFolderBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve('folder');
        });

        dialog.querySelector('#cancelBtn').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(null);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });
    });
}

// ============================================================================
// PLAYBACK
// ============================================================================
function togglePlay() {
    if (playlist.length === 0) {
        openFileMenu();
        return;
    }

    if (isPlaying) {
        pause();
    } else {
        play();
    }
}

async function play() {
    try {
        await audio.play();
        isPlaying = true;
        updatePlayButton(true);
    } catch (err) {
        isPlaying = false;
        updatePlayButton(false);
        console.error('Unable to start playback:', err);
    }
}

function pause() {
    audio.pause();
    isPlaying = false;
    updatePlayButton(false);
}

function updatePlayButton(playing) {
    playIcon.style.display = playing ? 'none' : 'block';
    pauseIcon.style.display = playing ? 'block' : 'none';
}

function playPrevious() {
    if (playlist.length === 0) return;

    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    if (isShuffle) {
        currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    }

    loadTrack(currentIndex);
    play();
}

function playNext() {
    if (playlist.length === 0) return;

    if (isShuffle) {
        currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
        currentIndex = (currentIndex + 1) % playlist.length;
    }

    loadTrack(currentIndex);
    play();
}

function handleTrackEnd() {
    if (repeatMode === 2) {
        audio.currentTime = 0;
        play();
    } else if (currentIndex < playlist.length - 1 || repeatMode === 1) {
        playNext();
    } else {
        isPlaying = false;
        updatePlayButton(false);
    }
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle('active', isShuffle);
    saveSettings();
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    btnRepeat.classList.toggle('active', repeatMode > 0);

    // repeat-one: highlight in bright teal
    if (repeatMode === 2) {
        btnRepeat.style.color = 'var(--lcd-text)';
        btnRepeat.title = 'Repeat One (R)';
    } else if (repeatMode === 1) {
        btnRepeat.style.color = '';
        btnRepeat.title = 'Repeat All (R)';
    } else {
        btnRepeat.style.color = '';
        btnRepeat.title = 'Repeat Off (R)';
    }

    saveSettings();
}

// ============================================================================
// VOLUME
// ============================================================================
function handleVolumeChange() {
    audio.volume = volumeSlider.value / 100;
    updateVolumeSlider();

    if (audio.muted && volumeSlider.value > 0) {
        audio.muted = false;
        updateMuteButton(false);
    }

    saveSettings();
}

function updateVolumeSlider() {
    volumeSlider.style.setProperty('--vol-pct', volumeSlider.value + '%');
    if (volValue) volValue.textContent = volumeSlider.value + '%';
}

function updateBalanceIndicator() {
    if (!balValue) return;
    const val = parseInt(balanceSlider.value);
    if (val === 0) {
        balValue.textContent = 'C';
    } else if (val < 0) {
        balValue.textContent = 'L' + Math.abs(val);
    } else {
        balValue.textContent = 'R' + val;
    }
}

// ============================================================================
// COLOR THEMES
// ============================================================================
/**
 * Apply a theme. Presets paint cleanly (no custom-color overlay). The
 * synthetic 'custom' theme paints PRESETS[customBaseTheme] + customThemeColors
 * so the user's saved palette is its own slot, restored by clicking Custom.
 */
function applyTheme(themeId, options = {}) {
    const isCustom = themeId === 'custom';
    const baseId = isCustom ? (PRESETS[customBaseTheme] ? customBaseTheme : 'kraken') : themeId;
    const preset = PRESETS[baseId];
    if (!preset) return;
    const overrides = isCustom ? customThemeColors : {};

    currentTheme = themeId;
    const payload = buildThemePayload(baseId, overrides);
    // Tag the payload with the user-facing theme id ('custom' or a preset) so
    // satellite panels can highlight the right theme button.
    payload.themeId = themeId;

    activeThemeColors = {
        hueBase: preset.hueBase,
        hueRange: preset.hueRange,
        saturation: preset.saturation,
        accentRgb: [...preset.accentRgb],
        bubbleHighRgb: [...preset.bubbleHighRgb],
        rainRgb: [...preset.rainRgb],
        css: payload.css
    };

    applyThemePayload(document, payload);

    document.querySelectorAll('.theme-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.theme === themeId);
    });

    broadcastVizConfig();
    if (options.broadcast !== false) {
        if (options.broadcastEffects !== false) {
            broadcastEffectsState();
        }
        if (isV2Docking) {
            ipcRenderer.send('kraken:theme:broadcast', payload);
        }
    }
    saveSettings();
}

function toggleMute() {
    audio.muted = !audio.muted;
    updateMuteButton(audio.muted);
}

function updateMuteButton(muted) {
    volumeIcon.style.display = muted ? 'none' : 'block';
    muteIcon.style.display = muted ? 'block' : 'none';
}

// ============================================================================
// PROGRESS BAR
// ============================================================================
function updateProgress() {
    if (!audio.duration || isDraggingProgress) return;

    const percent = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = percent + '%';
    progressHandle.style.left = percent + '%';

    if (showRemainingTime) {
        const remaining = audio.duration - audio.currentTime;
        currentTimeEl.textContent = '-' + formatTime(remaining);
    } else {
        currentTimeEl.textContent = formatTime(audio.currentTime);
    }
    if (isV2Docking) {
        ipcRenderer.send('kraken:playlist:time', {
            plCurrentTime: formatTime(audio.currentTime)
        });
    } else if (plCurrentTime) {
        plCurrentTime.textContent = formatTime(audio.currentTime);
    }
}

function handleMetadataLoaded() {
    // Update total time - if playlist has multiple tracks, renderPlaylist will update
    // to total playlist duration; for now show current track duration
    if (totalTimeEl) totalTimeEl.textContent = formatTime(audio.duration);
}

function handleProgressClick(e) {
    if (!audio.duration) return;

    const rect = progressContainer.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audio.duration;
}

function startProgressDrag(e) {
    if (!audio.duration) return;
    isDraggingProgress = true;
}

function handleProgressDrag(e) {
    if (!isDraggingProgress || !audio.duration) return;

    const rect = progressContainer.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));

    progressFill.style.width = (percent * 100) + '%';
    progressHandle.style.left = (percent * 100) + '%';
    currentTimeEl.textContent = formatTime(percent * audio.duration);
}

function endProgressDrag(e) {
    if (!isDraggingProgress) return;

    const rect = progressContainer.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    audio.currentTime = percent * audio.duration;

    isDraggingProgress = false;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// FILE HANDLING
// ============================================================================
// ============================================================================
// FILE HANDLING
// ============================================================================
async function openFiles() {
    const files = await ipcRenderer.invoke('open-file-dialog');
    if (files.length > 0) {
        replacePlaylist(files);
    }
}

async function openFolder() {
    const files = await ipcRenderer.invoke('open-folder-dialog');
    if (files.length > 0) {
        replacePlaylist(files);
    }
}

async function processDroppedPaths(items) {
    if (!items || items.length === 0) return;

    if (isPlaying) pause();

    let newFiles = [];
    for (const itemPath of items) {
        if (!itemPath) continue;
        try {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                newFiles = newFiles.concat(scanFolderRecursive(itemPath));
            } else if (isAudioFile(itemPath)) {
                newFiles.push(itemPath);
            }
        } catch (err) {
            console.error('Error processing dropped item:', itemPath, err);
        }
    }

    if (newFiles.length > 0) {
        replacePlaylist(newFiles);
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dropOverlay.classList.remove('active');

    const items = [];
    if (e.dataTransfer && e.dataTransfer.files) {
        for (const file of e.dataTransfer.files) {
            items.push(file.path);
        }
    }

    await processDroppedPaths(items);
}

function scanFolderRecursive(dir) {
    let results = [];
    try {
        const list = fs.readdirSync(dir);
        list.forEach(file => {
            file = path.join(dir, file);
            const stat = fs.statSync(file);
            if (stat && stat.isDirectory()) {
                results = results.concat(scanFolderRecursive(file));
            } else {
                if (isAudioFile(file)) {
                    results.push(file);
                }
            }
        });
    } catch (err) {
        console.error('Error scanning dir:', dir, err);
    }
    return results;
}

function isAudioFile(filePath) {
    if (!filePath) return false;
    const ext = path.extname(filePath).toLowerCase();
    return ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'].includes(ext);
}

function replacePlaylist(files) {
    playlist = files;
    playlistMeta = new Array(files.length).fill(null);
    currentIndex = 0;
    selectedPlaylistIdx = 0;
    renderPlaylist();
    loadTrack(0);
    play();
    loadAllPlaylistMeta();
}

async function loadAllPlaylistMeta() {
    const snapshot = playlist.slice();
    for (let i = 0; i < snapshot.length; i++) {
        if (snapshot[i] !== playlist[i]) break; // playlist changed, abort
        if (i === currentIndex) continue; // already loaded by loadMetadata()
        try {
            const meta = await parseAudioMetadata(snapshot[i], { duration: true });
            if (snapshot[i] !== playlist[i]) break;
            playlistMeta[i] = playlistMeta[i] || {};
            playlistMeta[i].title = meta.common.title || null;
            playlistMeta[i].artist = meta.common.artist || null;
            playlistMeta[i].duration = meta.format.duration || null;
            renderPlaylist();
        } catch (e) { /* skip unreadable files */ }
    }
}

function addToPlaylist(files) {
    // Kept for backward compatibility if we ever want "Enqueue" feature
    for (const file of files) {
        if (!playlist.includes(file)) {
            playlist.push(file);
        }
    }
}

async function loadTrack(index) {
    if (index < 0 || index >= playlist.length) return;

    const filePath = playlist[index];
    audio.src = filePath;

    await loadMetadata(filePath);
    renderPlaylist();

    if (currentEffect !== 'none') {
        triggerTrackChangeEffect();
    }
}

async function loadMetadata(filePath) {
    const filename = path.basename(filePath, path.extname(filePath));

    // Bump the token *and* snapshot which playlist slot this load belongs to.
    // Any earlier in-flight parseFile() now has a stale token and will bail
    // out instead of overwriting our display fields.
    const myToken = ++metadataLoadToken;
    const myIndex = currentIndex;

    trackTitle.textContent = filename;
    trackArtist.textContent = '';
    trackAlbum.textContent = '';
    trackNumber.textContent = '';
    stopTicker();

    revokeAlbumArtUrl();
    albumArt.innerHTML = '';
    syncFloatingAlbumArt();

    // Reset display
    if (trackBitrate) trackBitrate.textContent = '---';
    if (trackSampleRate) trackSampleRate.textContent = '--';
    if (monoInd) monoInd.classList.remove('lit');
    if (stereoInd) stereoInd.classList.remove('lit');

    // Clear the total-time field too — handleMetadataLoaded() on the <audio>
    // element will repopulate it from the decoder once the new file loads.
    // Without this, a stale duration from the previous track would linger.
    if (totalTimeEl) totalTimeEl.textContent = '0:00';

    // Build initial display text from filename
    let displayTitle = filename;
    let displayArtist = '';

    try {
        const metadata = await parseAudioMetadata(filePath);

        // Race guard: if another loadMetadata() started while we were
        // awaiting, abort silently — our results are for a track that's
        // no longer current.
        if (myToken !== metadataLoadToken) return;

        const { common, format } = metadata;

        if (common.title) {
            trackTitle.textContent = common.title;
            displayTitle = common.title;
        }
        if (common.artist) {
            trackArtist.textContent = common.artist;
            displayArtist = common.artist;
        }
        if (common.album) trackAlbum.textContent = common.album;
        if (common.track?.no) {
            trackNumber.textContent = `Track ${common.track.no}${common.track.of ? '/' + common.track.of : ''}`;
        }

        // Bitrate & sample rate
        if (format.bitrate && trackBitrate) {
            trackBitrate.textContent = Math.round(format.bitrate / 1000);
        }
        if (format.sampleRate && trackSampleRate) {
            trackSampleRate.textContent = Math.round(format.sampleRate / 1000);
        }

        // Mono / stereo
        const channels = format.numberOfChannels || 2;
        if (monoInd) monoInd.classList.toggle('lit', channels === 1);
        if (stereoInd) stereoInd.classList.toggle('lit', channels >= 2);

        // Album art
        if (common.picture && common.picture.length > 0) {
            setAlbumArtFromPicture(common.picture[0]);
        }

        // Store title, artist, duration in playlistMeta — keyed against
        // the snapshot taken at call time, not the live currentIndex,
        // which may have moved on.
        if (playlist[myIndex] === filePath) {
            playlistMeta[myIndex] = playlistMeta[myIndex] || {};
            if (common.title) playlistMeta[myIndex].title = common.title;
            if (common.artist) playlistMeta[myIndex].artist = common.artist;
            if (format.duration) playlistMeta[myIndex].duration = format.duration;
            renderPlaylist();
        }

        // Build ticker text
        let tickerText = displayArtist ? `${displayArtist} - ${displayTitle}` : displayTitle;
        if (common.track?.no) tickerText = `${common.track.no}. ${tickerText}`;
        if (common.comment?.[0]) {
            const comment = common.comment[0];
            const commentText = typeof comment === 'string' ? comment : (comment.text || String(comment));
            tickerText += `  ·  ${commentText}`;
        }
        startTicker(tickerText);

    } catch (err) {
        if (myToken !== metadataLoadToken) return;
        console.error('Error reading metadata:', err);
        // Still start ticker with filename
        startTicker(displayTitle);
    }
}

// ============================================================================
// TICKER (Scrolling Comment)
// ============================================================================
function startTicker(text) {
    if (!text || !text.trim()) {
        stopTicker();
        return;
    }

    tickerText = text.trim();
    trackComment.textContent = tickerText;
    trackComment.classList.add('visible');

    // Cancel any existing animation
    if (tickerAnimationId) {
        cancelAnimationFrame(tickerAnimationId);
        tickerAnimationId = null;
    }
    if (tickerTimeoutId) {
        clearTimeout(tickerTimeoutId);
        tickerTimeoutId = null;
    }

    scrollTicker();
}

function scrollTicker() {
    const container = trackComment.parentElement;
    const containerWidth = container.offsetWidth;
    const tickerWidth = trackComment.offsetWidth;

    // Start from right edge
    let position = containerWidth;
    trackComment.style.transform = `translateX(${position}px)`;

    const startTime = performance.now();
    const totalDistance = containerWidth + tickerWidth;
    const duration = (totalDistance / TICKER_SPEED) * 1000; // ms

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = elapsed / duration;

        if (progress >= 1) {
            // Finished one scroll, wait then repeat
            trackComment.classList.remove('visible');
            tickerTimeoutId = setTimeout(() => {
                if (tickerText) {
                    trackComment.classList.add('visible');
                    scrollTicker();
                }
            }, TICKER_DELAY * 1000);
            return;
        }

        position = containerWidth - (progress * totalDistance);
        trackComment.style.transform = `translateX(${position}px)`;
        tickerAnimationId = requestAnimationFrame(animate);
    }

    tickerAnimationId = requestAnimationFrame(animate);
}

function stopTicker() {
    if (tickerAnimationId) {
        cancelAnimationFrame(tickerAnimationId);
        tickerAnimationId = null;
    }
    if (tickerTimeoutId) {
        clearTimeout(tickerTimeoutId);
        tickerTimeoutId = null;
    }
    trackComment.classList.remove('visible');
    trackComment.textContent = '';
    trackComment.style.transform = '';
    tickerText = '';
}

function getDefaultArt() {
    return `
        <svg viewBox="0 0 200 240" class="kraken-svg default-art">
            <defs>
                <linearGradient id="mantleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#2d7a9c" />
                    <stop offset="50%" style="stop-color:#3b9ebe" />
                    <stop offset="100%" style="stop-color:#1a5a7a" />
                </linearGradient>
                <linearGradient id="tentacleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#3b9ebe" />
                    <stop offset="100%" style="stop-color:#1a4a5a" />
                </linearGradient>
                <radialGradient id="glowSpot" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                    <stop offset="30%" style="stop-color:#7dd3fc;stop-opacity:0.9" />
                    <stop offset="100%" style="stop-color:#3b9ebe;stop-opacity:0" />
                </radialGradient>
            </defs>
            <g class="mantle-group">
                <ellipse cx="100" cy="58" rx="52" ry="48" fill="#1a4a5a" opacity="0.5" />
                <path class="mantle" d="M100 10 Q145 10 160 45 Q170 70 165 95 Q160 115 140 120 Q120 125 100 125 Q80 125 60 120 Q40 115 35 95 Q30 70 40 45 Q55 10 100 10Z" fill="url(#mantleGradient)" />
            </g>
            <g class="tentacles-front">
                <path class="tentacle t1" d="M60 115 Q35 145 25 180 Q20 210 35 235 Q38 240 42 235 Q48 220 45 200 Q50 170 70 140" fill="url(#tentacleGradient)" />
                <path class="tentacle t2" d="M75 120 Q55 155 50 190 Q48 220 60 240 Q65 245 68 238 Q72 215 70 195 Q75 160 88 135" fill="url(#tentacleGradient)" />
                <path class="tentacle t5" d="M125 120 Q145 155 150 190 Q152 220 140 240 Q135 245 132 238 Q128 215 130 195 Q125 160 112 135" fill="url(#tentacleGradient)" />
                <path class="tentacle t6" d="M140 115 Q165 145 175 180 Q180 210 165 235 Q162 240 158 235 Q152 220 155 200 Q150 170 130 140" fill="url(#tentacleGradient)" />
            </g>
            <g class="bio-glow">
                <circle cx="65" cy="70" r="6" fill="url(#glowSpot)" class="glow-spot g1" />
                <circle cx="135" cy="70" r="6" fill="url(#glowSpot)" class="glow-spot g2" />
                <circle cx="100" cy="108" r="5" fill="url(#glowSpot)" class="glow-spot g5" />
            </g>
            <g class="eyes">
                <ellipse cx="75" cy="65" rx="12" ry="14" fill="#061520" />
                <ellipse cx="75" cy="65" rx="7" ry="9" fill="#020a10" class="pupil" />
                <ellipse cx="71" cy="60" rx="3" ry="3.5" fill="#ffffff" class="eye-shine" />
                <ellipse cx="125" cy="65" rx="12" ry="14" fill="#061520" />
                <ellipse cx="125" cy="65" rx="7" ry="9" fill="#020a10" class="pupil" />
                <ellipse cx="121" cy="60" rx="3" ry="3.5" fill="#ffffff" class="eye-shine" />
            </g>
        </svg>
    `;
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================
function handleKeyboard(e) {
    if (e.key === 'F12') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            togglePlay();
            break;
        case 'ArrowLeft':
            if (e.ctrlKey) {
                playPrevious();
            } else {
                audio.currentTime = Math.max(0, audio.currentTime - 5);
            }
            break;
        case 'ArrowRight':
            if (e.ctrlKey) {
                playNext();
            } else {
                audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            }
            break;
        case 'ArrowUp':
            volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
            handleVolumeChange();
            break;
        case 'ArrowDown':
            volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
            handleVolumeChange();
            break;
        case 'KeyM':
            toggleMute();
            break;
        case 'KeyS':
            toggleShuffle();
            break;
        case 'KeyR':
            toggleRepeat();
            break;
        case 'KeyO':
            if (e.ctrlKey) {
                e.preventDefault();
                openFileMenu();
            }
            break;
        case 'Backquote': // ~ key
            e.preventDefault();
            toggleEffectsMenu();
            break;
    }
}

// ============================================================================
// STOP
// ============================================================================
function stopAudio() {
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    updatePlayButton(false);
    progressFill.style.width = '0%';
    progressHandle.style.left = '0%';
    currentTimeEl.textContent = '0:00';
    if (plCurrentTime) plCurrentTime.textContent = '0:00';
}

// ============================================================================
// PANEL VISIBILITY
// ============================================================================
function applyPanelVisibility() {
    if (isV2Docking) {
        if (eqPanel) eqPanel.style.display = 'none';
        if (btnEqToggle) btnEqToggle.classList.toggle('active', showEqPanel);
        if (btnPlToggle) btnPlToggle.classList.toggle('active', showPlaylistPanel);
        if (btnVizToggle) btnVizToggle.classList.toggle('active', showVizPanel);
        return;
    }
    if (eqPanel) eqPanel.style.display = showEqPanel ? '' : 'none';
    if (playlistPanel) playlistPanel.style.display = showPlaylistPanel ? '' : 'none';
    if (btnEqToggle) btnEqToggle.classList.toggle('active', showEqPanel);
    if (btnPlToggle) btnPlToggle.classList.toggle('active', showPlaylistPanel);
}

// ============================================================================
// PLAYLIST RENDER
// ============================================================================
function buildPlaylistIpcState() {
    let totalSecs = 0;
    playlistMeta.forEach((m) => { if (m && m.duration) totalSecs += m.duration; });
    const tracks = playlist.map((filePath, i) => {
        const meta = playlistMeta[i];
        const dur = (meta && meta.duration) ? formatTime(meta.duration) : '?:??';
        const name = meta && meta.title
            ? (meta.artist ? `${meta.artist} - ${meta.title}` : meta.title)
            : path.basename(filePath, path.extname(filePath));
        return {
            index: i,
            name,
            dur,
            isActive: i === currentIndex,
            isSelected: i === selectedPlaylistIdx
        };
    });
    return {
        tracks,
        plCurrentTime: formatTime(audio.currentTime || 0),
        totalTime: formatTime(totalSecs),
        selectedIndex: selectedPlaylistIdx
    };
}

function broadcastPlaylistState() {
    if (!isV2Docking) return;
    ipcRenderer.send('kraken:playlist:state', buildPlaylistIpcState());
}

async function handlePlaylistPanelAction(payload) {
    if (!payload || !payload.action) return;
    const { action } = payload;
    switch (action) {
        case 'select':
            selectedPlaylistIdx = payload.index;
            broadcastPlaylistState();
            break;
        case 'play':
            currentIndex = payload.index;
            selectedPlaylistIdx = payload.index;
            await loadTrack(payload.index);
            play();
            renderPlaylist();
            break;
        case 'add-files':
            await openFiles();
            break;
        case 'open-folder':
            await openFolder();
            break;
        case 'clear':
            playlist = [];
            playlistMeta = [];
            currentIndex = 0;
            selectedPlaylistIdx = -1;
            stopAudio();
            renderPlaylist();
            stopTicker();
            break;
        case 'remove':
            if (selectedPlaylistIdx >= 0 && playlist.length > 0) {
                playlist.splice(selectedPlaylistIdx, 1);
                playlistMeta.splice(selectedPlaylistIdx, 1);
                if (currentIndex >= selectedPlaylistIdx && currentIndex > 0) currentIndex--;
                selectedPlaylistIdx = Math.min(selectedPlaylistIdx, playlist.length - 1);
                renderPlaylist();
            }
            break;
        case 'select-all':
            break;
        case 'misc':
            if (isV2Docking) {
                ipcRenderer.send('kraken:window:toggle-effects');
            } else if (effectsMenu) {
                effectsMenu.classList.add('active');
                if (btnEffects) btnEffects.classList.add('active');
            }
            break;
        case 'drop-files':
            await processDroppedPaths(payload.paths);
            break;
        default:
            break;
    }
}

function renderPlaylist() {
    if (isV2Docking) {
        broadcastPlaylistState();
        return;
    }
    if (!playlistTracks) return;

    if (playlist.length === 0) {
        playlistTracks.innerHTML = `
            <div class="playlist-empty">
                <div class="pl-empty-icon">〜</div>
                <div>Drop audio files here or press ⏏ to open</div>
            </div>`;
        if (totalTimeEl) totalTimeEl.textContent = '0:00';
        return;
    }

    // Calculate total duration
    let totalSecs = 0;
    playlistMeta.forEach(m => { if (m && m.duration) totalSecs += m.duration; });
    if (totalTimeEl) totalTimeEl.textContent = formatTime(totalSecs);

    const html = playlist.map((filePath, i) => {
        const meta = playlistMeta[i];
        const dur = (meta && meta.duration) ? formatTime(meta.duration) : '?:??';
        const name = meta && meta.title
            ? (meta.artist ? `${meta.artist} - ${meta.title}` : meta.title)
            : path.basename(filePath, path.extname(filePath));
        const isActive = i === currentIndex;
        const isSelected = i === selectedPlaylistIdx;
        return `<div class="pl-track${isActive ? ' pl-active' : ''}${isSelected ? ' pl-selected' : ''}" data-idx="${i}">
            <span class="pl-track-num">${i + 1}.</span>
            <span class="pl-track-name">${escapeHtml(name)}</span>
            <span class="pl-track-dur">${dur}</span>
        </div>`;
    }).join('');

    playlistTracks.innerHTML = html;

    // Attach click handlers
    playlistTracks.querySelectorAll('.pl-track').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            selectedPlaylistIdx = idx;
            document.querySelectorAll('.pl-track').forEach(r => r.classList.remove('pl-selected'));
            el.classList.add('pl-selected');
        });
        el.addEventListener('dblclick', () => {
            const idx = parseInt(el.dataset.idx, 10);
            currentIndex = idx;
            selectedPlaylistIdx = idx;
            loadTrack(idx);
            play();
        });
    });

    // Scroll active track into view
    const activeEl = playlistTracks.querySelector('.pl-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================================
// MINI VISUALIZER (in main display)
// ============================================================================
function drawMiniViz() {
    if (!miniVizCtx || !miniVizCanvas || !analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);

    const w = miniVizCanvas.width;
    const h = miniVizCanvas.height;
    miniVizCtx.clearRect(0, 0, w, h);
    miniVizCtx.fillStyle = '#020a0e';
    miniVizCtx.fillRect(0, 0, w, h);

    const barCount = 18;
    const barW = Math.floor(w / barCount) - 1;
    const step = Math.floor(dataArray.length / barCount);

    for (let i = 0; i < barCount; i++) {
        const val = dataArray[i * step] / 255;
        const barH = Math.max(1, Math.floor(val * h));
        const hue = activeThemeColors.hueBase + i * (activeThemeColors.hueRange / barCount * 2);
        const alpha = 0.5 + val * 0.5;
        miniVizCtx.fillStyle = `hsla(${hue}, ${activeThemeColors.saturation > 0 ? 90 : 0}%, 60%, ${alpha})`;
        miniVizCtx.fillRect(i * (barW + 1), h - barH, barW, barH);
    }
}

// ============================================================================
// INITIALIZE
// ============================================================================
init();
