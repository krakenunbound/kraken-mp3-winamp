/* Kraken MP3 v2 — app-wide particle overlay (click-through) */

const { ipcRenderer } = require('electron');
const { createParticleSystem } = require('../shared/particleSystem');

const bubblesCanvas = document.getElementById('bubblesCanvas');
const particlesCanvas = document.getElementById('particlesCanvas');
const particles = createParticleSystem(bubblesCanvas, particlesCanvas);

particles.init();

let overlayActive = false;
let lastTime = 0;

function animationLoop(time = 0) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (overlayActive) {
        particles.tick(dt, time);
    }
    requestAnimationFrame(animationLoop);
}
requestAnimationFrame(animationLoop);

ipcRenderer.on('kraken:overlay:resize', (_event, payload) => {
    if (!payload) return;
    particles.resize(payload.width, payload.height);
    overlayActive = true;
});

ipcRenderer.on('kraken:overlay:hide', () => {
    overlayActive = false;
});

ipcRenderer.on('kraken:effects:sync', (_event, state) => {
    if (!state) return;
    particles.setState({
        effect: state.effect,
        effectSettings: state.effectSettings,
        theme: state.theme
    });
});

ipcRenderer.on('kraken:effects:burst', () => {
    particles.triggerBurst();
});
