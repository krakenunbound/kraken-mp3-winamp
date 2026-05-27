const path = require('path');
const { BrowserWindow, screen } = require('electron');

/** Max horizontal span for a vertical player stack (one column of panels). */
const MAX_STACK_SPAN_X = 640;

/**
 * Transparent click-through particle layer — only over the magnetically docked
 * player stack (all four panels in one group). Hidden when panels are scattered.
 */
function createEffectsOverlayManager({ getStackWindows, getDockState, appRoot, onReady, isStackAlwaysOnTop }) {
    let overlayWindow = null;
    let debounceTimer = null;
    let overlayReady = false;
    let pendingEffectState = null;

    const overlayHtml = path.join(appRoot, 'panels', 'effects-overlay.html');

    function isStackFullyDocked() {
        const state = getDockState ? getDockState() : null;
        return !!(state && state.docked);
    }

    /** Reject a bounding box that spans the desktop (detached / scattered panels). */
    function isStackLayoutCompact(wins) {
        if (!wins.length) return false;
        const bounds = wins.map((w) => w.getBounds());
        const left = Math.min(...bounds.map((b) => b.x));
        const right = Math.max(...bounds.map((b) => b.x + b.width));
        const top = Math.min(...bounds.map((b) => b.y));
        const bottom = Math.max(...bounds.map((b) => b.y + b.height));
        const spanX = right - left;
        const spanY = bottom - top;
        if (spanX > MAX_STACK_SPAN_X) return false;
        const { workArea } = screen.getDisplayNearestPoint({ x: left, y: top });
        if (spanX > workArea.width * 0.85 || spanY > workArea.height * 0.85) return false;
        return true;
    }

    function getOverlayLayout() {
        if (!isStackFullyDocked()) return null;

        const wins = getStackWindows().filter((w) => w && !w.isDestroyed() && w.isVisible());
        if (wins.length !== 4) return null;
        if (!isStackLayoutCompact(wins)) return null;

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

    function hideOverlayWindow() {
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
        overlayWindow.setAlwaysOnTop(false);
        overlayWindow.webContents.send('kraken:overlay:hide');
        overlayWindow.hide();
    }

    function applyOverlayZOrder() {
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
        const stackOnTop = !!(isStackAlwaysOnTop && isStackAlwaysOnTop());
        if (stackOnTop) {
            overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
        } else {
            overlayWindow.setAlwaysOnTop(true, 'floating');
        }
        overlayWindow.moveTop();
    }

    function flushPendingEffectState() {
        if (!pendingEffectState || !overlayReady || !overlayWindow || overlayWindow.isDestroyed()) {
            return;
        }
        if (!getOverlayLayout()) return;
        overlayWindow.webContents.send('kraken:effects:sync', pendingEffectState);
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

        overlayWindow.webContents.once('did-finish-load', () => {
            overlayReady = true;
            syncBounds();
            flushPendingEffectState();
            if (onReady) onReady();
        });

        overlayWindow.loadFile(overlayHtml);
    }

    function syncBounds() {
        const layout = getOverlayLayout();
        if (!layout) {
            hideOverlayWindow();
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
        applyOverlayZOrder();

        if (overlayReady) {
            overlayWindow.webContents.send('kraken:overlay:resize', {
                width: layout.width,
                height: layout.height
            });
            flushPendingEffectState();
        }
    }

    function scheduleSync() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(syncBounds, 50);
    }

    function sendState(state) {
        if (!state) return;
        pendingEffectState = state;
        if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) {
            scheduleSync();
            return;
        }
        if (!getOverlayLayout()) {
            hideOverlayWindow();
            return;
        }
        flushPendingEffectState();
    }

    function sendBurst() {
        if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) return;
        if (!getOverlayLayout()) return;
        overlayWindow.webContents.send('kraken:effects:burst');
    }

    function hide() {
        hideOverlayWindow();
    }

    function destroy() {
        clearTimeout(debounceTimer);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close();
        }
        overlayWindow = null;
        overlayReady = false;
        pendingEffectState = null;
    }

    function attachWindowListeners(win) {
        if (!win) return;
        const sync = () => scheduleSync();
        win.on('move', sync);
        win.on('resize', sync);
        win.on('show', sync);
        win.on('hide', sync);
    }

    function setStackAlwaysOnTop() {
        scheduleSync();
    }

    return {
        scheduleSync,
        syncBounds,
        setStackAlwaysOnTop,
        sendState,
        sendBurst,
        hide,
        destroy,
        attachWindowListeners,
        getWindow: () => overlayWindow
    };
}

module.exports = { createEffectsOverlayManager };
