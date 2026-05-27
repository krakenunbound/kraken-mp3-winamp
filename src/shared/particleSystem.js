const { PARTICLE_THEMES } = require('./colorThemes');

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

    function initEffectParticles() {
        effectParticles = [];
        if (currentEffect === 'none') return;
        const count = effectSettings.quantity;

        for (let i = 0; i < count; i++) {
            effectParticles.push(createEffectParticle(true));
        }
    }

    // ============================================================================
    // PARTICLE EFFECT CREATORS
    // Slider ranges: quantity 5-100, size 1-20, speed 1-100
    // We scale these so middle values (50) feel natural
    // ============================================================================
    function createEffectParticle(randomY = false) {
        const canvas = canvasSize();
        // Scale settings so slider middle (50) feels right
        const sizeScale = effectSettings.size / 10;      // 0.1 to 2.0
        const speedScale = effectSettings.speed / 50;    // 0.02 to 2.0

        switch (currentEffect) {
            case 'bubbles':
                return {
                    x: Math.random() * canvas.width,
                    y: randomY ? Math.random() * canvas.height : canvas.height + 20,
                    size: (Math.random() * 8 + 4) * sizeScale,
                    speed: (Math.random() * 20 + 15) * speedScale,
                    wobbleSpeed: Math.random() * 2 + 1,
                    wobbleAmp: Math.random() * 25 + 10,
                    wobbleOffset: Math.random() * Math.PI * 2,
                    opacity: Math.random() * 0.4 + 0.2
                };

            case 'rain':
                return {
                    x: Math.random() * canvas.width,
                    y: randomY ? Math.random() * canvas.height : -20,
                    length: (Math.random() * 15 + 10) * sizeScale,
                    speed: (Math.random() * 300 + 200) * speedScale,
                    opacity: Math.random() * 0.5 + 0.3
                };

            case 'stars':
                // Shooting stars - spawn from edges, travel toward center
                // Like kraken-radio implementation
                const buffer = 50;
                const skyHeight = canvas.height * 0.7;  // Top 70% only
                let startX, startY;
                const side = Math.floor(Math.random() * 3);

                switch (side) {
                    case 0: startX = Math.random() * canvas.width; startY = -buffer; break;  // Top
                    case 1: startX = -buffer; startY = Math.random() * skyHeight; break;     // Left
                    case 2: startX = canvas.width + buffer; startY = Math.random() * skyHeight; break; // Right
                }

                // Calculate velocity toward center
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const dx = centerX - startX;
                const dy = centerY - startY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                const duration = 0.6 + Math.random() * 0.4;  // 0.6-1.0 seconds
                const pixelsPerFrame = distance / (duration * 60);
                const starVx = (dx / distance) * pixelsPerFrame * speedScale;
                const starVy = (dy / distance) * pixelsPerFrame * speedScale;

                return {
                    x: startX,
                    y: startY,
                    vx: starVx,
                    vy: starVy,
                    tailLength: 60 + Math.random() * 80,
                    life: Math.ceil(distance / pixelsPerFrame) + 25,
                    maxLife: Math.ceil(distance / pixelsPerFrame) + 25,
                    brightness: 0.8 + Math.random() * 0.2,
                    size: (1 + Math.random()) * sizeScale
                };

            case 'embers':
                // Slow rising glowing embers
                return {
                    x: Math.random() * canvas.width,
                    y: randomY ? Math.random() * canvas.height : canvas.height + 20,
                    size: (Math.random() * 2 + 1) * sizeScale,
                    speed: (Math.random() * 8 + 5) * speedScale,  // Much slower
                    wobbleSpeed: Math.random() * 1.5 + 0.5,
                    wobbleAmp: Math.random() * 20 + 10,
                    wobbleOffset: Math.random() * Math.PI * 2,
                    hue: Math.random() * 40 + 10, // Orange-red
                    life: 1,
                    decay: 0.0003 + Math.random() * 0.0003  // Very slow fade
                };

            case 'dust':
                // Gentle floating dust motes
                return {
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: (Math.random() * 1.5 + 0.5) * sizeScale,
                    vx: (Math.random() - 0.5) * 6 * speedScale,  // Faster drift
                    vy: (Math.random() - 0.5) * 4 * speedScale,
                    wobbleSpeed: Math.random() * 0.3 + 0.1,
                    wobbleOffset: Math.random() * Math.PI * 2,
                    opacity: Math.random() * 0.2 + 0.05
                };

            case 'snow':
                // Snowflakes with 6-point star shape
                return {
                    x: Math.random() * canvas.width,
                    y: randomY ? Math.random() * canvas.height : -20,
                    size: (Math.random() * 3 + 2) * sizeScale,
                    speed: (Math.random() * 15 + 10) * speedScale,  // Gentle fall
                    wobbleSpeed: Math.random() * 1.5 + 0.5,
                    wobbleAmp: Math.random() * 20 + 10,
                    wobbleOffset: Math.random() * Math.PI * 2,
                    rotation: Math.random() * Math.PI * 2,
                    rotationSpeed: (Math.random() - 0.5) * 0.5,
                    opacity: Math.random() * 0.6 + 0.4
                };

            case 'fireflies':
                // Fireflies with proper on/off glow cycle
                return {
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    size: (Math.random() * 2 + 1) * sizeScale,
                    vx: (Math.random() - 0.5) * 5 * speedScale,
                    vy: (Math.random() - 0.5) * 5 * speedScale,
                    targetX: Math.random() * canvas.width,
                    targetY: Math.random() * canvas.height,
                    glowPhase: Math.random() * Math.PI * 2,
                    glowSpeed: Math.random() * 0.8 + 0.3,  // Slower glow cycle
                    glowOn: Math.random() > 0.5,  // Start on or off
                    glowTimer: Math.random() * 3  // Time until next toggle
                };

            default:
                return null;
        }
    }

    // ============================================================================
    function drawEffectParticles(dt, time) {
        if (!bubblesCtx) return;

        const canvas = canvasSize();
        const now = time / 1000;

        for (let i = effectParticles.length - 1; i >= 0; i--) {
            const p = effectParticles[i];
            if (!p) continue;

            switch (currentEffect) {
                case 'bubbles':
                    drawBubble(p, now, canvas, i);
                    break;
                case 'rain':
                    drawRain(p, dt, canvas, i);
                    break;
                case 'stars':
                    drawShootingStar(p, dt, canvas, i);
                    break;
                case 'embers':
                    drawEmber(p, dt, now, canvas, i);
                    break;
                case 'dust':
                    drawDust(p, dt, now, canvas, i);
                    break;
                case 'snow':
                    drawSnow(p, dt, now, canvas, i);
                    break;
                case 'fireflies':
                    drawFirefly(p, dt, now, canvas, i);
                    break;
            }
        }

        // Maintain particle count
        // Stars spawn rarely and occasionally, not constantly (like kraken-radio)
        if (currentEffect === 'stars') {
            // Very rare spawn - 0.3% chance per frame, scaled by quantity setting
            const spawnChance = 0.003 * (effectSettings.quantity / 50);
            if (Math.random() < spawnChance) {
                effectParticles.push(createEffectParticle(false));
            }
        } else {
            while (effectParticles.length < effectSettings.quantity) {
                effectParticles.push(createEffectParticle(false));
            }
        }
    }

    function drawBubble(p, now, canvas, index) {
        p.y -= p.speed * 0.016;
        const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * 0.016;
        p.x += wobble;

        // Draw bubble body
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

        const gradient = bubblesCtx.createRadialGradient(
            p.x - p.size * 0.3, p.y - p.size * 0.3, 0,
            p.x, p.y, p.size
        );
        const [hr, hg, hb] = activeThemeColors.bubbleHighRgb;
        const [ar, ag, ab] = activeThemeColors.accentRgb;
        gradient.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${p.opacity})`);
        gradient.addColorStop(0.5, `rgba(${ar}, ${ag}, ${ab}, ${p.opacity * 0.5})`);
        gradient.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, ${p.opacity * 0.1})`);

        bubblesCtx.fillStyle = gradient;
        bubblesCtx.fill();

        // Shine highlight
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(255, 255, 255, ${p.opacity * 0.7})`;
        bubblesCtx.fill();

        // Reset if off screen
        if (p.y + p.size < -10) {
            effectParticles[index] = createEffectParticle(false);
        }
    }

    function drawRain(p, dt, canvas, index) {
        p.y += p.speed * dt;

        bubblesCtx.beginPath();
        bubblesCtx.moveTo(p.x, p.y);
        bubblesCtx.lineTo(p.x + 1, p.y + p.length);
        const [rr, rg, rb] = activeThemeColors.rainRgb;
        bubblesCtx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${p.opacity})`;
        bubblesCtx.lineWidth = 1;
        bubblesCtx.stroke();

        if (p.y > canvas.height + p.length) {
            effectParticles[index] = createEffectParticle(false);
        }
    }

    function drawShootingStar(p, dt, canvas, index) {
        // Move the star
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        // Remove if off screen or life expired
        if (p.life <= 0 || p.x < -300 || p.x > canvas.width + 300 ||
            p.y < -300 || p.y > canvas.height + 300) {
            effectParticles.splice(index, 1);
            return;
        }

        // Calculate alpha based on remaining life
        const alpha = p.life / p.maxLife;

        // Draw the streak (like kraken-radio)
        bubblesCtx.strokeStyle = `rgba(255, 255, 255, ${alpha * p.brightness})`;
        bubblesCtx.lineWidth = 2 + alpha;
        bubblesCtx.lineCap = 'round';

        bubblesCtx.beginPath();
        bubblesCtx.moveTo(p.x, p.y);

        // Calculate tail end point
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const tailScale = p.tailLength / speed;
        const tailX = p.x - p.vx * tailScale;
        const tailY = p.y - p.vy * tailScale;

        bubblesCtx.lineTo(tailX, tailY);
        bubblesCtx.stroke();
    }

    function drawEmber(p, dt, now, canvas, index) {
        // Slow gentle rise
        p.y -= p.speed * dt;
        const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * dt * 0.5;
        p.x += wobble;
        p.life -= p.decay;

        if (p.life <= 0 || p.y < -20) {
            effectParticles[index] = createEffectParticle(false);
            return;
        }

        // Flickering glow effect
        const flicker = 0.6 + Math.sin(now * 8 + p.wobbleOffset) * 0.2 + Math.sin(now * 13 + p.wobbleOffset * 2) * 0.2;

        // Outer soft glow
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `hsla(${p.hue}, 100%, 50%, ${p.life * flicker * 0.15})`;
        bubblesCtx.fill();

        // Middle glow
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `hsla(${p.hue + 10}, 100%, 60%, ${p.life * flicker * 0.4})`;
        bubblesCtx.fill();

        // Hot core
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `hsla(${p.hue + 30}, 100%, 85%, ${p.life * flicker})`;
        bubblesCtx.fill();
    }

    function drawDust(p, dt, now, canvas, index) {
        // Very gentle floating motion
        const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset);
        p.x += (p.vx + wobble * 2) * dt;
        p.y += (p.vy + wobble * 1) * dt;

        // Wrap around screen
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;

        // Subtle opacity variation
        const fadeVar = 0.8 + Math.sin(now * 0.5 + p.wobbleOffset) * 0.2;

        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(220, 215, 200, ${p.opacity * fadeVar})`;
        bubblesCtx.fill();
    }

    function drawSnow(p, dt, now, canvas, index) {
        // Gentle falling
        p.y += p.speed * dt;
        const wobble = Math.sin(now * p.wobbleSpeed + p.wobbleOffset) * p.wobbleAmp * dt * 0.3;
        p.x += wobble;
        p.rotation += p.rotationSpeed * dt;

        if (p.y > canvas.height + p.size) {
            effectParticles[index] = createEffectParticle(false);
            return;
        }

        // Draw 6-point snowflake
        bubblesCtx.save();
        bubblesCtx.translate(p.x, p.y);
        bubblesCtx.rotate(p.rotation);
        bubblesCtx.strokeStyle = `rgba(255, 255, 255, ${p.opacity})`;
        bubblesCtx.lineWidth = p.size * 0.15;
        bubblesCtx.lineCap = 'round';

        // Draw 6 arms
        for (let i = 0; i < 6; i++) {
            bubblesCtx.save();
            bubblesCtx.rotate((i * Math.PI) / 3);

            // Main arm
            bubblesCtx.beginPath();
            bubblesCtx.moveTo(0, 0);
            bubblesCtx.lineTo(0, -p.size);
            bubblesCtx.stroke();

            // Small branches on each arm
            bubblesCtx.beginPath();
            bubblesCtx.moveTo(0, -p.size * 0.4);
            bubblesCtx.lineTo(p.size * 0.25, -p.size * 0.6);
            bubblesCtx.moveTo(0, -p.size * 0.4);
            bubblesCtx.lineTo(-p.size * 0.25, -p.size * 0.6);
            bubblesCtx.stroke();

            bubblesCtx.restore();
        }

        // Center dot
        bubblesCtx.beginPath();
        bubblesCtx.arc(0, 0, p.size * 0.1, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        bubblesCtx.fill();

        bubblesCtx.restore();
    }

    function drawFirefly(p, dt, now, canvas, index) {
        // Slow gentle movement toward target
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30) {
            // Pick new target - lazy wandering
            p.targetX = Math.random() * canvas.width;
            p.targetY = Math.random() * canvas.height;
        }

        // Very gentle movement
        p.vx += (dx / dist) * 5 * dt;
        p.vy += (dy / dist) * 5 * dt;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.x += p.vx * dt * 20;
        p.y += p.vy * dt * 20;

        // Update glow timer for on/off cycle
        p.glowTimer -= dt;
        if (p.glowTimer <= 0) {
            p.glowOn = !p.glowOn;
            // Random time until next toggle (1-4 seconds)
            p.glowTimer = 1 + Math.random() * 3;
        }

        // Smooth fade transition between on and off
        if (!p.glowIntensity) p.glowIntensity = p.glowOn ? 1 : 0;
        const targetIntensity = p.glowOn ? 1 : 0;
        p.glowIntensity += (targetIntensity - p.glowIntensity) * dt * 3; // Smooth fade

        // Only draw if there's some glow
        if (p.glowIntensity < 0.02) return;

        const glow = p.glowIntensity;

        // Outer soft glow (yellow-green)
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(180, 255, 80, ${glow * 0.1})`;
        bubblesCtx.fill();

        // Middle glow
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(200, 255, 120, ${glow * 0.3})`;
        bubblesCtx.fill();

        // Bright core
        bubblesCtx.beginPath();
        bubblesCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        bubblesCtx.fillStyle = `rgba(255, 255, 180, ${glow * 0.9})`;
        bubblesCtx.fill();
    }

    // ============================================================================
    function createBurstParticle(x, y) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 200 + 80;
        const hue = activeThemeColors.hueBase + Math.random() * activeThemeColors.hueRange;
        return {
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: Math.random() * 5 + 2,
            color: `hsl(${hue}, 80%, 60%)`,
            life: 1,
            decay: Math.random() * 0.015 + 0.01
        };
    }

    function triggerTrackChangeEffect() {
        const centerX = canvasW / 2;
        const centerY = canvasH / 2;
        for (let i = 0; i < 40; i++) {
            burstParticles.push(createBurstParticle(centerX, centerY));
        }
    }

    function drawBurstParticles(dt) {
        if (!particlesCtx) return;

        for (let i = burstParticles.length - 1; i >= 0; i--) {
            const p = burstParticles[i];

            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 80 * dt;
            p.vx *= 0.98;
            p.life -= p.decay;

            if (p.life <= 0) {
                burstParticles.splice(i, 1);
                continue;
            }

            particlesCtx.beginPath();
            particlesCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            particlesCtx.fillStyle = p.color.replace('hsl', 'hsla').replace(')', `, ${p.life})`);
            particlesCtx.fill();
        }
    }

    // ============================================================================
    return { init, resize, setState, tick, triggerBurst };
}

module.exports = { createParticleSystem, PARTICLE_THEMES };
