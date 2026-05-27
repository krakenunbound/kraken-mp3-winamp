/**
 * Canvas audio visualizers — original implementations using Web Audio AnalyserNode data.
 * Patterns follow public MDN/Web Audio API guides (technique, not copied assets).
 */

let waterfallRow = null;
let waterfallBuffer = null;
let waterfallBufW = 0;
let waterfallBufH = 0;

function themeColor(theme, i, count, alpha = 0.8) {
    const hue = theme.hueBase + (i / count) * (theme.hueRange || 40);
    return `hsla(${hue}, ${theme.saturation ?? 80}%, 50%, ${alpha})`;
}

/** Map canvas column x across all FFT bins (linear or log frequency axis). */
function sampleFrequency(freqData, x, width, useLog = false) {
    const len = freqData.length;
    if (len < 1) return 0;
    if (width <= 1) return freqData[0];
    const t = x / (width - 1);
    let pos;
    if (useLog && len > 1) {
        pos = Math.exp(t * Math.log(len)) - 1;
    } else {
        pos = t * (len - 1);
    }
    const i0 = Math.min(len - 1, Math.max(0, Math.floor(pos)));
    const i1 = Math.min(len - 1, i0 + 1);
    const frac = pos - i0;
    return freqData[i0] * (1 - frac) + freqData[i1] * frac;
}

function drawBars(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const bufferLength = freqData.length;
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (freqData[i] / 255) * canvas.height;
        ctx.fillStyle = themeColor(theme, i, bufferLength);
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
    }
}

function drawMirror(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const bufferLength = Math.min(freqData.length, Math.floor(canvas.width / 3));
    const step = Math.max(1, Math.floor(freqData.length / bufferLength));
    const barWidth = canvas.width / bufferLength;
    const midY = canvas.height / 2;
    for (let b = 0; b < bufferLength; b++) {
        const i = b * step;
        const h = (freqData[i] / 255) * (midY - 4);
        const x = b * barWidth;
        ctx.fillStyle = themeColor(theme, i, freqData.length);
        ctx.fillRect(x, midY - h, barWidth - 1, h);
        ctx.fillRect(x, midY, barWidth - 1, h);
    }
}

function drawLed(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const segments = 12;
    const cols = Math.min(48, Math.floor(canvas.width / 8));
    const step = Math.max(1, Math.floor(freqData.length / cols));
    const colW = canvas.width / cols;
    const segH = canvas.height / segments;
    for (let c = 0; c < cols; c++) {
        const v = freqData[c * step] / 255;
        const lit = Math.floor(v * segments);
        for (let s = 0; s < segments; s++) {
            const y = canvas.height - (s + 1) * segH;
            const on = s < lit;
            ctx.fillStyle = on
                ? themeColor(theme, c, cols, 0.85)
                : `hsla(${theme.hueBase}, ${theme.saturation ?? 40}%, 20%, 0.25)`;
            ctx.fillRect(c * colW + 1, y + 1, colW - 2, segH - 2);
        }
    }
}

function drawSpectrum(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const n = Math.min(freqData.length, w);
    const step = Math.max(1, Math.floor(freqData.length / n));
    const [ar, ag, ab] = theme.accentRgb || [59, 158, 190];

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x < n; x++) {
        const v = freqData[x * step] / 255;
        const y = h - v * h * 0.92;
        ctx.lineTo(x, y);
    }
    ctx.lineTo(n, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.55)`);
    grad.addColorStop(1, `rgba(${ar}, ${ag}, ${ab}, 0.02)`);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.9)`;
    ctx.beginPath();
    for (let x = 0; x < n; x++) {
        const v = freqData[x * step] / 255;
        const y = h - v * h * 0.92;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
}

function drawWave(ctx, canvas, data, theme) {
    if (!data || !ctx) return;
    const bufferLength = data.length;
    ctx.lineWidth = 2;
    const [ar, ag, ab] = theme.accentRgb || [59, 158, 190];
    ctx.strokeStyle = `rgba(${ar}, ${ag}, ${ab}, 0.85)`;
    ctx.beginPath();
    const sliceWidth = canvas.width / bufferLength;
    let x = 0;
    const mid = canvas.height / 2;
    for (let i = 0; i < bufferLength; i++) {
        const v = data[i] / 128.0;
        const y = mid + ((v - 1) * mid * 0.9);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();
}

function drawCircle(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.15;
    const bufferLength = freqData.length;
    const maxBarHeight = radius * 0.8;
    for (let i = 0; i < bufferLength; i++) {
        const angle = (i / bufferLength) * Math.PI * 2 - Math.PI / 2;
        const barHeight = (freqData[i] / 255) * maxBarHeight;
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);
        ctx.strokeStyle = themeColor(theme, i, bufferLength, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    const [cr, cg, cb] = theme.accentRgb || [59, 158, 190];
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.1)`;
    ctx.fill();
}

function resetWaterfall() {
    waterfallRow = null;
    waterfallBuffer = null;
    waterfallBufW = 0;
    waterfallBufH = 0;
}

function ensureWaterfallBuffer(w, h) {
    if (!waterfallBuffer || waterfallBufW !== w || waterfallBufH !== h) {
        waterfallBuffer = document.createElement('canvas');
        waterfallBuffer.width = w;
        waterfallBuffer.height = h;
        waterfallBufW = w;
        waterfallBufH = h;
        const bctx = waterfallBuffer.getContext('2d');
        bctx.fillStyle = 'rgb(6, 12, 20)';
        bctx.fillRect(0, 0, w, h);
        waterfallRow = null;
    }
}

function drawWaterfall(ctx, canvas, freqData, theme) {
    if (!freqData || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    if (w < 1 || h < 1) return;

    ensureWaterfallBuffer(w, h);
    const bctx = waterfallBuffer.getContext('2d');

    if (h > 1) {
        bctx.drawImage(waterfallBuffer, 0, 0, w, h - 1, 0, 1, w, h - 1);
    }

    if (!waterfallRow || waterfallRow.length !== w * 4) {
        waterfallRow = new Uint8ClampedArray(w * 4);
    }

    const [ar, ag, ab] = theme.accentRgb || [59, 158, 190];
    for (let x = 0; x < w; x++) {
        const v = sampleFrequency(freqData, x, w, true) / 255;
        const i = x * 4;
        waterfallRow[i] = Math.min(255, (ar * v + 20) | 0);
        waterfallRow[i + 1] = Math.min(255, (ag * v + 30) | 0);
        waterfallRow[i + 2] = Math.min(255, (ab * v + 40) | 0);
        waterfallRow[i + 3] = Math.floor(180 + v * 75);
    }
    const img = bctx.createImageData(w, 1);
    img.data.set(waterfallRow);
    bctx.putImageData(img, 0, 0);

    ctx.drawImage(waterfallBuffer, 0, 0, w, h);
}

function drawVisualizerMode(ctx, canvas, mode, freqData, waveData, theme) {
    switch (mode) {
        case 'bars':
            drawBars(ctx, canvas, freqData, theme);
            break;
        case 'mirror':
            drawMirror(ctx, canvas, freqData, theme);
            break;
        case 'led':
            drawLed(ctx, canvas, freqData, theme);
            break;
        case 'spectrum':
            drawSpectrum(ctx, canvas, freqData, theme);
            break;
        case 'wave':
            drawWave(ctx, canvas, waveData || freqData, theme);
            break;
        case 'circle':
            drawCircle(ctx, canvas, freqData, theme);
            break;
        case 'waterfall':
            drawWaterfall(ctx, canvas, freqData, theme);
            break;
        default:
            break;
    }
}

module.exports = {
    drawBars,
    drawMirror,
    drawLed,
    drawSpectrum,
    drawWave,
    drawCircle,
    drawWaterfall,
    drawVisualizerMode,
    resetWaterfall
};
