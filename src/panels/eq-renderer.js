/* Kraken MP3 v2 — standalone EQ panel (IPC to main window for audio) */

const { ipcRenderer } = require('electron');
const { installThemeListener } = require('../shared/themeClient');
const { applyDockStackChrome } = require('../shared/uiThemes');

installThemeListener(ipcRenderer);

const eqPresets = {
    flat: { preamp: 0, bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    rock: { preamp: 0, bands: [4, 3, -1, -2, 0, 2, 3, 4, 4, 4] },
    pop: { preamp: 0, bands: [-1, 1, 3, 4, 3, 0, -1, -1, -1, -1] },
    jazz: { preamp: 0, bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
    classical: { preamp: 0, bands: [4, 3, 2, 1, 0, 0, 0, 1, 2, 3] },
    'bass-boost': { preamp: 0, bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] }
};

let eqEnabled = true;
let eqPreampDb = 0;
let eqBandGains = [...eqPresets.flat.bands];
let eqPreset = 'flat';

const eqToggle = document.getElementById('eqToggle');
const eqReset = document.getElementById('eqReset');
const eqPresetSelect = document.getElementById('eqPreset');
const eqPreampSlider = document.getElementById('eqPreamp');
const eqPreampVal = document.getElementById('eqPreampVal');
const eqBandSliders = Array.from(document.querySelectorAll('.eq-slider'));
const btnEqClose = document.getElementById('btnEqClose');

function pushEqToMain() {
    ipcRenderer.send('kraken:eq:set', {
        enabled: eqEnabled,
        preamp: eqPreampDb,
        bands: [...eqBandGains],
        preset: eqPreset
    });
}

function updateEqUI() {
    eqToggle.classList.toggle('active', eqEnabled);
    eqToggle.textContent = eqEnabled ? 'ON' : 'OFF';
    if (eqPresetSelect) eqPresetSelect.value = eqPreset;
    if (eqPreampSlider) eqPreampSlider.value = eqPreampDb;
    if (eqPreampVal) {
        eqPreampVal.textContent = `${eqPreampDb > 0 ? '+' : ''}${eqPreampDb} dB preamp`;
    }
    eqBandSliders.forEach((slider, index) => {
        slider.value = eqBandGains[index] ?? 0;
    });
}

function applyRemoteState(state) {
    if (!state) return;
    eqEnabled = state.enabled ?? eqEnabled;
    eqPreampDb = state.preamp ?? eqPreampDb;
    if (Array.isArray(state.bands) && state.bands.length === 10) {
        eqBandGains = [...state.bands];
    }
    eqPreset = state.preset ?? eqPreset;
    updateEqUI();
}

function setEqPreset(presetName) {
    const preset = eqPresets[presetName];
    if (!preset) return;
    eqPreset = presetName;
    eqPreampDb = preset.preamp;
    eqBandGains = [...preset.bands];
    updateEqUI();
    pushEqToMain();
}

function markEqCustom() {
    eqPreset = 'custom';
    if (eqPresetSelect) eqPresetSelect.value = 'custom';
}

eqToggle.addEventListener('click', () => {
    eqEnabled = !eqEnabled;
    updateEqUI();
    pushEqToMain();
});

eqReset.addEventListener('click', () => setEqPreset('flat'));

eqPresetSelect.addEventListener('change', () => {
    const presetName = eqPresetSelect.value;
    if (presetName === 'custom') {
        markEqCustom();
        pushEqToMain();
        return;
    }
    setEqPreset(presetName);
});

eqPreampSlider.addEventListener('input', () => {
    eqPreampDb = parseFloat(eqPreampSlider.value);
    markEqCustom();
    updateEqUI();
    pushEqToMain();
});

eqBandSliders.forEach((slider) => {
    slider.addEventListener('input', () => {
        const bandIndex = parseInt(slider.dataset.band, 10);
        eqBandGains[bandIndex] = parseFloat(slider.value);
        markEqCustom();
        updateEqUI();
        pushEqToMain();
    });
});

if (btnEqClose) {
    btnEqClose.addEventListener('click', () => {
        ipcRenderer.send('kraken:window:close-eq');
    });
}

ipcRenderer.on('kraken:eq:state', (_event, state) => applyRemoteState(state));

function applyDockLockState(state) {
    if (!state) return;
    applyDockStackChrome(document, 'eq', state);
    document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
        const panel = btn.dataset.panel || 'eq';
        const locked = !!(state[panel] && state[panel].locked);
        btn.classList.toggle('is-locked', locked);
        btn.classList.toggle('is-unlocked', !locked);
        btn.title = locked
            ? 'Magnetically docked — click to detach (or drag away)'
            : 'Detached — drag near another panel edge to snap';
    });
}

document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ipcRenderer.send('kraken:dock:toggle', { panel: 'eq' });
    });
});

ipcRenderer.on('kraken:dock:state', (_event, state) => applyDockLockState(state));
ipcRenderer.on('kraken:dock:message', (_event, message) => {
    console.log('[EQ panel]', message);
});

(async function init() {
    try {
        await ipcRenderer.invoke('kraken:ping');
        const state = await ipcRenderer.invoke('kraken:eq:get-state');
        applyRemoteState(state);
        const dockState = await ipcRenderer.invoke('kraken:dock:get-state');
        applyDockLockState(dockState);
        ipcRenderer.send('kraken:theme:request-sync');
    } catch (err) {
        console.error('[EQ panel] init failed:', err);
    }
})();
