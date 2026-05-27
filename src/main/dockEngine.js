const { saveLayout } = require('./layoutStore');
const { EQ_DOCKED_HEIGHT, PLAYLIST_DEFAULT_HEIGHT, VIZ_DEFAULT_HEIGHT } = require('./windowBounds');
const {
    SNAP_PX,
    PANEL_IDS,
    migrateLinksFromLayout,
    getChildren,
    getRoot,
    getRoots,
    getComponentPanels,
    isFullyDocked,
    panelLocked,
    detachPanel,
    detachChildren,
    attachPanel,
    findSnapTarget,
    expectedChildBounds,
    isBroken,
    parentPositionForChild,
    buildDockState
} = require('./dockGraph');

/**
 * Magnetic docking: attach any panel to any edge of another (N/S/E/W).
 * Chain order is user-defined, not fixed Main → Playlist → Viz → EQ.
 */
function createDockEngine(mainWin, playlistWin, vizWin, eqWin, layout, onStateChange, options = {}) {
    const isStackAlwaysOnTop = () => !!(options.isStackAlwaysOnTop && options.isStackAlwaysOnTop());
    const wins = {
        main: mainWin,
        playlist: playlistWin,
        visualizer: vizWin,
        eq: eqWin
    };

    let links = migrateLinksFromLayout(layout);
    let lastGoodSnapshot = {
        version: 5,
        dockGraph: { links: { ...links } },
        main: layout.main,
        playlist: layout.playlist,
        visualizer: layout.visualizer,
        eq: layout.eq
    };
    let suppressMove = false;
    let playlistHeight = layout.playlist?.height || PLAYLIST_DEFAULT_HEIGHT;
    let vizHeight = layout.visualizer?.height || VIZ_DEFAULT_HEIGHT;

    const readWindowBounds = (win) => {
        if (!win || win.isDestroyed()) return null;
        try {
            return win.getBounds();
        } catch (_) {
            return null;
        }
    };

    const broadcast = () => {
        if (onStateChange) onStateChange(getDockState());
    };

    const getBoundsMap = () => {
        const map = {};
        for (const id of PANEL_IDS) {
            const win = wins[id];
            if (win && !win.isDestroyed()) map[id] = win.getBounds();
        }
        return map;
    };

    const getDockState = () => buildDockState(links);

    const getLayoutSnapshot = () => {
        const snapshot = {
            version: 5,
            dockGraph: { links: { ...links } }
        };
        const mainB = readWindowBounds(mainWin);
        const playlistB = readWindowBounds(playlistWin);
        const vizB = readWindowBounds(vizWin);
        const eqB = readWindowBounds(eqWin);
        if (mainB) snapshot.main = mainB;
        if (playlistB) snapshot.playlist = playlistB;
        if (vizB) snapshot.visualizer = vizB;
        if (eqB) snapshot.eq = eqB;

        const hasBounds = !!(mainB || playlistB || vizB || eqB);
        if (!hasBounds && lastGoodSnapshot) {
            return {
                ...lastGoodSnapshot,
                dockGraph: { links: { ...links } }
            };
        }
        if (isFullyDocked(links) && snapshot.eq) {
            snapshot.eq.height = EQ_DOCKED_HEIGHT;
        }
        if (hasBounds) {
            lastGoodSnapshot = JSON.parse(JSON.stringify(snapshot));
        }
        return snapshot;
    };

    const persist = () => {
        try {
            const snapshot = getLayoutSnapshot();
            if (snapshot.main || snapshot.playlist || lastGoodSnapshot) {
                saveLayout(snapshot);
            }
        } catch (err) {
            console.warn('[dockEngine] persist skipped:', err.message);
        }
    };

    const applyChildBounds = (childId, parentB, childB, edge) => {
        const childWin = wins[childId];
        if (!childWin || childWin.isDestroyed()) return;
        const next = expectedChildBounds(parentB, childB, edge);
        if (!next) return;
        childWin.setBounds({
            x: Math.round(next.x),
            y: Math.round(next.y),
            width: Math.round(next.width),
            height: Math.round(next.height)
        });
    };

    const repositionSubtree = (rootId) => {
        const rootWin = wins[rootId];
        if (!rootWin || rootWin.isDestroyed()) return;

        const placeChildren = (parentId) => {
            const parentWin = wins[parentId];
            if (!parentWin || parentWin.isDestroyed()) return;
            const parentB = parentWin.getBounds();

            for (const childId of getChildren(links, parentId)) {
                const link = links[childId];
                const childWin = wins[childId];
                if (!childWin || childWin.isDestroyed()) continue;
                const childB = childWin.getBounds();
                applyChildBounds(childId, parentB, childB, link.edge);
                placeChildren(childId);
            }
        };

        placeChildren(rootId);
    };

    const repositionAll = () => {
        suppressMove = true;
        for (const rootId of getRoots(links)) {
            repositionSubtree(rootId);
        }
        suppressMove = false;
    };

    const pullAncestors = (panelId) => {
        const link = links[panelId];
        if (!link || suppressMove) return;

        const childWin = wins[panelId];
        const parentWin = wins[link.parent];
        if (!childWin || !parentWin || childWin.isDestroyed() || parentWin.isDestroyed()) return;

        suppressMove = true;
        const cb = childWin.getBounds();
        const pb = parentWin.getBounds();
        const pos = parentPositionForChild(cb, pb, link.edge);
        parentWin.setPosition(Math.round(pos.x), Math.round(pos.y));
        pullAncestors(link.parent);
        suppressMove = false;
    };

    const trySnapPanel = (panelId) => {
        if (links[panelId]) return false;
        const boundsMap = getBoundsMap();
        const snap = findSnapTarget(panelId, boundsMap, links);
        if (!snap) return false;
        attachPanel(links, panelId, snap.parent, snap.edge);
        repositionSubtree(getRoot(links, panelId));
        return true;
    };

    const tryBreakPanel = (panelId) => {
        const link = links[panelId];
        if (!link) return false;
        const parentWin = wins[link.parent];
        const childWin = wins[panelId];
        if (!parentWin || !childWin) return false;
        if (isBroken(parentWin.getBounds(), childWin.getBounds(), link.edge)) {
            detachPanel(links, panelId);
            return true;
        }
        return false;
    };

    const toggleDockPanel = (panel) => {
        if (!PANEL_IDS.includes(panel)) return;
        if (links[panel]) {
            detachPanel(links, panel);
        } else if (getChildren(links, panel).length > 0) {
            detachChildren(links, panel);
        } else {
            trySnapPanel(panel);
        }
        repositionAll();
        persist();
        broadcast();
    };

    const setPanelLocked = (panel, locked) => {
        if (!PANEL_IDS.includes(panel)) return;
        if (!locked) {
            detachPanel(links, panel);
        } else {
            trySnapPanel(panel);
        }
        repositionAll();
        persist();
        broadcast();
    };

    /** One lift per user drag — avoid setAlwaysOnTop/moveTop on every move tick (causes flicker). */
    let stackDrag = null;

    const stackPanelIds = (panelId) => {
        const ids = getComponentPanels(links, panelId);
        return ids.length ? ids : [panelId];
    };

    const beginStackDrag = (driverId) => {
        if (stackDrag || suppressMove) return;
        stackDrag = { driver: driverId };
        const list = stackPanelIds(driverId);
        if (!isStackAlwaysOnTop()) {
            for (const id of list) {
                const win = wins[id];
                if (win && !win.isDestroyed()) win.setAlwaysOnTop(true, 'floating');
            }
        }
        const root = links[driverId] ? getRoot(links, driverId) : driverId;
        const ordered = [];
        const walk = (pid) => {
            ordered.push(pid);
            for (const childId of getChildren(links, pid)) walk(childId);
        };
        walk(root);
        for (const id of ordered) {
            const win = wins[id];
            if (win && !win.isDestroyed()) win.moveTop();
        }
    };

    const endStackDrag = (panelId) => {
        if (!stackDrag || stackDrag.driver !== panelId) return;
        if (!isStackAlwaysOnTop()) {
            for (const id of stackPanelIds(panelId)) {
                const win = wins[id];
                if (win && !win.isDestroyed()) win.setAlwaysOnTop(false);
            }
        }
        stackDrag = null;
    };

    const onPanelMove = (panelId) => {
        if (suppressMove) return;
        beginStackDrag(panelId);
        if (links[panelId]) {
            pullAncestors(panelId);
            repositionSubtree(panelId);
            return;
        }
        if (getChildren(links, panelId).length > 0) {
            repositionSubtree(panelId);
        }
    };

    const onPanelMoved = (panelId) => {
        if (suppressMove) return;
        endStackDrag(panelId);
        let changed = false;
        if (tryBreakPanel(panelId)) changed = true;
        if (!links[panelId] && trySnapPanel(panelId)) changed = true;
        if (changed) {
            repositionAll();
            persist();
            broadcast();
            return;
        }
        if (links[panelId] || getChildren(links, panelId).length > 0) persist();
    };

    const onPanelResize = (panelId) => {
        const win = wins[panelId];
        if (!win || win.isDestroyed()) return;
        const b = win.getBounds();
        if (panelId === 'playlist') playlistHeight = b.height;
        if (panelId === 'visualizer') vizHeight = b.height;
        if (suppressMove) return;
        const root = links[panelId] ? getRoot(links, panelId) : panelId;
        repositionSubtree(root);
        persist();
    };

    for (const id of PANEL_IDS) {
        const win = wins[id];
        if (!win) continue;
        win.on('move', () => onPanelMove(id));
        win.on('moved', () => onPanelMoved(id));
        win.on('resize', () => onPanelResize(id));
    }

    const detachPanelById = (panelId) => {
        if (!PANEL_IDS.includes(panelId)) return;
        if (links[panelId]) {
            detachPanel(links, panelId);
        } else if (getChildren(links, panelId).length > 0) {
            detachChildren(links, panelId);
        }
        repositionAll();
        persist();
        broadcast();
    };

    /** Restore default vertical Winamp stack: Main → EQ → Playlist → Viz (anchored on main). */
    const regroupPanels = () => {
        for (const id of Object.keys(links)) {
            delete links[id];
        }
        attachPanel(links, 'eq', 'main', 'south');
        attachPanel(links, 'playlist', 'eq', 'south');
        attachPanel(links, 'visualizer', 'playlist', 'south');

        for (const id of PANEL_IDS) {
            const win = wins[id];
            if (win && !win.isDestroyed() && !win.isVisible()) {
                win.show();
            }
        }

        repositionAll();
        persist();
        broadcast();
    };

    broadcast();

    return {
        getDockState,
        repositionChain: repositionAll,
        repositionAll,
        regroupPanels,
        toggleDockPanel,
        detachPanel: detachPanelById,
        setPanelLocked,
        setMainPlaylistDocked: (v) => {
            if (!v) detachPanel(links, 'eq');
            else attachPanel(links, 'eq', 'main', 'south');
            repositionAll();
            persist();
            broadcast();
        },
        setPlaylistVizDocked: (v) => {
            if (!v) detachPanel(links, 'playlist');
            else attachPanel(links, 'playlist', 'eq', 'south');
            repositionAll();
            persist();
            broadcast();
        },
        setVizEqDocked: (v) => {
            if (!v) detachPanel(links, 'visualizer');
            else attachPanel(links, 'visualizer', 'playlist', 'south');
            repositionAll();
            persist();
            broadcast();
        },
        isMainPlaylistDocked: () => panelLocked(links, 'main'),
        isPanelDocked: (panelId) => panelLocked(links, panelId),
        isFullyDocked: () => isFullyDocked(links),
        persist,
        getLayoutSnapshot
    };
}

module.exports = { createDockEngine, SNAP_PX };
