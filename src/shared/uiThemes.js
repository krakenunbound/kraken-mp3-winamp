/**
 * UI + viz + particle theme presets (single source of truth).
 */

const PRESET_IDS = ['kraken', 'grayscale', 'purple', 'red', 'blue', 'orange', 'green', 'pink'];

const PRESETS = {
    kraken: {
        name: 'Kraken',
        hueBase: 190, hueRange: 40, saturation: 80,
        accentRgb: [59, 158, 190], bubbleHighRgb: [120, 200, 255], rainRgb: [150, 200, 255],
        css: {
            '--panel-bg': 'rgba(20, 28, 40, 0.75)', '--panel-bg-dark': 'rgba(10, 16, 24, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(26, 58, 85, 0.8) 0%, rgba(14, 32, 53, 0.8) 100%)',
            '--bevel-light': '#2a4060', '--bevel-dark': '#050c14',
            '--lcd-bg': 'rgba(6, 14, 20, 0.7)', '--lcd-text': '#3ce0f8', '--lcd-text-dim': '#0a6070',
            '--lcd-glow': 'rgba(60, 224, 248, 0.5)', '--lcd-glow-soft': 'rgba(60, 224, 248, 0.25)',
            '--accent': '#3b9ebe', '--accent-bright': '#4fc8e8', '--accent-glow': 'rgba(59, 158, 190, 0.45)',
            '--text-hi': '#d8eaf8', '--text-mid': '#7a9ab8', '--text-lo': '#3a5878',
            '--btn-bg': 'rgba(17, 26, 38, 0.8)', '--btn-hover': '#1a2a3c', '--btn-active-bg': 'rgba(59,158,190,0.18)',
            '--pl-row-odd': 'rgba(8,16,26,0.7)', '--pl-row-even': 'rgba(12,22,34,0.7)',
            '--pl-active': 'rgba(59,158,190,0.22)', '--pl-selected': 'rgba(59,158,190,0.12)',
            '--danger': '#e03333'
        }
    },
    grayscale: {
        name: 'Gray',
        hueBase: 0, hueRange: 0, saturation: 0,
        accentRgb: [160, 160, 160], bubbleHighRgb: [200, 200, 200], rainRgb: [180, 180, 180],
        css: {
            '--panel-bg': 'rgba(28, 28, 28, 0.75)', '--panel-bg-dark': 'rgba(14, 14, 14, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(50, 50, 50, 0.8) 0%, rgba(30, 30, 30, 0.8) 100%)',
            '--bevel-light': '#505050', '--bevel-dark': '#0a0a0a',
            '--lcd-bg': 'rgba(10, 10, 10, 0.7)', '--lcd-text': '#d2d2d2', '--lcd-text-dim': '#555555',
            '--lcd-glow': 'rgba(210, 210, 210, 0.5)', '--lcd-glow-soft': 'rgba(210, 210, 210, 0.25)',
            '--accent': '#a0a0a0', '--accent-bright': '#c8c8c8', '--accent-glow': 'rgba(160, 160, 160, 0.45)',
            '--text-hi': '#e8e8e8', '--text-mid': '#999999', '--text-lo': '#5a5a5a',
            '--btn-bg': 'rgba(26, 26, 26, 0.8)', '--btn-hover': '#333333', '--btn-active-bg': 'rgba(160,160,160,0.18)',
            '--pl-row-odd': 'rgba(14,14,14,0.7)', '--pl-row-even': 'rgba(20,20,20,0.7)',
            '--pl-active': 'rgba(160,160,160,0.22)', '--pl-selected': 'rgba(160,160,160,0.12)',
            '--danger': '#e03333'
        }
    },
    purple: {
        name: 'Purple',
        hueBase: 270, hueRange: 40, saturation: 80,
        accentRgb: [140, 80, 200], bubbleHighRgb: [180, 140, 255], rainRgb: [170, 150, 255],
        css: {
            '--panel-bg': 'rgba(28, 20, 40, 0.75)', '--panel-bg-dark': 'rgba(16, 10, 24, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(50, 26, 85, 0.8) 0%, rgba(30, 14, 53, 0.8) 100%)',
            '--bevel-light': '#4a2a70', '--bevel-dark': '#0a050f',
            '--lcd-bg': 'rgba(12, 6, 20, 0.7)', '--lcd-text': '#c88cff', '--lcd-text-dim': '#5a2a80',
            '--lcd-glow': 'rgba(200, 140, 255, 0.5)', '--lcd-glow-soft': 'rgba(200, 140, 255, 0.25)',
            '--accent': '#8c50c8', '--accent-bright': '#af6eeb', '--accent-glow': 'rgba(140, 80, 200, 0.45)',
            '--text-hi': '#ecdcf8', '--text-mid': '#9a7ab8', '--text-lo': '#5a3a78',
            '--btn-bg': 'rgba(26, 17, 38, 0.8)', '--btn-hover': '#2c1a3c', '--btn-active-bg': 'rgba(140,80,200,0.18)',
            '--pl-row-odd': 'rgba(16,8,26,0.7)', '--pl-row-even': 'rgba(22,12,34,0.7)',
            '--pl-active': 'rgba(140,80,200,0.22)', '--pl-selected': 'rgba(140,80,200,0.12)',
            '--danger': '#e03333'
        }
    },
    red: {
        name: 'Crimson',
        hueBase: 0, hueRange: 30, saturation: 80,
        accentRgb: [200, 60, 60], bubbleHighRgb: [255, 140, 140], rainRgb: [255, 150, 150],
        css: {
            '--panel-bg': 'rgba(40, 20, 20, 0.75)', '--panel-bg-dark': 'rgba(24, 10, 10, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(85, 26, 26, 0.8) 0%, rgba(53, 14, 14, 0.8) 100%)',
            '--bevel-light': '#703030', '--bevel-dark': '#0f0505',
            '--lcd-bg': 'rgba(20, 6, 6, 0.7)', '--lcd-text': '#ff6464', '--lcd-text-dim': '#802020',
            '--lcd-glow': 'rgba(255, 100, 100, 0.5)', '--lcd-glow-soft': 'rgba(255, 100, 100, 0.25)',
            '--accent': '#c83c3c', '--accent-bright': '#eb5a5a', '--accent-glow': 'rgba(200, 60, 60, 0.45)',
            '--text-hi': '#f8dada', '--text-mid': '#b87a7a', '--text-lo': '#783a3a',
            '--btn-bg': 'rgba(38, 17, 17, 0.8)', '--btn-hover': '#3c1a1a', '--btn-active-bg': 'rgba(200,60,60,0.18)',
            '--pl-row-odd': 'rgba(26,8,8,0.7)', '--pl-row-even': 'rgba(34,12,12,0.7)',
            '--pl-active': 'rgba(200,60,60,0.22)', '--pl-selected': 'rgba(200,60,60,0.12)',
            '--danger': '#e03333'
        }
    },
    blue: {
        name: 'Sapphire',
        hueBase: 220, hueRange: 40, saturation: 80,
        accentRgb: [60, 100, 200], bubbleHighRgb: [130, 180, 255], rainRgb: [140, 180, 255],
        css: {
            '--panel-bg': 'rgba(20, 24, 40, 0.75)', '--panel-bg-dark': 'rgba(10, 12, 24, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(26, 38, 85, 0.8) 0%, rgba(14, 20, 53, 0.8) 100%)',
            '--bevel-light': '#2a3a70', '--bevel-dark': '#05080f',
            '--lcd-bg': 'rgba(6, 10, 20, 0.7)', '--lcd-text': '#64a0ff', '--lcd-text-dim': '#203870',
            '--lcd-glow': 'rgba(100, 160, 255, 0.5)', '--lcd-glow-soft': 'rgba(100, 160, 255, 0.25)',
            '--accent': '#3c64c8', '--accent-bright': '#5a87eb', '--accent-glow': 'rgba(60, 100, 200, 0.45)',
            '--text-hi': '#dae4f8', '--text-mid': '#7a8eb8', '--text-lo': '#3a4e78',
            '--btn-bg': 'rgba(17, 20, 38, 0.8)', '--btn-hover': '#1a223c', '--btn-active-bg': 'rgba(60,100,200,0.18)',
            '--pl-row-odd': 'rgba(8,12,26,0.7)', '--pl-row-even': 'rgba(12,18,34,0.7)',
            '--pl-active': 'rgba(60,100,200,0.22)', '--pl-selected': 'rgba(60,100,200,0.12)',
            '--danger': '#e03333'
        }
    },
    orange: {
        name: 'Amber',
        hueBase: 30, hueRange: 30, saturation: 80,
        accentRgb: [200, 130, 40], bubbleHighRgb: [255, 200, 120], rainRgb: [255, 210, 150],
        css: {
            '--panel-bg': 'rgba(40, 30, 20, 0.75)', '--panel-bg-dark': 'rgba(24, 16, 10, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(85, 58, 26, 0.8) 0%, rgba(53, 32, 14, 0.8) 100%)',
            '--bevel-light': '#705028', '--bevel-dark': '#0f0a05',
            '--lcd-bg': 'rgba(20, 12, 6, 0.7)', '--lcd-text': '#ffbe50', '--lcd-text-dim': '#805820',
            '--lcd-glow': 'rgba(255, 190, 80, 0.5)', '--lcd-glow-soft': 'rgba(255, 190, 80, 0.25)',
            '--accent': '#c88228', '--accent-bright': '#eba53c', '--accent-glow': 'rgba(200, 130, 40, 0.45)',
            '--text-hi': '#f8ecd8', '--text-mid': '#b89a7a', '--text-lo': '#78583a',
            '--btn-bg': 'rgba(38, 26, 17, 0.8)', '--btn-hover': '#3c2a1a', '--btn-active-bg': 'rgba(200,130,40,0.18)',
            '--pl-row-odd': 'rgba(26,16,8,0.7)', '--pl-row-even': 'rgba(34,22,12,0.7)',
            '--pl-active': 'rgba(200,130,40,0.22)', '--pl-selected': 'rgba(200,130,40,0.12)',
            '--danger': '#e03333'
        }
    },
    green: {
        name: 'Emerald',
        hueBase: 140, hueRange: 40, saturation: 80,
        accentRgb: [40, 180, 100], bubbleHighRgb: [120, 235, 180], rainRgb: [150, 240, 200],
        css: {
            '--panel-bg': 'rgba(20, 36, 28, 0.75)', '--panel-bg-dark': 'rgba(10, 20, 14, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(26, 75, 50, 0.8) 0%, rgba(14, 45, 30, 0.8) 100%)',
            '--bevel-light': '#2a6048', '--bevel-dark': '#050f0a',
            '--lcd-bg': 'rgba(6, 18, 12, 0.7)', '--lcd-text': '#50f096', '--lcd-text-dim': '#1a6840',
            '--lcd-glow': 'rgba(80, 240, 150, 0.5)', '--lcd-glow-soft': 'rgba(80, 240, 150, 0.25)',
            '--accent': '#28b464', '--accent-bright': '#3cd782', '--accent-glow': 'rgba(40, 180, 100, 0.45)',
            '--text-hi': '#d8f8e8', '--text-mid': '#7ab898', '--text-lo': '#3a7858',
            '--btn-bg': 'rgba(17, 34, 24, 0.8)', '--btn-hover': '#1a3c28', '--btn-active-bg': 'rgba(40,180,100,0.18)',
            '--pl-row-odd': 'rgba(8,22,14,0.7)', '--pl-row-even': 'rgba(12,30,20,0.7)',
            '--pl-active': 'rgba(40,180,100,0.22)', '--pl-selected': 'rgba(40,180,100,0.12)',
            '--danger': '#e03333'
        }
    },
    pink: {
        name: 'Rose',
        hueBase: 330, hueRange: 40, saturation: 80,
        accentRgb: [200, 70, 130], bubbleHighRgb: [255, 160, 210], rainRgb: [255, 180, 210],
        css: {
            '--panel-bg': 'rgba(40, 20, 30, 0.75)', '--panel-bg-dark': 'rgba(24, 10, 16, 0.85)',
            '--panel-title-bg': 'linear-gradient(180deg, rgba(85, 26, 55, 0.8) 0%, rgba(53, 14, 34, 0.8) 100%)',
            '--bevel-light': '#702a50', '--bevel-dark': '#0f0508',
            '--lcd-bg': 'rgba(20, 6, 12, 0.7)', '--lcd-text': '#ff82be', '--lcd-text-dim': '#80284a',
            '--lcd-glow': 'rgba(255, 130, 190, 0.5)', '--lcd-glow-soft': 'rgba(255, 130, 190, 0.25)',
            '--accent': '#c84682', '--accent-bright': '#eb64a0', '--accent-glow': 'rgba(200, 70, 130, 0.45)',
            '--text-hi': '#f8dae8', '--text-mid': '#b87a98', '--text-lo': '#783a58',
            '--btn-bg': 'rgba(38, 17, 26, 0.8)', '--btn-hover': '#3c1a2a', '--btn-active-bg': 'rgba(200,70,130,0.18)',
            '--pl-row-odd': 'rgba(26,8,16,0.7)', '--pl-row-even': 'rgba(34,12,22,0.7)',
            '--pl-active': 'rgba(200,70,130,0.22)', '--pl-selected': 'rgba(200,70,130,0.12)',
            '--danger': '#e03333'
        }
    }
};

/** Keys users can override in the custom theme editor */
const CUSTOM_COLOR_KEYS = [
    { key: '--accent', label: 'Accent' },
    { key: '--accent-bright', label: 'Accent bright' },
    { key: '--lcd-text', label: 'Display / LCD text' },
    { key: '--text-hi', label: 'Primary text' },
    { key: '--text-mid', label: 'Secondary text' },
    { key: '--btn-bg', label: 'Button face' },
    { key: '--btn-hover', label: 'Button hover' },
    { key: '--slider-thumb', label: 'Slider / lever thumb' },
    { key: '--slider-fill', label: 'Slider fill' },
    { key: '--viz-bar', label: 'Visualizer bars' },
    { key: '--panel-bg', label: 'Panel background' },
    { key: '--panel-title-bg', label: 'Title bar (use solid color)' }
];

function expandGranularCss(baseCss) {
    const accent = baseCss['--accent'];
    const accentBright = baseCss['--accent-bright'];
    const lcdText = baseCss['--lcd-text'];
    const derived = {
        '--btn-text': baseCss['--text-mid'],
        '--btn-text-hover': accentBright,
        '--btn-text-active': lcdText,
        '--btn-border': baseCss['--accent-glow'],
        '--slider-track': baseCss['--lcd-bg'],
        '--slider-thumb': accent,
        '--slider-fill': accent,
        '--eq-lever': accent,
        '--eq-lever-border': accent,
        '--viz-bar': accent,
        '--viz-bar-bright': accentBright,
        '--viz-bar-glow': baseCss['--accent-glow'],
        '--progress-fill-start': accent,
        '--progress-fill-end': accentBright,
        '--mini-viz-bar': accent
    };
    return { ...derived, ...baseCss };
}

function getPreset(themeId) {
    return PRESETS[themeId] || PRESETS.kraken;
}

function getVizTheme(themeId) {
    const p = getPreset(themeId);
    return {
        hueBase: p.hueBase,
        hueRange: p.hueRange,
        saturation: p.saturation,
        accentRgb: [...p.accentRgb]
    };
}

function getParticleTheme(themeId) {
    const p = getPreset(themeId);
    return {
        hueBase: p.hueBase,
        hueRange: p.hueRange,
        saturation: p.saturation,
        accentRgb: [...p.accentRgb],
        bubbleHighRgb: [...p.bubbleHighRgb],
        rainRgb: [...p.rainRgb]
    };
}

/**
 * @param {string} themeId
 * @param {Record<string,string>} [customColors]
 */
function buildThemePayload(themeId, customColors = {}) {
    const preset = getPreset(themeId);
    const css = expandGranularCss({ ...preset.css, ...customColors });
    return {
        themeId,
        css,
        viz: getVizTheme(themeId),
        particle: getParticleTheme(themeId)
    };
}

function applyThemePayload(target, payload) {
    if (!target || !payload) return;
    const doc = target.documentElement ? target : target;
    const root = doc.documentElement;
    const body = doc.body;
    const css = payload.css || {};

    for (const el of [root, body]) {
        if (!el) continue;
        el.classList.remove('theme-rounded');
        el.classList.add('theme-square');
    }

    for (const [prop, value] of Object.entries(css)) {
        if (value != null && value !== '') {
            root.style.setProperty(prop, value);
        }
    }
}

/** When magnetically docked, force square panel shells so seams match classic Winamp. */
function applyDockStackChrome(target, panelId, dockState) {
    if (!target || !panelId || !dockState) return;
    const doc = target.documentElement ? target : target;
    const info = dockState[panelId];
    const inStack = !!(info && (info.parent || (info.children && info.children.length > 0)));
    for (const el of [doc.documentElement, doc.body]) {
        if (!el) continue;
        el.classList.toggle('dock-stack-flush', inStack);
    }
}

module.exports = {
    PRESET_IDS,
    PRESETS,
    CUSTOM_COLOR_KEYS,
    expandGranularCss,
    getPreset,
    getVizTheme,
    getParticleTheme,
    buildThemePayload,
    applyThemePayload,
    applyDockStackChrome
};
