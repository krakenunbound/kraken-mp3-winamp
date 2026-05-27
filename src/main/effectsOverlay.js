const path = require('path');
const { BrowserWindow } = require('electron');

/**
 * Transparent click-through particle layer — only visible when the full
 * All four panels are magnetically docked in one group (any order / orientation).
 */
function createEffectsOverlayManager({ getStackWindows, getDockState, appRoot, onReady }) {
    let overlayWindow = null;
    let debounceTimer = null;
    let overlayReady = false;

    const overlayHtml = path.join(appRoot, 'panels', 'effects-overlay.html');

    function isStackFullyDocked() {
        const state = getDockState ? getDockState() : null;
        return !!(state && state.docked);
    }

    function getOverlayLayout() {
        if (!isStackFullyDocked()) return null;

        const wins = getStackWindows().filter((w) => w && !w.isDestroyed() && w.isVisible());
        if (!wins.length) return null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const win of wins) {
            const b = win.getBounds();
            minX = Math.min(minX, b.x);
            minY = Math.min(minY, b.y);
            maxX = Math.max(maxX, b.x + b.width);
            maxY = Math.max(maxY, b.y + b.height);
        }

        const width = maxX - minX;
        const height = maxY - minY;
        if (width < 1 || height < 1) return null;

        return {
            x: Math.round(minX),
            y: Math.round(minY),
            width: Math.round(width),
            height: Math.round(height)
        };
    }

    function ensureOverlay() {
        if (overlayWindow && !overlayWindow.isDestroyed()) return;

        overlayWindow = new BrowserWindow({
            show: false,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            focusable: false,
            skipTaskbar: true,
            hasShadow: false,
            thickFrame: false,
            resizable: false,
            movable: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: false,
                additionalArguments: ['--v2-docking', '--kraken-panel=overlay']
            }
        });

        overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        overlayWindow.setAlwaysOnTop(true, 'floating');

        overlayWindow.webContents.once('did-finish-load', () => {
            overlayReady = true;
            syncBounds();
            if (onReady) onReady();
        });

        overlayWindow.loadFile(overlayHtml);
    }

    function syncBounds() {
        const layout = getOverlayLayout();
        if (!layout) {
            if (overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.webContents.send('kraken:overlay:hide');
                overlayWindow.hide();
            }
            return;
        }

        ensureOverlay();
        if (!overlayWindow || overlayWindow.isDestroyed()) return;

        overlayWindow.setBounds({
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height
        });
        overlayWindow.showInactive();

        if (overlayReady) {
            overlayWindow.webContents.send('kraken:overlay:resize', {
                width: layout.width,
                height: layout.height
            });
        }
    }

    function scheduleSync() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(syncBounds, 50);
    }

    function sendState(state) {
        if (!state || !overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
        overlayWindow.webContents.send('kraken:effects:sync', state);
    }

    function sendBurst() {
        if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
        overlayWindow.webContents.send('kraken:effects:burst');
    }

    function hide() {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('kraken:overlay:hide');
            overlayWindow.hide();
        }
    }

    function destroy() {
        clearTimeout(debounceTimer);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close();
        }
        overlayWindow = null;
        overlayReady = false;
    }

    function attachWindowListeners(win) {
        if (!win) return;
        const sync = () => scheduleSync();
        win.on('move', sync);
        win.on('resize', sync);
        win.on('show', sync);
        win.on('hide', sync);
    }

    return {
        scheduleSync,
        syncBounds,
        sendState,
        sendBurst,
        hide,
        destroy,
        attachWindowListeners,
        getWindow: () => overlayWindow
    };
}

module.exports = { createEffectsOverlayManager };
