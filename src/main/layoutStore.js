const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const {
    sanitizeV2Layout,
    MAIN_DEFAULT_HEIGHT,
    PLAYLIST_DEFAULT_HEIGHT,
    VIZ_DEFAULT_HEIGHT,
    EQ_DOCKED_HEIGHT,
    PANEL_WIDTH
} = require('./windowBounds');

const LAYOUT_VERSION = 5;

function getLayoutPath() {
    return path.join(app.getPath('userData'), 'kraken-v2-layout.json');
}

function defaultLayout() {
    const main = { x: 120, y: 80, width: PANEL_WIDTH, height: MAIN_DEFAULT_HEIGHT };
    const eqY = main.y + main.height;
    const playlistY = eqY + EQ_DOCKED_HEIGHT;
    const vizY = playlistY + PLAYLIST_DEFAULT_HEIGHT;
    return sanitizeV2Layout({
        version: LAYOUT_VERSION,
        dockGraph: {
            links: {
                eq: { parent: 'main', edge: 'south' },
                playlist: { parent: 'eq', edge: 'south' },
                visualizer: { parent: 'playlist', edge: 'south' }
            }
        },
        main,
        eq: {
            x: main.x,
            y: eqY,
            width: PANEL_WIDTH,
            height: EQ_DOCKED_HEIGHT
        },
        playlist: {
            x: main.x,
            y: playlistY,
            width: PANEL_WIDTH,
            height: PLAYLIST_DEFAULT_HEIGHT
        },
        visualizer: {
            x: main.x,
            y: vizY,
            width: PANEL_WIDTH,
            height: VIZ_DEFAULT_HEIGHT
        }
    });
}

function loadLayout(fallback) {
    try {
        const raw = fs.readFileSync(getLayoutPath(), 'utf8');
        const data = JSON.parse(raw);
        if (data && data.main && data.eq) {
            if (!data.playlist) {
                data.playlist = fallback.playlist;
            }
            if (!data.visualizer) {
                const pl = data.playlist || fallback.playlist;
                data.visualizer = {
                    x: pl.x,
                    y: pl.y + (pl.height || PLAYLIST_DEFAULT_HEIGHT),
                    width: PANEL_WIDTH,
                    height: VIZ_DEFAULT_HEIGHT
                };
            }
            data.version = LAYOUT_VERSION;
            return sanitizeV2Layout(data);
        }
    } catch (_) {
        /* no saved layout */
    }
    return fallback;
}

function saveLayout(layout) {
    try {
        fs.writeFileSync(getLayoutPath(), JSON.stringify(layout, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to save v2 layout:', err);
    }
}

module.exports = { LAYOUT_VERSION, loadLayout, saveLayout, defaultLayout, getLayoutPath };
