/**
 * Copies the latest NSIS + portable builds from dist/ to Install File/
 */
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const installDir = path.join(__dirname, '..', 'Install File');

function newestExe(dir, match) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir)
        .filter((f) => match(f) && f.endsWith('.exe'))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
    return files[0] || null;
}

if (!fs.existsSync(installDir)) {
    fs.mkdirSync(installDir, { recursive: true });
}

const setup = newestExe(distDir, (name) => /Setup/i.test(name));
const portable = newestExe(distDir, (name) => !/Setup/i.test(name));

const copied = [];
if (setup) {
    const dest = path.join(installDir, setup.name);
    fs.copyFileSync(path.join(distDir, setup.name), dest);
    copied.push(dest);
}
if (portable) {
    const dest = path.join(installDir, portable.name);
    fs.copyFileSync(path.join(distDir, portable.name), dest);
    copied.push(dest);
}

if (!copied.length) {
    console.error('[copy-to-install] No .exe files found in dist/. Run npm run build:v2:win first.');
    process.exit(1);
}

console.log('[copy-to-install] Copied:');
for (const f of copied) console.log('  ', f);
