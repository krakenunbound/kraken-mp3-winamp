/* Kraken MP3 v2 — standalone Effects & Visualizers panel */

const { ipcRenderer } = require('electron');
const { CUSTOM_COLOR_KEYS, buildThemePayload } = require('../shared/uiThemes');
const { installThemeListener } = require('../shared/themeClient');

const effectQuantitySlider = document.getElementById('effectQuantity');
const effectSizeSlider = document.getElementById('effectSize');
const effectSpeedSlider = document.getElementById('effectSpeed');
const effectQuantityVal = document.getElementById('effectQuantityVal');
const effectSizeVal = document.getElementById('effectSizeVal');
const effectSpeedVal = document.getElementById('effectSpeedVal');
const customColorGrid = document.getElementById('customColorGrid');

let lastState = { theme: 'kraken', customThemeColors: {} };
const dirtyColorKeys = new Set();

function sendApply(action, data = {}) {
    ipcRenderer.send('kraken:effects:apply', { action, ...data });
}

function hexFromCssColor(css) {
    if (!css) return '#3b9ebe';
    if (css.startsWith('#')) return css.length === 7 ? css : '#3b9ebe';
    const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
        const h = (n) => Number(n).toString(16).padStart(2, '0');
        return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
    }
    return '#3b9ebe';
}

function normalizeHex(raw) {
    if (!raw) return null;
    let s = String(raw).trim().toLowerCase();
    if (!s.startsWith('#')) s = `#${s}`;
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    return null;
}

function commitColor(key, value) {
    const hex = normalizeHex(value);
    if (!hex) return;
    sendApply('set-custom-color', { key, value: hex });
}

function previewColorLocal(key, hex) {
    document.documentElement.style.setProperty(key, hex);
}

function markColorDirty(key, row, applyBtn) {
    dirtyColorKeys.add(key);
    if (row) row.classList.add('custom-color-dirty');
    if (applyBtn) applyBtn.disabled = false;
}

function clearColorDirty(key, row, applyBtn) {
    dirtyColorKeys.delete(key);
    if (row) row.classList.remove('custom-color-dirty');
    if (applyBtn) applyBtn.disabled = true;
}

function applyColorRow(key, picker, hexInput, applyBtn, row) {
    const hex = normalizeHex(hexInput?.value || picker.value);
    if (!hex) return;
    picker.value = hex;
    if (hexInput) hexInput.value = hex;
    commitColor(key, hex);
    clearColorDirty(key, row, applyBtn);
}

function wireColorRow(key, picker, hexInput, applyBtn, row) {
    const syncDraft = () => {
        const hex = picker.value;
        if (hexInput) hexInput.value = hex;
        previewColorLocal(key, hex);
        markColorDirty(key, row, applyBtn);
    };

    picker.addEventListener('input', syncDraft);
    picker.addEventListener('change', syncDraft);

    applyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyColorRow(key, picker, hexInput, applyBtn, row);
    });

    if (hexInput) {
        hexInput.addEventListener('input', () => {
            const hex = normalizeHex(hexInput.value);
            if (!hex) {
                markColorDirty(key, row, applyBtn);
                return;
            }
            picker.value = hex;
            previewColorLocal(key, hex);
            markColorDirty(key, row, applyBtn);
        });
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyColorRow(key, picker, hexInput, applyBtn, row);
            }
        });
    }
}

function buildCustomColorGrid(state) {
    if (!customColorGrid) return;
    const payload = buildThemePayload(state.theme || 'kraken', state.customThemeColors || {});
    customColorGrid.innerHTML = '';

    for (const { key, label } of CUSTOM_COLOR_KEYS) {
        const row = document.createElement('div');
        row.className = 'custom-color-row';
        const lab = document.createElement('span');
        lab.className = 'custom-color-label';
        lab.textContent = label;

        const picker = document.createElement('input');
        picker.type = 'color';
        picker.className = 'custom-color-picker';
        picker.dataset.cssKey = key;
        picker.title = 'Click to open color picker — drag inside it to adjust';
        const hexVal = hexFromCssColor(payload.css[key]);
        picker.value = hexVal;

        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'custom-color-hex';
        hexInput.dataset.cssKey = key;
        hexInput.value = hexVal;
        hexInput.spellcheck = false;
        hexInput.autocomplete = 'off';
        hexInput.maxLength = 7;
        hexInput.title = 'Type #rrggbb, then Apply or Enter';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'custom-color-apply';
        applyBtn.textContent = 'Apply';
        applyBtn.disabled = true;
        applyBtn.title = 'Apply this color to all panels';

        wireColorRow(key, picker, hexInput, applyBtn, row);

        row.appendChild(lab);
        row.appendChild(picker);
        row.appendChild(hexInput);
        row.appendChild(applyBtn);
        customColorGrid.appendChild(row);
    }
}

function updateCustomColorGrid(state) {
    if (!customColorGrid) return;
    const payload = buildThemePayload(state.theme || 'kraken', state.customThemeColors || {});

    if (!customColorGrid.children.length) {
        buildCustomColorGrid(state);
        return;
    }

    for (const { key } of CUSTOM_COLOR_KEYS) {
        if (dirtyColorKeys.has(key)) continue;
        const hex = hexFromCssColor(payload.css[key]);
        const picker = customColorGrid.querySelector(`input.custom-color-picker[data-css-key="${key}"]`);
        const hexInput = customColorGrid.querySelector(`input.custom-color-hex[data-css-key="${key}"]`);
        if (picker) picker.value = hex;
        if (hexInput) hexInput.value = hex;
    }
}

function applyStateToUI(state) {
    if (!state) return;
    const prevTheme = lastState.theme;
    lastState = {
        theme: state.theme || 'kraken',
        customThemeColors: state.customThemeColors || {}
    };
    if (state.theme !== prevTheme) {
        dirtyColorKeys.clear();
    }

    document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.effect === state.effect);
    });
    document.querySelectorAll('.effect-btn[data-viz]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.viz === state.visualizer);
    });
    document.querySelectorAll('.effect-btn[data-float-art]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.floatArt === state.floatArtMode);
    });
    document.querySelectorAll('.theme-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.theme === state.theme);
    });
    if (state.effectSettings) {
        if (effectQuantitySlider) effectQuantitySlider.value = state.effectSettings.quantity;
        if (effectSizeSlider) effectSizeSlider.value = state.effectSettings.size;
        if (effectSpeedSlider) effectSpeedSlider.value = state.effectSettings.speed;
        if (effectQuantityVal) effectQuantityVal.textContent = state.effectSettings.quantity;
        if (effectSizeVal) effectSizeVal.textContent = state.effectSettings.size;
        if (effectSpeedVal) effectSpeedVal.textContent = state.effectSettings.speed;
    }

    if (dirtyColorKeys.size > 0 && state.theme === prevTheme) {
        updateCustomColorGrid(lastState);
    } else {
        buildCustomColorGrid(lastState);
    }
}

document.querySelectorAll('.effect-btn[data-effect]').forEach((btn) => {
    btn.addEventListener('click', () => {
        sendApply('set-effect', { effect: btn.dataset.effect });
    });
});

document.querySelectorAll('.effect-btn[data-viz]').forEach((btn) => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.viz;
        sendApply('set-viz', { visualizer: mode });
        document.querySelectorAll('.effect-btn[data-viz]').forEach((b) => {
            b.classList.toggle('active', b.dataset.viz === mode);
        });
    });
});

document.querySelectorAll('.effect-btn[data-float-art]').forEach((btn) => {
    btn.addEventListener('click', () => {
        sendApply('set-float-art', { floatArtMode: btn.dataset.floatArt });
    });
});

document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        sendApply('set-theme', { theme: btn.dataset.theme });
    });
});

document.getElementById('btnResetCustomColors')?.addEventListener('click', () => {
    sendApply('reset-custom-colors');
});

if (effectQuantitySlider) {
    effectQuantitySlider.addEventListener('input', () => {
        const val = parseInt(effectQuantitySlider.value, 10);
        if (effectQuantityVal) effectQuantityVal.textContent = val;
        sendApply('set-slider', { key: 'quantity', value: val });
    });
}
if (effectSizeSlider) {
    effectSizeSlider.addEventListener('input', () => {
        const val = parseInt(effectSizeSlider.value, 10);
        if (effectSizeVal) effectSizeVal.textContent = val;
        sendApply('set-slider', { key: 'size', value: val });
    });
}
if (effectSpeedSlider) {
    effectSpeedSlider.addEventListener('input', () => {
        const val = parseInt(effectSpeedSlider.value, 10);
        if (effectSpeedVal) effectSpeedVal.textContent = val;
        sendApply('set-slider', { key: 'speed', value: val });
    });
}

document.getElementById('btnFxClose')?.addEventListener('click', () => {
    ipcRenderer.send('kraken:window:close-effects');
});

ipcRenderer.on('kraken:effects:state', (_event, state) => applyStateToUI(state));

installThemeListener(ipcRenderer);
window.onKrakenThemeApplied = () => {
    if (dirtyColorKeys.size === 0 && customColorGrid) {
        updateCustomColorGrid(lastState);
    }
};

(async function init() {
    try {
        await ipcRenderer.invoke('kraken:ping');
        ipcRenderer.send('kraken:effects:request-sync');
        ipcRenderer.send('kraken:theme:request-sync');
    } catch (err) {
        console.error('[Effects panel] init failed:', err);
    }
})();
