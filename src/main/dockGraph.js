const SNAP_PX = 18;
const BREAK_MULT = 2.2;

const PANEL_IDS = ['main', 'playlist', 'visualizer', 'eq'];

const EDGES = ['south', 'north', 'east', 'west'];

/**
 * @typedef {{ parent: string, edge: string }} DockLink
 */

function emptyLinks() {
    return {};
}

/** @returns {Record<string, DockLink>} */
function migrateLinksFromLayout(layout) {
    if (layout?.dockGraph?.links && typeof layout.dockGraph.links === 'object') {
        return sanitizeLinks(layout.dockGraph.links);
    }

    const links = {};
    const dock = layout?.dock || {};
    if (dock.mainPlaylist !== false) {
        links.eq = { parent: 'main', edge: 'south' };
        if (dock.playlistViz !== false) {
            links.playlist = { parent: 'eq', edge: 'south' };
            if (dock.vizEq !== false) {
                links.visualizer = { parent: 'playlist', edge: 'south' };
            }
        } else if (dock.vizEq !== false) {
            links.playlist = { parent: 'eq', edge: 'south' };
        }
    } else if (dock.eqToMain) {
        links.eq = { parent: 'main', edge: 'south' };
    }
    return links;
}

function sanitizeLinks(raw) {
    const links = {};
    for (const [child, link] of Object.entries(raw || {})) {
        if (!PANEL_IDS.includes(child) || !link || !PANEL_IDS.includes(link.parent)) continue;
        if (child === link.parent) continue;
        const edge = EDGES.includes(link.edge) ? link.edge : 'south';
        links[child] = { parent: link.parent, edge };
    }
    return links;
}

function getChildren(links, panelId) {
    return PANEL_IDS.filter((id) => links[id]?.parent === panelId);
}

function getRoot(links, panelId) {
    let current = panelId;
    const seen = new Set();
    while (links[current]) {
        if (seen.has(current)) break;
        seen.add(current);
        current = links[current].parent;
    }
    return current;
}

function getRoots(links) {
    const withParent = new Set(Object.keys(links));
    return PANEL_IDS.filter((id) => !withParent.has(id));
}

function getComponentPanels(links, fromPanel) {
    const root = getRoot(links, fromPanel);
    const out = new Set([root]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of PANEL_IDS) {
            if (links[id] && out.has(links[id].parent) && !out.has(id)) {
                out.add(id);
                changed = true;
            }
        }
    }
    return [...out];
}

function isFullyDocked(links) {
    return getComponentPanels(links, 'main').length === PANEL_IDS.length;
}

function panelLocked(links, panelId) {
    return !!links[panelId] || getChildren(links, panelId).length > 0;
}

function wouldCreateCycle(links, childId, parentId) {
    let p = parentId;
    const seen = new Set();
    while (p) {
        if (p === childId) return true;
        if (seen.has(p)) break;
        seen.add(p);
        p = links[p]?.parent;
    }
    return false;
}

/** Remove only this panel's link to its parent; children stay on this panel as subtree root. */
function detachPanel(links, panelId) {
    delete links[panelId];
}

function detachChildren(links, panelId) {
    for (const id of getChildren(links, panelId)) {
        delete links[id];
        detachChildren(links, id);
    }
}

function attachPanel(links, childId, parentId, edge) {
    if (childId === parentId) return false;
    if (wouldCreateCycle(links, childId, parentId)) {
        let p = parentId;
        while (p && p !== childId) {
            const next = links[p]?.parent;
            delete links[p];
            p = next;
        }
    }
    delete links[childId];
    links[childId] = { parent: parentId, edge: EDGES.includes(edge) ? edge : 'south' };
    return true;
}

function expectedChildBounds(parentB, childB, edge) {
    const w = childB.width;
    const h = childB.height;
    switch (edge) {
        case 'south':
            return {
                x: parentB.x,
                y: parentB.y + parentB.height,
                width: parentB.width,
                height: h
            };
        case 'north':
            return {
                x: parentB.x,
                y: parentB.y - h,
                width: parentB.width,
                height: h
            };
        case 'east':
            return {
                x: parentB.x + parentB.width,
                y: parentB.y,
                width: w,
                height: parentB.height
            };
        case 'west':
            return {
                x: parentB.x - w,
                y: parentB.y,
                width: w,
                height: parentB.height
            };
        default:
            return null;
    }
}

function attachmentGap(parentB, childB, edge) {
    const exp = expectedChildBounds(parentB, childB, edge);
    if (!exp) return Infinity;
    const gap =
        edge === 'south' || edge === 'north'
            ? Math.abs(childB.y - exp.y)
            : Math.abs(childB.x - exp.x);
    const align =
        edge === 'south' || edge === 'north'
            ? Math.abs(childB.x - exp.x)
            : Math.abs(childB.y - exp.y);
    return gap + align * 0.5;
}

function isAttached(parentB, childB, edge, snapPx = SNAP_PX) {
    const exp = expectedChildBounds(parentB, childB, edge);
    if (!exp) return false;
    const gap =
        edge === 'south' || edge === 'north'
            ? Math.abs(childB.y - exp.y)
            : Math.abs(childB.x - exp.x);
    const align =
        edge === 'south' || edge === 'north'
            ? Math.abs(childB.x - exp.x)
            : Math.abs(childB.y - exp.y);
    return gap <= snapPx && align <= snapPx;
}

function isBroken(parentB, childB, edge, snapPx = SNAP_PX) {
    return attachmentGap(parentB, childB, edge) > snapPx * BREAK_MULT;
}

/**
 * Find best magnetic snap for a moving panel against others.
 * @param {string} movingId
 * @param {Record<string, {x,y,width,height}>} boundsMap
 * @param {Record<string, DockLink>} links
 */
function findSnapTarget(movingId, boundsMap, links) {
    const movingB = boundsMap[movingId];
    if (!movingB) return null;

    let best = null;
    let bestScore = SNAP_PX + 1;

    for (const targetId of PANEL_IDS) {
        if (targetId === movingId) continue;
        const targetB = boundsMap[targetId];
        if (!targetB) continue;

        for (const edge of EDGES) {
            const exp = expectedChildBounds(targetB, movingB, edge);
            if (!exp) continue;
            const gap =
                edge === 'south' || edge === 'north'
                    ? Math.abs(movingB.y - exp.y)
                    : Math.abs(movingB.x - exp.x);
            const align =
                edge === 'south' || edge === 'north'
                    ? Math.abs(movingB.x - exp.x)
                    : Math.abs(movingB.y - exp.y);
            const score = gap + align;
            if (gap <= SNAP_PX && align <= SNAP_PX && score < bestScore) {
                if (wouldCreateCycle(links, movingId, targetId)) continue;
                bestScore = score;
                best = { parent: targetId, edge, score };
            }
        }
    }
    return best;
}

function parentPositionForChild(childB, parentB, edge) {
    switch (edge) {
        case 'south':
            return { x: childB.x, y: childB.y - parentB.height };
        case 'north':
            return { x: childB.x, y: childB.y + childB.height };
        case 'east':
            return { x: childB.x - parentB.width, y: childB.y };
        case 'west':
            return { x: childB.x + childB.width, y: childB.y };
        default:
            return { x: parentB.x, y: parentB.y };
    }
}

function buildDockState(links) {
    const docked = isFullyDocked(links);
    const state = { docked, links: { ...links } };
    for (const id of PANEL_IDS) {
        const link = links[id];
        state[id] = {
            locked: panelLocked(links, id),
            parent: link?.parent || null,
            edge: link?.edge || null,
            children: getChildren(links, id)
        };
    }
    return state;
}

module.exports = {
    SNAP_PX,
    BREAK_MULT,
    PANEL_IDS,
    EDGES,
    emptyLinks,
    migrateLinksFromLayout,
    sanitizeLinks,
    getChildren,
    getRoot,
    getRoots,
    getComponentPanels,
    isFullyDocked,
    panelLocked,
    wouldCreateCycle,
    detachPanel,
    detachChildren,
    attachPanel,
    expectedChildBounds,
    isAttached,
    isBroken,
    findSnapTarget,
    parentPositionForChild,
    buildDockState
};
