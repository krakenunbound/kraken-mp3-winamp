/* Kraken MP3 v2 — standalone visualizer + floating album art */

const { ipcRenderer } = require('electron');
const { getVizTheme } = require('../shared/vizThemes');
const { drawVisualizerMode, resetWaterfall } = require('../shared/canvasViz');
const { installThemeListener } = require('../shared/themeClient');
const { applyDockStackChrome } = require('../shared/uiThemes');

const visualizerCanvas = document.getElementById('visualizerCanvas');
const floatingAlbumStage = document.getElementById('floatingAlbumStage');
const floatingAlbum = document.getElementById('floatingAlbum');
const floatingAlbumImg = document.getElementById('floatingAlbumImg');
const btnVizClose = document.getElementById('btnVizClose');
const vizBody = document.getElementById('vizBody');

const FLOAT_ART_SIZE = 180;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let visualizerCtx = null;
let currentViz = 'none';
let floatArtMode = 'off';
let activeTheme = getVizTheme('kraken');
let freqData = null;
let waveData = null;
let albumArtBounce = { x: 0, y: 0, vx: 0, vy: 0, vRotZ: 0, rotZ: 0, lastTime: 0 };
let animId = null;
let lastCanvasW = 0;
let lastCanvasH = 0;

function resizeCanvas() {
    if (!visualizerCanvas || !vizBody) return;
    const w = vizBody.clientWidth;
    const h = vizBody.clientHeight;
    if (w < 1 || h < 1) return;
    if (w !== lastCanvasW || h !== lastCanvasH) {
        if (currentViz === 'waterfall') resetWaterfall();
        lastCanvasW = w;
        lastCanvasH = h;
    }
    visualizerCanvas.width = w;
    visualizerCanvas.height = h;
}

function applyTheme(themeId) {
    activeTheme = getVizTheme(themeId);
}

window.onKrakenThemeApplied = (payload) => {
    if (payload && payload.viz) activeTheme = payload.viz;
};
installThemeListener(ipcRenderer);
ipcRenderer.send('kraken:theme:request-sync');

function applyVizMode(mode) {
    const next = mode || 'none';
    if (next !== currentViz && (currentViz === 'waterfall' || next === 'waterfall')) {
        resetWaterfall();
    }
    currentViz = next;
    if (next === 'waterfall') resizeCanvas();
}

function applyFloatArtMode(mode) {
    floatArtMode = mode || 'off';
    if (!floatingAlbumStage) return;
    floatingAlbumStage.classList.remove('mode-float', 'mode-bounce', 'active');
    if (mode === 'float') floatingAlbumStage.classList.add('mode-float');
    else if (mode === 'bounce') floatingAlbumStage.classList.add('mode-bounce');
    syncFloatingAlbumArt();
}

function syncFloatingAlbumArt() {
    if (!floatingAlbumStage || !floatingAlbumImg) return;
    const show = floatArtMode !== 'off' && !!floatingAlbumImg.getAttribute('src');
    floatingAlbumStage.classList.toggle('active', show);
    floatingAlbumStage.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) {
        floatingAlbumImg.removeAttribute('src');
        if (floatingAlbum) floatingAlbum.style.transform = '';
        return;
    }
    if (floatArtMode === 'bounce') resetFloatArtBounce();
    else if (floatingAlbum) floatingAlbum.style.transform = '';
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
    if (floatArtMode !== 'bounce' || !floatingAlbumStage?.classList.contains('active') || !floatingAlbum) return;
    if (prefersReducedMotion) return;
    const body = floatingAlbumStage.parentElement;
    if (!body) return;
    const now = performance.now() / 1000;
    const dt = albumArtBounce.lastTime ? Math.min(now - albumArtBounce.lastTime, 0.05) : 0.016;
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
    floatingAlbum.style.transform = `translate3d(${b.x}px, ${b.y}px, 0) rotate(${b.rotZ}deg)`;
}

function drawFrame() {
    if (!visualizerCtx || !visualizerCanvas) return;
    const ctx = visualizerCtx;
    const canvas = visualizerCanvas;
    if (currentViz !== 'waterfall') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    drawVisualizerMode(ctx, canvas, currentViz, freqData, waveData, activeTheme);
    tickFloatArtBounce();
}

function toFreqArray(freq) {
    if (!freq) return null;
    if (freq instanceof Uint8Array) return freq;
    if (ArrayBuffer.isView(freq)) {
        return new Uint8Array(freq.buffer, freq.byteOffset, freq.byteLength);
    }
    if (Array.isArray(freq)) return Uint8Array.from(freq);
    if (typeof freq.length === 'number') {
        const out = new Uint8Array(freq.length);
        for (let i = 0; i < freq.length; i++) out[i] = freq[i] | 0;
        return out;
    }
    return null;
}

function onVizFrame(payload) {
    if (!payload) return;
    if (payload.mode) currentViz = payload.mode;
    if (payload.freq) freqData = toFreqArray(payload.freq);
    if (payload.wave) waveData = payload.wave;
    drawFrame();
}

function applyDockLockState(state) {
    if (!state) return;
    applyDockStackChrome(document, 'visualizer', state);
    document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
        const panel = btn.dataset.panel || 'visualizer';
        const locked = !!(state[panel] && state[panel].locked);
        btn.classList.toggle('is-locked', locked);
        btn.classList.toggle('is-unlocked', !locked);
        btn.title = locked
            ? 'Magnetically docked — click to detach (or drag away)'
            : 'Detached — drag near another panel edge to snap';
    });
}

function applyFullConfig(cfg) {
    if (!cfg) return;
    if (cfg.themeId) applyTheme(cfg.themeId);
    if (cfg.mode !== undefined) applyVizMode(cfg.mode);
    if (cfg.floatArtMode !== undefined) applyFloatArtMode(cfg.floatArtMode);
}

if (btnVizClose) {
    btnVizClose.addEventListener('click', () => ipcRenderer.send('kraken:window:close-viz'));
}

document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ipcRenderer.send('kraken:dock:toggle', { panel: 'visualizer' });
    });
});

ipcRenderer.on('kraken:viz:frame', (_e, payload) => onVizFrame(payload));
ipcRenderer.on('kraken:viz:config', (_e, cfg) => applyFullConfig(cfg));
ipcRenderer.on('kraken:viz:album-art', (_e, payload) => {
    if (!floatingAlbumImg) return;
    if (!payload || !payload.url) {
        floatingAlbumImg.removeAttribute('src');
        syncFloatingAlbumArt();
        return;
    }
    if (payload.mode !== undefined) applyFloatArtMode(payload.mode);
    floatingAlbumImg.src = payload.url;
    syncFloatingAlbumArt();
});
ipcRenderer.on('kraken:dock:state', (_e, state) => applyDockLockState(state));

window.addEventListener('resize', resizeCanvas);

(async function init() {
    try {
        visualizerCtx = visualizerCanvas.getContext('2d');
        resizeCanvas();
        await ipcRenderer.invoke('kraken:ping');
        const cfg = await ipcRenderer.invoke('kraken:viz:get-config');
        applyFullConfig(cfg);
        const dockState = await ipcRenderer.invoke('kraken:dock:get-state');
        applyDockLockState(dockState);
        ipcRenderer.send('kraken:viz:request-sync');
    } catch (err) {
        console.error('[Visualizer panel] init failed:', err);
    }
})();
