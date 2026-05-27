const fs = require('fs');
const path = require('path');

const uiThemesPath = path.join(__dirname, '../src/shared/uiThemes.js');
const outPath = path.join(__dirname, '../src/shared/colorThemes.js');
const { PRESETS } = require(uiThemesPath);

const particle = {};
for (const [id, t] of Object.entries(PRESETS)) {
    particle[id] = {
        hueBase: t.hueBase,
        hueRange: t.hueRange,
        saturation: t.saturation,
        accentRgb: t.accentRgb,
        bubbleHighRgb: t.bubbleHighRgb,
        rainRgb: t.rainRgb
    };
}

const out = `/** Particle + viz color data extracted from renderer COLOR_THEMES */\nconst PARTICLE_THEMES = ${JSON.stringify(particle, null, 4)};\n\nfunction getParticleTheme(themeId) {\n    return PARTICLE_THEMES[themeId] || PARTICLE_THEMES.kraken;\n}\n\nmodule.exports = { PARTICLE_THEMES, getParticleTheme };\n`;
fs.writeFileSync(outPath, out);
console.log('Wrote', outPath);
