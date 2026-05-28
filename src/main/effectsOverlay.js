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
    let dragSettleTimer = null;
    let overlayReady = false;
    let pendingEffectState = null;
    let isDragging = false;

    const overlayHtml = path.join(appRoot, 'panels', 'effects-overlay.html');

    function isStackFullyDocked() {
        const state = getDockState ? getDockState() : null;
        return !!(state && state.docked);
    }

    /**
     * Reject a bounding box that spans the desktop horizontally (detached /
     * scattered panels in different columns). We deliberately do NOT cap the
     * vertical span — a legitimately docked 4-panel stack can be ~1200 px tall,
     * which is taller than 85 % of a 1080p work area. Vertical scatter is
     * already caught by isStackFullyDocked() via the dock graph.
     */
    function isStackLayoutCompact(wins) {
        if (!wins.length) return false;
        const bounds = wins.map((w) => w.getBounds());
        const left = Math.min(...bounds.map((b) => b.x));
        const right = Math.max(...bounds.map((b) => b.x + b.width));
        const spanX = right - left;
        if (spanX > MAX_STACK_SPAN_X) return false;
        const { workArea } = screen.getDisplayNearestPoint({ x: left, y: bounds[0].y });
        if (spanX > workArea.width * 0.85) return false;
        return true;
    }

    function getOverlayLayout() {
        if (!isStackFullyDocked()) return null;

        // Allow overlay to render over any contiguous subset of visible panels.
        // Requiring all 4 visible silently kills the overlay if one window is
        // transiently hidden during startup or programmatic show/hide. Compact
        // check still guards against scattered layouts.
        const wins = getStackWindows().filter((w) => w && !w.isDestroyed() && w.isVisible());
        if (wins.length < 2) return null;
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

    /**
     * Z-order strategy:
     *   - Stack-on-top ON  → overlay always-on-top at screen-saver level 1
     *     (sits one layer above the stack which is at screen-saver level 0).
     *   - Stack-on-top OFF → overlay must NOT be always-on-top. Otherwise it
     *     hovers over other apps when focus leaves the stack. Instead we
     *     `moveTop()` it after the stack rises (driven from main.js's
     *     raiseV2PlayerStack via bringToFrontAfterStack()).
     */
    function applyOverlayZOrder() {
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
        const stackOnTop = !!(isStackAlwaysOnTop && isStackAlwaysOnTop());
        if (stackOnTop) {
            overlayWindow.setAlwaysOnTop(true, 'screen-saver', 1);
            overlayWindow.moveTop();
        } else {
            overlayWindow.setAlwaysOnTop(false);
            overlayWindow.moveTop();
        }
    }

    function bringToFrontAfterStack() {
        if (!overlayWindow || overlayWindow.isDestroyed()) return;
        if (!overlayWindow.isVisible()) {
            // Overlay was hidden by a transient — recover now that the stack
            // is being raised back to the foreground.
            scheduleSync();
            return;
        }
        applyOverlayZOrder();
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
        if (isDragging) return; // overlay stays hidden during drag; settle handler resyncs
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(syncBounds, 50);
    }

    /**
     * Drag handling: the overlay can't keep up with 60+ move ticks per second
     * via setBounds, so it visibly trails the stack. Hide it for the duration
     * of the drag and snap back on drop. dockEngine drives this via
     * setDragListener so we don't depend on per-window 'move' event ordering.
     */
    function handleDragStart() {
        isDragging = true;
        clearTimeout(debounceTimer);
        clearTimeout(dragSettleTimer);
        if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
            overlayWindow.hide();
        }
    }

    function handleDragEnd() {
        isDragging = false;
        clearTimeout(dragSettleTimer);
        // Brief settle delay so the dock engine's final reposition has landed
        // before we measure the new bounding box.
        dragSettleTimer = setTimeout(syncBounds, 30);
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
        // If the overlay was hidden by an earlier transient (drag, minimize,
        // a momentary layout-null while the user was fiddling) but the layout
        // is valid again, defer to syncBounds so it gets shown/positioned/
        // z-ordered before we send the state. Without this, state pushes after
        // a hide silently arrive at a hidden window and the user sees nothing.
        if (!overlayWindow.isVisible()) {
            syncBounds();
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
        clearTimeout(dragSettleTimer);
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.close();
        }
        overlayWindow = null;
        overlayReady = false;
        isDragging = false;
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
        bringToFrontAfterStack,
        handleDragStart,
        handleDragEnd,
        sendState,
        sendBurst,
        hide,
        destroy,
        attachWindowListeners,
        getWindow: () => overlayWindow
    };
}

module.exports = { createEffectsOverlayManager };
