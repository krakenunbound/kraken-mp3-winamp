const fs = require('fs');
const path = require('path');

const rendererPath = path.join(__dirname, '../src/renderer.js');
const outPath = path.join(__dirname, '../src/shared/particleSystem.js');
const lines = fs.readFileSync(rendererPath, 'utf8').split(/\r?\n/);

function findLine(needle, after = 0) {
    return lines.findIndex((l, i) => i >= after && l.includes(needle));
}

const s1 = findLine('function initEffectParticles');
const e1 = findLine('// FLOATING ALBUM ART');
const s2 = findLine('function drawEffectParticles');
const e2 = findLine('// BURST PARTICLES');
const s3 = findLine('function createBurstParticle');
const e3 = findLine('// AUDIO VISUALIZERS');

let body = [
    ...lines.slice(s1, e1),
    ...lines.slice(s2, e2),
    ...lines.slice(s3, e3)
].join('\n');

body = body
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : line))
    .join('\n');

body = body.replace(/const canvas = bubblesCanvas;/g, 'const canvas = canvasSize();');
body = body.replace(/const canvas = bubblesCanvas \|\| \{ width: 500, height: 600 \};/g, 'const canvas = canvasSize();');
body = body.replace(/if \(!bubblesCanvas && !isV2Docking\) return;/g, "if (currentEffect === 'none') return;");

body = body.replace(
    /function triggerTrackChangeEffect\(\)[\s\S]*?\n    \}/m,
    `function triggerTrackChangeEffect() {
        const centerX = canvasW / 2;
        const centerY = canvasH / 2;
        for (let i = 0; i < 40; i++) {
            burstParticles.push(createBurstParticle(centerX, centerY));
        }
    }`
);

const header = `const { PARTICLE_THEMES } = require('./colorThemes');

function createParticleSystem(bubblesCanvas, particlesCanvas) {
    let currentEffect = 'bubbles';
    let effectSettings = { quantity: 25, size: 8, speed: 30 };
    let activeThemeColors = PARTICLE_THEMES.kraken;
    let effectParticles = [];
    let burstParticles = [];
    let bubblesCtx = null;
    let particlesCtx = null;
    let canvasW = 500;
    let canvasH = 600;

    function canvasSize() {
        return { width: canvasW, height: canvasH };
    }

    function init() {
        if (!bubblesCanvas || !particlesCanvas) return;
        bubblesCtx = bubblesCanvas.getContext('2d');
        particlesCtx = particlesCanvas.getContext('2d');
        resize(canvasW, canvasH);
        initEffectParticles();
    }

    function resize(w, h) {
        canvasW = Math.max(1, w | 0);
        canvasH = Math.max(1, h | 0);
        if (bubblesCanvas) {
            bubblesCanvas.width = canvasW;
            bubblesCanvas.height = canvasH;
        }
        if (particlesCanvas) {
            particlesCanvas.width = canvasW;
            particlesCanvas.height = canvasH;
        }
    }

    function setState(state) {
        if (!state) return;
        if (state.effect !== undefined) currentEffect = state.effect;
        if (state.effectSettings) effectSettings = { ...state.effectSettings };
        if (state.theme && PARTICLE_THEMES[state.theme]) {
            activeThemeColors = PARTICLE_THEMES[state.theme];
        }
        initEffectParticles();
    }

    function tick(dt, time) {
        if (!bubblesCtx) return;
        bubblesCtx.clearRect(0, 0, canvasW, canvasH);
        if (particlesCtx) particlesCtx.clearRect(0, 0, canvasW, canvasH);
        if (currentEffect !== 'none') drawEffectParticles(dt, time);
        drawBurstParticles(dt);
    }

    function triggerBurst() {
        triggerTrackChangeEffect();
    }

`;

const footer = `
    return { init, resize, setState, tick, triggerBurst };
}

module.exports = { createParticleSystem, PARTICLE_THEMES };
`;

fs.writeFileSync(outPath, header + body + footer);
console.log('Wrote', outPath);
