/* Kraken MP3 v2 — standalone playlist panel (nodeIntegration for OS file drops) */

const { ipcRenderer } = require('electron');
const { installThemeListener } = require('../shared/themeClient');
const { applyDockStackChrome } = require('../shared/uiThemes');

installThemeListener(ipcRenderer);
ipcRenderer.send('kraken:theme:request-sync');

const playlistTracks = document.getElementById('playlistTracks');
const plCurrentTimeEl = document.getElementById('plCurrentTime');
const totalTimeEl = document.getElementById('totalTime');
const dropOverlay = document.getElementById('dropOverlay');
const btnPlClose = document.getElementById('btnPlClose');

let selectedIdx = -1;
let dragDepth = 0;

function sendAction(action, data = {}) {
    ipcRenderer.send('kraken:playlist:action', { action, ...data });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderFromState(state) {
    if (!state || !playlistTracks) return;

    if (plCurrentTimeEl && state.plCurrentTime) plCurrentTimeEl.textContent = state.plCurrentTime;
    if (totalTimeEl && state.totalTime) totalTimeEl.textContent = state.totalTime;

    if (!state.tracks || state.tracks.length === 0) {
        playlistTracks.innerHTML = `
            <div class="playlist-empty">
                <div class="pl-empty-icon">〜</div>
                <div>Drop audio files here or press ⏏ to open</div>
            </div>`;
        return;
    }

    selectedIdx = state.selectedIndex ?? selectedIdx;

    const html = state.tracks.map((t) => {
        const active = t.isActive ? ' pl-active' : '';
        const sel = t.isSelected ? ' pl-selected' : '';
        return `<div class="pl-track${active}${sel}" data-idx="${t.index}">
            <span class="pl-track-num">${t.index + 1}.</span>
            <span class="pl-track-name">${escapeHtml(t.name)}</span>
            <span class="pl-track-dur">${escapeHtml(t.dur)}</span>
        </div>`;
    }).join('');

    playlistTracks.innerHTML = html;

    playlistTracks.querySelectorAll('.pl-track').forEach((el) => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            selectedIdx = idx;
            sendAction('select', { index: idx });
        });
        el.addEventListener('dblclick', () => {
            const idx = parseInt(el.dataset.idx, 10);
            sendAction('play', { index: idx });
        });
    });

    const activeEl = playlistTracks.querySelector('.pl-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function applyDockLockState(state) {
    if (!state) return;
    applyDockStackChrome(document, 'playlist', state);
    document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
        const panel = btn.dataset.panel || 'playlist';
        const locked = !!(state[panel] && state[panel].locked);
        btn.classList.toggle('is-locked', locked);
        btn.classList.toggle('is-unlocked', !locked);
        btn.title = locked
            ? 'Magnetically docked — click to detach (or drag away)'
            : 'Detached — drag near another panel edge to snap';
    });
}

function collectDropPaths(e) {
    const paths = [];
    const dt = e.dataTransfer;
    if (!dt) return paths;

    if (dt.files && dt.files.length) {
        for (const file of dt.files) {
            if (file.path) paths.push(file.path);
        }
    }

    if (paths.length === 0 && dt.items && dt.items.length) {
        for (const item of dt.items) {
            if (item.kind !== 'file') continue;
            const file = item.getAsFile();
            if (file && file.path) paths.push(file.path);
        }
    }

    return paths;
}

document.getElementById('plBtnAdd')?.addEventListener('click', () => sendAction('add-files'));
document.getElementById('plBtnFolder')?.addEventListener('click', () => sendAction('open-folder'));
document.getElementById('plBtnClear')?.addEventListener('click', () => sendAction('clear'));
document.getElementById('plBtnRem')?.addEventListener('click', () => sendAction('remove'));
document.getElementById('plBtnSel')?.addEventListener('click', () => sendAction('select-all'));
document.getElementById('plBtnMisc')?.addEventListener('click', () => sendAction('misc'));

if (btnPlClose) {
    btnPlClose.addEventListener('click', () => {
        ipcRenderer.send('kraken:window:close-playlist');
    });
}

document.querySelectorAll('.dock-lock-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ipcRenderer.send('kraken:dock:toggle', { panel: 'playlist' });
    });
});

ipcRenderer.on('kraken:playlist:state', (_event, state) => renderFromState(state));
ipcRenderer.on('kraken:playlist:time', (_event, payload) => {
    if (payload && plCurrentTimeEl && payload.plCurrentTime) {
        plCurrentTimeEl.textContent = payload.plCurrentTime;
    }
});
ipcRenderer.on('kraken:dock:state', (_event, state) => applyDockLockState(state));

document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragDepth += 1;
    if (dropOverlay) dropOverlay.classList.add('active');
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && dropOverlay) dropOverlay.classList.remove('active');
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    if (dropOverlay) dropOverlay.classList.remove('active');

    const paths = collectDropPaths(e);
    if (paths.length) {
        sendAction('drop-files', { paths });
    }
});

(async function init() {
    try {
        await ipcRenderer.invoke('kraken:ping');
        ipcRenderer.send('kraken:playlist:request-sync');
        const dockState = await ipcRenderer.invoke('kraken:dock:get-state');
        applyDockLockState(dockState);
    } catch (err) {
        console.error('[Playlist panel] init failed:', err);
    }
})();
