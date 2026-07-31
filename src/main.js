const { app, BrowserWindow, ipcMain, dialog, Menu, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDockEngine } = require('./main/dockEngine');
const { createEffectsOverlayManager } = require('./main/effectsOverlay');
const { loadLayout, saveLayout, defaultLayout, getLayoutPath } = require('./main/layoutStore');
const {
    sanitizeV2Layout,
    EQ_DOCKED_HEIGHT,
    PANEL_WIDTH,
    PLAYLIST_MIN_HEIGHT,
    PLAYLIST_MAX_HEIGHT,
    VIZ_MIN_HEIGHT,
    VIZ_MAX_HEIGHT,
    MAIN_DEFAULT_HEIGHT
} = require('./main/windowBounds');

const EFFECTS_PANEL_WIDTH = 320;
const EFFECTS_PANEL_HEIGHT = 720;
const EFFECTS_PANEL_MIN_HEIGHT = 400;

function readBuildFlavor() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, 'build-flavor.json'), 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return { mode: 'legacy' };
    }
}

const BUILD_FLAVOR = readBuildFlavor();
const IS_V2_DOCKING = process.argv.includes('--v2-docking') || BUILD_FLAVOR.mode === 'v2';
const EQ_PANEL_HEIGHT = EQ_DOCKED_HEIGHT;
const PRELOAD_PATH = path.join(__dirname, 'preload', 'preload.js');

// Avoid GPU/disk cache fights when dev instances overlap (harmless if creation still fails)
const cacheDir = path.join(
    app.getPath('temp'),
    'kraken-mp3-electron-cache',
    IS_V2_DOCKING ? 'v2' : 'v1'
);
try {
    fs.mkdirSync(cacheDir, { recursive: true });
} catch (_) { /* ignore */ }
app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
// Kraken is a user-launched music player. Files opened through Windows shell
// associations should begin playback without requiring a second in-app click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;
let playlistWindow;
let vizWindow;
let eqWindow;
let effectsWindow;
let effectsOverlay = null;
let dockEngine = null;
let currentFiles = [];
let isQuittingV2 = false;
let lastThemePayload = null;
let v2StackAlwaysOnTop = false;
let mainPageReady = false;
const mainReadyQueue = [];
const effectsWcLoadHooked = new WeakSet();
let pendingEffectsState = null;
let pendingThemeSync = null;
let pendingEffectsSync = null;
let musicMetadataPromise = null;
let mainRendererReady = false;
const pendingOpenFiles = [];

function getMusicMetadata() {
    if (!musicMetadataPromise) {
        musicMetadataPromise = import('music-metadata');
    }
    return musicMetadataPromise;
}

function getV2PlayerWindows() {
    return [mainWindow, playlistWindow, vizWindow, eqWindow].filter((w) => w && !w.isDestroyed());
}

function dispatchOpenFile(filePath) {
    if (!isAudioFile(filePath)) return;
    if (!mainRendererReady || !mainWindow || mainWindow.isDestroyed()) {
        // A shell launch can arrive before the renderer finishes its async
        // startup. Keep only one copy of each pending path.
        if (!pendingOpenFiles.includes(filePath)) pendingOpenFiles.push(filePath);
        return;
    }
    mainWindow.webContents.send('file-opened', filePath);
}

function flushPendingOpenFiles() {
    if (!mainRendererReady || !mainWindow || mainWindow.isDestroyed()) return;
    for (const filePath of pendingOpenFiles.splice(0)) {
        mainWindow.webContents.send('file-opened', filePath);
    }
}

function applyV2StackAlwaysOnTop(on) {
    v2StackAlwaysOnTop = !!on;
    for (const win of getV2PlayerWindows()) {
        if (on) win.setAlwaysOnTop(true, 'screen-saver', 0);
        else win.setAlwaysOnTop(false);
    }
    if (effectsOverlay) {
        effectsOverlay.setStackAlwaysOnTop();
    }
}

/** Dock order for z-order when raising the stack (main on top of siblings). */
function getV2StackRaiseOrder() {
    return [mainWindow, eqWindow, playlistWindow, vizWindow].filter((w) => w && !w.isDestroyed());
}

const V2_APP_USER_MODEL_ID = 'com.krakenunbound.mp3player.v2';

let v2StackFocusSync = false;
let v2StackActivationReady = false;
let v2StackSessionActive = false;
let lastFocusedPlayerWindow = null;
let stackRaiseTimer = null;
let v2StackMinimized = false;
const v2WindowsVisibleBeforeMinimize = new Set();

function isV2PlayerWindow(win) {
    if (!win || win.isDestroyed()) return false;
    return getV2PlayerWindows().includes(win);
}

function applyV2TaskbarIdentity(win) {
    if (!win || process.platform !== 'win32') return;
    try {
        win.setAppDetails({
            appId: V2_APP_USER_MODEL_ID,
            appIconPath: path.join(__dirname, '../assets/icons/icon.ico'),
            appIconIndex: 0
        });
    } catch (err) {
        console.warn('setAppDetails:', err);
    }
}

function hideV2SecondaryWindowsForMinimize() {
    if (v2StackMinimized) return;

    v2StackMinimized = true;
    v2WindowsVisibleBeforeMinimize.clear();
    for (const win of [playlistWindow, vizWindow, eqWindow]) {
        if (!win || win.isDestroyed() || !win.isVisible()) continue;
        v2WindowsVisibleBeforeMinimize.add(win);
        win.hide();
    }
}

function restoreV2SecondaryWindowsAfterMinimize() {
    if (!v2StackMinimized) return;

    for (const win of v2WindowsVisibleBeforeMinimize) {
        if (win && !win.isDestroyed()) win.showInactive();
    }
    v2WindowsVisibleBeforeMinimize.clear();
    v2StackMinimized = false;
}

/**
 * Bring player stack forward. fullStack=true when returning from another app or taskbar restore;
 * false when only switching panels (avoids moveTop storm / flicker).
 */
function raiseV2PlayerStack(frontWin, fullStack = true) {
    if (!IS_V2_DOCKING || isQuittingV2 || v2StackFocusSync || !v2StackActivationReady) return;
    if (dockEngine && dockEngine.isStackDragging && dockEngine.isStackDragging()) return;

    const players = getV2PlayerWindows();
    if (!players.length) return;

    v2StackFocusSync = true;
    try {
        for (const w of players) {
            if (w.isMinimized()) w.restore();
        }

        const front = frontWin && !frontWin.isDestroyed() ? frontWin : mainWindow;
        if (fullStack) {
            for (const w of getV2StackRaiseOrder()) {
                if (w === front || !w.isVisible()) continue;
                w.showInactive();
                w.moveTop();
            }
        }

        if (front && !front.isDestroyed()) {
            if (!front.isVisible()) front.show();
            front.moveTop();
            if (!front.isFocused()) front.focus();
        }

        // Keep the particle overlay above the freshly raised stack. When the
        // stack isn't always-on-top, the overlay isn't either — so it needs an
        // explicit lift after every stack raise, otherwise focusing a panel
        // sandwiches the overlay behind it.
        if (effectsOverlay) effectsOverlay.bringToFrontAfterStack();
    } finally {
        setImmediate(() => {
            v2StackFocusSync = false;
        });
    }
}

function wireV2StackActivationGroup() {
    app.on('browser-window-focus', (_event, win) => {
        if (!isV2PlayerWindow(win) || v2StackFocusSync || !v2StackActivationReady) return;

        clearTimeout(stackRaiseTimer);
        stackRaiseTimer = setTimeout(() => {
            const anyMinimized = getV2PlayerWindows().some((w) => w.isMinimized());
            const enteringFromOutside = !v2StackSessionActive;
            const switchedPanel = lastFocusedPlayerWindow && lastFocusedPlayerWindow !== win;
            const fullStack = enteringFromOutside || anyMinimized;

            lastFocusedPlayerWindow = win;
            v2StackSessionActive = true;

            if (fullStack || switchedPanel) {
                raiseV2PlayerStack(win, fullStack);
            }
        }, 40);
    });

    app.on('browser-window-blur', (_event, win) => {
        if (!isV2PlayerWindow(win)) return;
        setTimeout(() => {
            const focused = BrowserWindow.getFocusedWindow();
            if (!isV2PlayerWindow(focused)) {
                v2StackSessionActive = false;
            }
        }, 150);
    });
}

function runWhenMainReady(task) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return Promise.resolve();
    }
    if (mainPageReady && !mainWindow.webContents.isLoading()) {
        return Promise.resolve().then(task);
    }
    return new Promise((resolve, reject) => {
        mainReadyQueue.push({ task, resolve, reject });
    });
}

function flushMainReadyQueue() {
    mainPageReady = true;
    const queue = mainReadyQueue.splice(0);
    for (const { task, resolve, reject } of queue) {
        Promise.resolve()
            .then(task)
            .then(resolve, reject);
    }
}

function execOnMain(script) {
    return runWhenMainReady(() => mainWindow.webContents.executeJavaScript(script, true));
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.whenReady().then(() => {
        console.error('');
        console.error('*** Kraken MP3 is already running ***');
        console.error('Close the existing player window(s), or end leftover "electron"');
        console.error('processes in Task Manager, then run npm run start:v2 again.');
        console.error('');
        app.exit(0);
    });
} else {
    app.on('second-instance', (event, commandLine) => {
        const filePath = commandLine.find(arg => isAudioFile(arg));
        if (filePath) dispatchOpenFile(filePath);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            raiseV2PlayerStack(mainWindow);
        }
    });
}

function isAudioFile(filePath) {
    const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'];
    const ext = path.extname(filePath).toLowerCase();
    return audioExtensions.includes(ext);
}

function mainWebPreferences() {
    return {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: false,
        additionalArguments: IS_V2_DOCKING ? ['--v2-docking'] : []
    };
}

function attachDevToolsShortcut(win) {
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            win.webContents.toggleDevTools();
        }
    });
}

async function syncEqStateToPanel() {
    if (!mainWindow || !eqWindow || eqWindow.isDestroyed()) return;
    try {
        const state = await execOnMain(
            'typeof window.getEqStateForIpc === "function" ? window.getEqStateForIpc() : null'
        );
        if (state) {
            eqWindow.webContents.send('kraken:eq:state', state);
        }
    } catch (err) {
        console.error('syncEqStateToPanel:', err);
    }
}

function ensureEffectsWindow() {
    if (effectsWindow && !effectsWindow.isDestroyed()) return effectsWindow;
    if (!mainWindow || mainWindow.isDestroyed()) return null;

    // Cap height to whatever fits on the display the main window lives on,
    // minus a small margin so the resize handle stays grabbable. On a 1080p
    // monitor that's roughly 1000 px; on 1440p / 4K the user gets more room.
    const mainBounds = mainWindow.getBounds();
    const { workArea } = screen.getDisplayNearestPoint({
        x: mainBounds.x + Math.floor(mainBounds.width / 2),
        y: mainBounds.y
    });
    const maxH = Math.max(EFFECTS_PANEL_MIN_HEIGHT + 40, workArea.height - 40);
    const initialH = Math.min(EFFECTS_PANEL_HEIGHT, maxH);

    effectsWindow = new BrowserWindow({
        title: 'Kraken Effects',
        width: EFFECTS_PANEL_WIDTH,
        height: initialH,
        show: false,
        frame: false,
        transparent: false,
        resizable: true,
        minWidth: 280,
        maxWidth: 400,
        minHeight: EFFECTS_PANEL_MIN_HEIGHT,
        maxHeight: maxH,
        backgroundColor: '#0a1018',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            additionalArguments: ['--v2-docking', '--kraken-panel=effects']
        },
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });
    effectsWindow.loadFile(path.join(__dirname, 'panels', 'effects.html'));
    attachDevToolsShortcut(effectsWindow);
    effectsWindow.on('closed', () => {
        effectsWindow = null;
    });
    return effectsWindow;
}

function positionEffectsWindow() {
    if (!mainWindow || mainWindow.isDestroyed() || !effectsWindow || effectsWindow.isDestroyed()) {
        return;
    }
    const mb = mainWindow.getBounds();
    const ew = effectsWindow.getBounds();
    let x = mb.x + mb.width - ew.width;
    let y = mb.y;
    effectsWindow.setPosition(Math.round(x), Math.round(y));
}

function showEffectsWindow() {
    const win = ensureEffectsWindow();
    if (!win) return;
    positionEffectsWindow();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    syncEffectsStateToPanel();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:effects:visibility', true);
    }
}

function hideEffectsWindow() {
    if (!effectsWindow || effectsWindow.isDestroyed()) return;
    effectsWindow.setAlwaysOnTop(false);
    effectsWindow.hide();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:effects:visibility', false);
    }
}

/** Close every v2 satellite window and exit (main title-bar X or app quit). */
function closeAllV2Windows() {
    if (!IS_V2_DOCKING || isQuittingV2) return;
    isQuittingV2 = true;

    if (dockEngine) {
        try {
            dockEngine.persist();
        } catch (err) {
            console.warn('[v2] layout persist on close:', err.message);
        }
        dockEngine = null;
    }
    if (effectsOverlay) {
        effectsOverlay.destroy();
        effectsOverlay = null;
    }

    const satellites = [effectsWindow, playlistWindow, vizWindow, eqWindow];
    for (const win of satellites) {
        if (win && !win.isDestroyed()) {
            win.removeAllListeners('close');
            win.destroy();
        }
    }
    effectsWindow = null;
    playlistWindow = null;
    vizWindow = null;
    eqWindow = null;

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners('close');
        mainWindow.destroy();
    }
    mainWindow = null;
}

function deliverEffectsState(state) {
    if (!state) return;
    pendingEffectsState = state;
    const win = effectsWindow;
    if (!win || win.isDestroyed()) return;

    const send = () => {
        const payload = pendingEffectsState;
        if (!payload || !effectsWindow || effectsWindow.isDestroyed()) return;
        effectsWindow.webContents.send('kraken:effects:state', payload);
        if (effectsOverlay) effectsOverlay.sendState(payload);
    };

    if (!win.webContents.isLoading()) {
        send();
        return;
    }

    const wc = win.webContents;
    if (effectsWcLoadHooked.has(wc)) return;
    effectsWcLoadHooked.add(wc);
    wc.once('did-finish-load', send);
}

function syncEffectsStateToPanel() {
    ensureEffectsWindow();
    if (pendingEffectsSync) return pendingEffectsSync;
    pendingEffectsSync = execOnMain(
        'typeof window.getEffectsStateForIpc === "function" ? window.getEffectsStateForIpc() : null'
    )
        .then((state) => deliverEffectsState(state))
        .catch((err) => console.error('syncEffectsStateToPanel:', err))
        .finally(() => {
            pendingEffectsSync = null;
        });
    return pendingEffectsSync;
}

function broadcastThemePayload(payload) {
    if (!payload) return;
    lastThemePayload = payload;
    const wins = [mainWindow, playlistWindow, vizWindow, eqWindow, effectsWindow];
    for (const win of wins) {
        if (win && !win.isDestroyed()) {
            win.webContents.send('kraken:theme:apply', payload);
        }
    }
}

function syncThemeToAllPanels() {
    if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
    if (pendingThemeSync) return pendingThemeSync;
    pendingThemeSync = execOnMain(
        'typeof window.getThemePayloadForIpc === "function" ? window.getThemePayloadForIpc() : null'
    )
        .then((payload) => {
            if (payload) broadcastThemePayload(payload);
        })
        .catch((err) => console.error('syncThemeToAllPanels:', err))
        .finally(() => {
            pendingThemeSync = null;
        });
    return pendingThemeSync;
}

async function syncVizStateToPanel() {
    if (!mainWindow || !vizWindow || vizWindow.isDestroyed()) return;
    try {
        mainWindow.webContents.send('kraken:viz:request-sync');
        const cfg = await execOnMain(
            'typeof window.getVizConfigForIpc === "function" ? window.getVizConfigForIpc() : null'
        );
        if (cfg) {
            vizWindow.webContents.send('kraken:viz:config', cfg);
        }
        const art = await execOnMain(
            'typeof window.getVizAlbumArtForIpc === "function" ? window.getVizAlbumArtForIpc() : null'
        );
        if (art !== undefined) {
            vizWindow.webContents.send('kraken:viz:album-art', art);
        }
    } catch (err) {
        console.error('syncVizStateToPanel:', err);
    }
}

function createLegacyWindow() {
    const windowHeight = 640;

    mainWindow = new BrowserWindow({
        width: PANEL_WIDTH,
        height: windowHeight,
        minWidth: PANEL_WIDTH,
        minHeight: 145,
        maxWidth: 600,
        maxHeight: 1000,
        frame: false,
        transparent: false,
        resizable: true,
        backgroundColor: '#0a1018',
        webPreferences: mainWebPreferences(),
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    attachDevToolsShortcut(mainWindow);
    wireStartupFileOpen(mainWindow);
}

function createV2Windows() {
    const layout = sanitizeV2Layout(loadLayout(defaultLayout()));

    const mainHeight = MAIN_DEFAULT_HEIGHT;
    mainWindow = new BrowserWindow({
        title: 'Kraken MP3',
        x: layout.main.x,
        y: layout.main.y,
        width: layout.main.width,
        height: mainHeight,
        show: true,
        minWidth: PANEL_WIDTH,
        maxWidth: 600,
        minHeight: mainHeight,
        maxHeight: mainHeight,
        resizable: false,
        frame: false,
        transparent: false,
        backgroundColor: '#0a1018',
        webPreferences: mainWebPreferences(),
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    playlistWindow = new BrowserWindow({
        title: 'Kraken Playlist',
        x: layout.playlist.x,
        y: layout.playlist.y,
        width: layout.playlist.width,
        height: layout.playlist.height,
        minWidth: PANEL_WIDTH,
        minHeight: PLAYLIST_MIN_HEIGHT,
        maxWidth: 600,
        maxHeight: PLAYLIST_MAX_HEIGHT,
        frame: false,
        transparent: false,
        resizable: true,
        backgroundColor: '#0a1018',
        show: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            additionalArguments: ['--v2-docking', '--kraken-panel=playlist']
        },
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    vizWindow = new BrowserWindow({
        title: 'Kraken Visualizer',
        x: layout.visualizer.x,
        y: layout.visualizer.y,
        width: layout.visualizer.width,
        height: layout.visualizer.height,
        minWidth: PANEL_WIDTH,
        minHeight: VIZ_MIN_HEIGHT,
        maxWidth: 600,
        maxHeight: VIZ_MAX_HEIGHT,
        frame: false,
        transparent: false,
        resizable: true,
        backgroundColor: '#0a1018',
        show: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            additionalArguments: ['--v2-docking', '--kraken-panel=visualizer']
        },
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    eqWindow = new BrowserWindow({
        title: 'Kraken EQ',
        x: layout.eq.x,
        y: layout.eq.y,
        width: layout.eq.width,
        height: layout.eq.height,
        minWidth: PANEL_WIDTH,
        minHeight: EQ_PANEL_HEIGHT,
        maxWidth: 600,
        maxHeight: EQ_PANEL_HEIGHT,
        frame: false,
        transparent: false,
        resizable: false,
        backgroundColor: '#0a1018',
        show: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: false,
            additionalArguments: ['--v2-docking', '--kraken-panel=eq']
        },
        icon: path.join(__dirname, '../assets/icons/icon.png')
    });

    if (process.platform === 'win32') {
        app.setAppUserModelId(V2_APP_USER_MODEL_ID);
    }

    mainWindow.loadFile(path.join(__dirname, 'index-v2.html'));
    playlistWindow.loadFile(path.join(__dirname, 'panels', 'playlist.html'));
    vizWindow.loadFile(path.join(__dirname, 'panels', 'visualizer.html'));
    eqWindow.loadFile(path.join(__dirname, 'panels', 'eq.html'));

    for (const win of [mainWindow, playlistWindow, vizWindow, eqWindow]) {
        applyV2TaskbarIdentity(win);
    }

    attachDevToolsShortcut(mainWindow);
    attachDevToolsShortcut(playlistWindow);
    attachDevToolsShortcut(vizWindow);
    attachDevToolsShortcut(eqWindow);

    const getStackWindows = () => getV2PlayerWindows();

    const broadcastDockState = (state) => {
        const payload = state || (dockEngine && dockEngine.getDockState());
        if (!payload) return;
        for (const win of getStackWindows()) {
            if (win && !win.isDestroyed()) {
                win.webContents.send('kraken:dock:state', payload);
            }
        }
    };

    const onDockLayoutChange = (state) => {
        broadcastDockState(state);
        if (effectsOverlay) effectsOverlay.scheduleSync();
    };

    const positionDocked = () => {
        if (!dockEngine) return;
        dockEngine.repositionChain();
        if (playlistWindow && !playlistWindow.isDestroyed()) playlistWindow.show();
        if (vizWindow && !vizWindow.isDestroyed()) vizWindow.show();
        if (eqWindow && !eqWindow.isDestroyed()) eqWindow.show();
        mainWindow.focus();
        broadcastDockState();
        if (effectsOverlay) effectsOverlay.scheduleSync();
    };

    dockEngine = createDockEngine(mainWindow, playlistWindow, vizWindow, eqWindow, layout, onDockLayoutChange, {
        isStackAlwaysOnTop: () => v2StackAlwaysOnTop
    });

    effectsOverlay = createEffectsOverlayManager({
        getStackWindows,
        getDockState: () => (dockEngine ? dockEngine.getDockState() : { docked: false }),
        appRoot: __dirname,
        onReady: () => {
            syncEffectsStateToPanel();
            execOnMain(
                'typeof window.getEffectsStateForIpc === "function" ? window.getEffectsStateForIpc() : null'
            )
                .then((state) => {
                    if (state && effectsOverlay) effectsOverlay.sendState(state);
                })
                .catch(() => {});
        },
        isStackAlwaysOnTop: () => v2StackAlwaysOnTop
    });
    for (const win of getStackWindows()) {
        effectsOverlay.attachWindowListeners(win);
    }
    // Hide overlay during stack drag so it doesn't visibly trail the panels.
    dockEngine.setDragListener((dragging) => {
        if (!effectsOverlay) return;
        if (dragging) effectsOverlay.handleDragStart();
        else effectsOverlay.handleDragEnd();
    });

    positionDocked();

    mainWindow.on('move', () => {
        if (effectsWindow && !effectsWindow.isDestroyed() && effectsWindow.isVisible()) {
            positionEffectsWindow();
        }
    });

    mainWindow.on('minimize', () => {
        hideV2SecondaryWindowsForMinimize();
        if (effectsOverlay) effectsOverlay.hide();
    });
    mainWindow.on('restore', () => {
        restoreV2SecondaryWindowsAfterMinimize();
        if (effectsOverlay) effectsOverlay.scheduleSync();
        setImmediate(() => raiseV2PlayerStack(mainWindow));
    });

    mainWindow.webContents.once('did-finish-load', () => {
        flushMainReadyQueue();
        mainWindow.webContents.send('kraken:v2-mode', true);
        positionDocked();
        syncThemeToAllPanels();
    });

    playlistWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('kraken:playlist:push-sync');
        positionDocked();
    });

    vizWindow.webContents.once('did-finish-load', () => {
        syncVizStateToPanel();
        positionDocked();
    });

    eqWindow.webContents.once('did-finish-load', () => {
        syncEqStateToPanel();
        positionDocked();
    });

    setTimeout(positionDocked, 400);

    ensureEffectsWindow();

    const wireV2AppClose = (win) => {
        if (!win) return;
        win.on('close', () => {
            if (!isQuittingV2) closeAllV2Windows();
        });
    };
    wireV2AppClose(mainWindow);
    wireV2AppClose(playlistWindow);
    wireV2AppClose(vizWindow);
    wireV2AppClose(eqWindow);

    wireV2StackActivationGroup();
    setTimeout(() => {
        v2StackActivationReady = true;
        lastFocusedPlayerWindow = mainWindow;
    }, 900);

    wireStartupFileOpen(mainWindow);
}

function wireStartupFileOpen(win) {
    const filePath = process.argv.find(arg => isAudioFile(arg));
    if (filePath) dispatchOpenFile(filePath);
}

function createWindow() {
    mainRendererReady = false;
    Menu.setApplicationMenu(null);
    if (IS_V2_DOCKING) {
        createV2Windows();
    } else {
        createLegacyWindow();
    }
}

function getDialogParent() {
    return mainWindow;
}

function registerIpcHandlers() {
ipcMain.handle('kraken:ping', () => ({ ok: true, mode: IS_V2_DOCKING ? 'v2' : 'legacy' }));

ipcMain.on('kraken:renderer-ready', (event) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
    mainRendererReady = true;
    flushPendingOpenFiles();
});

ipcMain.handle('kraken:open-default-apps', async () => {
    if (process.platform !== 'win32') return { ok: false, reason: 'unsupported-platform' };
    await shell.openExternal('ms-settings:defaultapps?registeredAppMachine=Kraken%20MP3');
    return { ok: true };
});

ipcMain.handle('parse-audio-metadata', async (_event, filePath, options = {}) => {
    if (!isAudioFile(filePath)) {
        throw new Error('Unsupported audio file');
    }
    const musicMetadata = await getMusicMetadata();
    return musicMetadata.parseFile(filePath, options);
});

ipcMain.handle('kraken:eq:get-state', async () => {
    if (!mainWindow) return null;
    return execOnMain(
        'typeof window.getEqStateForIpc === "function" ? window.getEqStateForIpc() : null'
    );
});

ipcMain.handle('kraken:layout:get', () => {
    if (dockEngine) return dockEngine.getLayoutSnapshot();
    return null;
});

ipcMain.handle('kraken:layout:reset', () => {
    try {
        if (fs.existsSync(getLayoutPath())) {
            fs.unlinkSync(getLayoutPath());
        }
        return { ok: true };
    } catch (err) {
        console.error('kraken:layout:reset', err);
        return { ok: false };
    }
});

ipcMain.handle('kraken:dock:get-state', () => {
    if (!dockEngine) return { docked: true };
    return dockEngine.getDockState();
});

ipcMain.on('kraken:dock:toggle', (event, payload) => {
    if (!dockEngine) return;
    const panel = payload && payload.panel ? payload.panel : 'eq';
    dockEngine.toggleDockPanel(panel);
});

ipcMain.on('kraken:dock:regroup', () => {
    if (!dockEngine) return;
    dockEngine.regroupPanels();
    const message = 'Panels regrouped into one stack';
    for (const win of [mainWindow, playlistWindow, vizWindow, eqWindow]) {
        if (win && !win.isDestroyed()) {
            win.webContents.send('kraken:dock:message', message);
        }
    }
});

ipcMain.on('kraken:dock:set-locked', (event, payload) => {
    if (!dockEngine || !payload || !payload.panel) return;
    dockEngine.setPanelLocked(payload.panel, !!payload.locked);
});

ipcMain.handle('kraken:viz:get-config', async () => {
    if (!mainWindow) return { themeId: 'kraken', mode: 'none', floatArtMode: 'off' };
    return execOnMain(
        'typeof window.getVizConfigForIpc === "function" ? window.getVizConfigForIpc() : null'
    );
});

ipcMain.on('kraken:viz:request-sync', () => {
    syncVizStateToPanel();
});

ipcMain.on('kraken:viz:frame', (event, payload) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
        vizWindow.webContents.send('kraken:viz:frame', payload);
    }
});

ipcMain.on('kraken:viz:config', (event, payload) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
        vizWindow.webContents.send('kraken:viz:config', payload);
    }
});

ipcMain.on('kraken:viz:album-art', (event, payload) => {
    if (vizWindow && !vizWindow.isDestroyed()) {
        vizWindow.webContents.send('kraken:viz:album-art', payload);
    }
});

ipcMain.on('kraken:window:close-viz', () => {
    if (vizWindow && !vizWindow.isDestroyed()) {
        vizWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:viz:visibility', false);
    }
});

ipcMain.on('kraken:theme:broadcast', (event, payload) => {
    broadcastThemePayload(payload);
});

ipcMain.on('kraken:theme:request-sync', (event) => {
    if (lastThemePayload) {
        event.sender.send('kraken:theme:apply', lastThemePayload);
        return;
    }
    syncThemeToAllPanels().then(() => {
        if (lastThemePayload) {
            event.sender.send('kraken:theme:apply', lastThemePayload);
        }
    });
});

ipcMain.on('kraken:effects:request-sync', () => {
    syncEffectsStateToPanel();
    if (lastThemePayload && effectsWindow && !effectsWindow.isDestroyed()) {
        effectsWindow.webContents.send('kraken:theme:apply', lastThemePayload);
    } else {
        syncThemeToAllPanels();
    }
});

ipcMain.on('kraken:effects:apply', (event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:effects:apply', payload);
    }
});

ipcMain.on('kraken:effects:state', (event, state) => {
    if (!state) return;
    if (effectsWindow && !effectsWindow.isDestroyed()) {
        effectsWindow.webContents.send('kraken:effects:state', state);
    }
    if (effectsOverlay) {
        effectsOverlay.sendState(state);
    }
});

ipcMain.on('kraken:effects:burst', () => {
    if (effectsOverlay) {
        effectsOverlay.sendBurst();
    }
});

ipcMain.on('kraken:window:close-effects', () => {
    hideEffectsWindow();
});

ipcMain.on('kraken:window:toggle-effects', () => {
    if (!IS_V2_DOCKING) return;
    const win = ensureEffectsWindow();
    if (!win) return;
    if (win.isVisible()) {
        hideEffectsWindow();
    } else {
        showEffectsWindow();
    }
});

ipcMain.on('kraken:viz:ensure-visible', () => {
    if (!vizWindow || vizWindow.isDestroyed()) return;
    if (!vizWindow.isVisible()) {
        vizWindow.show();
        if (dockEngine) dockEngine.repositionChain();
        syncVizStateToPanel();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:viz:visibility', true);
    }
});

ipcMain.on('kraken:window:toggle-viz', () => {
    if (!vizWindow || vizWindow.isDestroyed()) return;
    const show = !vizWindow.isVisible();
    if (show) {
        vizWindow.show();
        if (dockEngine) dockEngine.repositionChain();
        vizWindow.focus();
        syncVizStateToPanel();
    } else {
        vizWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:viz:visibility', show);
    }
});

ipcMain.on('kraken:playlist:state', (event, state) => {
    if (playlistWindow && !playlistWindow.isDestroyed()) {
        playlistWindow.webContents.send('kraken:playlist:state', state);
    }
});

ipcMain.on('kraken:playlist:time', (event, payload) => {
    if (playlistWindow && !playlistWindow.isDestroyed()) {
        playlistWindow.webContents.send('kraken:playlist:time', payload);
    }
});

ipcMain.on('kraken:playlist:request-sync', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:playlist:push-sync');
    }
});

ipcMain.on('kraken:playlist:action', (event, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:playlist:action', payload);
    }
});

ipcMain.on('kraken:window:close-playlist', () => {
    if (playlistWindow && !playlistWindow.isDestroyed()) {
        playlistWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:playlist:visibility', false);
    }
});

ipcMain.on('kraken:window:toggle-playlist', () => {
    if (!playlistWindow || playlistWindow.isDestroyed()) return;
    const show = !playlistWindow.isVisible();
    if (show) {
        playlistWindow.show();
        if (dockEngine) dockEngine.repositionChain();
        playlistWindow.focus();
    } else {
        playlistWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kraken:playlist:visibility', show);
    }
});

ipcMain.on('kraken:eq:set', (event, payload) => {
    if (!mainWindow) return;
    mainWindow.webContents.send('kraken:eq:apply', payload);
});

ipcMain.on('kraken:window:close-eq', () => {
    if (eqWindow && !eqWindow.isDestroyed()) {
        eqWindow.hide();
    }
});

ipcMain.on('kraken:window:toggle-eq', () => {
    if (!eqWindow || eqWindow.isDestroyed()) return;
    if (eqWindow.isVisible()) {
        eqWindow.hide();
    } else {
        eqWindow.show();
        eqWindow.focus();
        if (dockEngine) dockEngine.repositionChain();
    }
});

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(getDialogParent(), {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'opus'] }
        ]
    });
    return result.filePaths;
});

ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(getDialogParent(), {
        properties: ['openDirectory']
    });

    if (result.filePaths.length > 0) {
        const folderPath = result.filePaths[0];
        return scanFolderForAudio(folderPath);
    }
    return [];
});

async function scanFolderForAudio(folderPath) {
    const audioFiles = [];
    const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus'];

    function scanDir(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    scanDir(fullPath);
                } else if (stat.isFile()) {
                    const ext = path.extname(item).toLowerCase();
                    if (audioExtensions.includes(ext)) {
                        audioFiles.push(fullPath);
                    }
                }
            }
        } catch (err) {
            console.error('Error scanning directory:', err);
        }
    }

    scanDir(folderPath);
    return audioFiles;
}

ipcMain.handle('get-backgrounds-path', () => {
    const documentsPath = app.getPath('documents');
    const bgPath = path.join(documentsPath, 'Kraken MP3', 'Wallpapers');

    if (!fs.existsSync(bgPath)) {
        try {
            fs.mkdirSync(bgPath, { recursive: true });
        } catch (err) {
            console.error('Failed to create wallpaper directory:', err);
        }
    }

    return bgPath;
});

ipcMain.handle('list-backgrounds', async (event, bgPath) => {
    try {
        const files = fs.readdirSync(bgPath);
        return files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f));
    } catch (err) {
        console.error('Error listing backgrounds:', err);
        return [];
    }
});

ipcMain.on('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (IS_V2_DOCKING && isV2PlayerWindow(win) && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
        return;
    }
    win.minimize();
});

ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    if (IS_V2_DOCKING) {
        if (win === mainWindow) {
            closeAllV2Windows();
            return;
        }
        if (win === eqWindow) {
            eqWindow.hide();
            return;
        }
        if (win === effectsWindow) {
            hideEffectsWindow();
            return;
        }
        if (win === playlistWindow || win === vizWindow) {
            win.hide();
            return;
        }
    } else if (win === eqWindow) {
        eqWindow.hide();
        return;
    }

    win.close();
});

ipcMain.on('toggle-always-on-top', (event, value) => {
    if (IS_V2_DOCKING) {
        applyV2StackAlwaysOnTop(!!value);
        return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (value) mainWindow.setAlwaysOnTop(true, 'screen-saver');
        else mainWindow.setAlwaysOnTop(false);
    }
});
}

function startApp() {
    registerIpcHandlers();

    app.whenReady().then(() => {
        createWindow();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });

    app.on('before-quit', () => {
        if (IS_V2_DOCKING) closeAllV2Windows();
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        dispatchOpenFile(filePath);
    });
}

if (gotTheLock) {
    startApp();
}
