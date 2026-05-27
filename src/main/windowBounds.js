const { screen } = require('electron');
const {
    migrateLinksFromLayout,
    getRoots,
    getChildren,
    expectedChildBounds
} = require('./dockGraph');

const EQ_DOCKED_HEIGHT = 155;
const EQ_MAX_HEIGHT = 220;
const PLAYLIST_DEFAULT_HEIGHT = 280;
const PLAYLIST_MIN_HEIGHT = 120;
const PLAYLIST_MAX_HEIGHT = 550;
const VIZ_DEFAULT_HEIGHT = 200;
const VIZ_MIN_HEIGHT = 120;
const VIZ_MAX_HEIGHT = 420;
const MAIN_DEFAULT_HEIGHT = 190;
const PANEL_WIDTH = 500;

function getWorkAreaForPoint(x, y) {
    const display = screen.getDisplayNearestPoint({ x: x ?? 0, y: y ?? 0 });
    return display.workArea;
}

function clampBounds(bounds, limits = {}) {
    const minW = limits.minWidth ?? PANEL_WIDTH;
    const maxW = limits.maxWidth ?? 600;
    const minH = limits.minHeight ?? 100;
    const maxH = limits.maxHeight ?? 1000;
    const defaultH = limits.defaultHeight ?? minH;

    let { x, y, width, height } = bounds;
    width = Math.min(Math.max(width || minW, minW), maxW);
    height = Math.min(Math.max(height || defaultH, minH), maxH);

    const area = getWorkAreaForPoint(x, y);
    if (x < area.x) x = area.x;
    if (y < area.y) y = area.y;
    if (x + width > area.x + area.width) x = Math.max(area.x, area.x + area.width - width);
    if (y + height > area.y + area.height) y = Math.max(area.y, area.y + area.height - height);

    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function migrateDockFlags(dock) {
    if (!dock) {
        return { mainPlaylist: true, playlistViz: true, vizEq: true, eqToMain: false };
    }
    if (dock.playlistViz !== undefined) {
        return {
            mainPlaylist: dock.mainPlaylist !== false,
            playlistViz: dock.playlistViz !== false,
            vizEq: dock.vizEq !== false,
            eqToMain: !!dock.eqToMain
        };
    }
    const legacyEq = dock.playlistEq !== false;
    return {
        mainPlaylist: dock.mainPlaylist !== false,
        playlistViz: legacyEq,
        vizEq: legacyEq,
        eqToMain: !!dock.eqToMain
    };
}

function sanitizeV2Layout(layout) {
    const main = clampBounds(layout.main || { x: 120, y: 80, width: PANEL_WIDTH, height: MAIN_DEFAULT_HEIGHT }, {
        minWidth: PANEL_WIDTH,
        maxWidth: 600,
        minHeight: 145,
        maxHeight: 400,
        defaultHeight: MAIN_DEFAULT_HEIGHT
    });

    const playlist = clampBounds(layout.playlist || {}, {
        minWidth: PANEL_WIDTH,
        maxWidth: 600,
        minHeight: PLAYLIST_MIN_HEIGHT,
        maxHeight: PLAYLIST_MAX_HEIGHT,
        defaultHeight: PLAYLIST_DEFAULT_HEIGHT
    });
    playlist.width = main.width;
    playlist.height = playlist.height || PLAYLIST_DEFAULT_HEIGHT;

    const visualizer = clampBounds(layout.visualizer || {}, {
        minWidth: PANEL_WIDTH,
        maxWidth: 600,
        minHeight: VIZ_MIN_HEIGHT,
        maxHeight: VIZ_MAX_HEIGHT,
        defaultHeight: VIZ_DEFAULT_HEIGHT
    });
    visualizer.width = main.width;
    visualizer.height = visualizer.height || VIZ_DEFAULT_HEIGHT;

    const eq = clampBounds(layout.eq || {}, {
        minWidth: PANEL_WIDTH,
        maxWidth: 600,
        minHeight: EQ_DOCKED_HEIGHT,
        maxHeight: EQ_MAX_HEIGHT,
        defaultHeight: EQ_DOCKED_HEIGHT
    });
    eq.width = main.width;
    eq.height = EQ_DOCKED_HEIGHT;

    const links = migrateLinksFromLayout(layout);
    const bounds = { main, playlist, visualizer, eq };

    const placeFrom = (rootId) => {
        const walk = (parentId) => {
            for (const childId of getChildren(links, parentId)) {
                const link = links[childId];
                const parentB = bounds[parentId];
                const childB = bounds[childId];
                const next = expectedChildBounds(parentB, childB, link.edge);
                if (next) {
                    bounds[childId] = {
                        ...childB,
                        x: Math.round(next.x),
                        y: Math.round(next.y),
                        width: Math.round(next.width),
                        height: Math.round(next.height)
                    };
                }
                walk(childId);
            }
        };
        walk(rootId);
    };

    for (const rootId of getRoots(links)) {
        placeFrom(rootId);
    }

    const area = getWorkAreaForPoint(main.x, main.y);
    let maxBottom = main.y + main.height;
    for (const id of ['main', 'playlist', 'visualizer', 'eq']) {
        const b = bounds[id];
        maxBottom = Math.max(maxBottom, b.y + b.height);
    }

    if (maxBottom > area.y + area.height) {
        const overflow = maxBottom - (area.y + area.height);
        main.y = Math.max(area.y, main.y - overflow);
        for (const rootId of getRoots(links)) {
            placeFrom(rootId);
        }
    }

    return {
        version: 5,
        dockGraph: { links },
        main: bounds.main,
        playlist: bounds.playlist,
        visualizer: bounds.visualizer,
        eq: bounds.eq
    };
}

module.exports = {
    PANEL_WIDTH,
    EQ_DOCKED_HEIGHT,
    PLAYLIST_DEFAULT_HEIGHT,
    PLAYLIST_MIN_HEIGHT,
    VIZ_DEFAULT_HEIGHT,
    VIZ_MIN_HEIGHT,
    VIZ_MAX_HEIGHT,
    MAIN_DEFAULT_HEIGHT,
    clampBounds,
    sanitizeV2Layout,
    getWorkAreaForPoint
};
