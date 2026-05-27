/**
 * Writes src/build-flavor.json before packaging so the installed app knows v1 vs v2.
 * Usage: node scripts/set-build-flavor.js legacy | v2
 */
const fs = require('fs');
const path = require('path');

const mode = (process.argv[2] || 'v2').toLowerCase();
if (mode !== 'legacy' && mode !== 'v2') {
    console.error('Usage: node scripts/set-build-flavor.js legacy|v2');
    process.exit(1);
}

const pkg = require('../package.json');
const outPath = path.join(__dirname, '..', 'src', 'build-flavor.json');
const payload = {
    mode,
    version: pkg.version,
    productName: mode === 'v2' ? 'Kraken MP3 Winamp v2' : 'Kraken MP3',
    generatedAt: new Date().toISOString()
};

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`[build-flavor] wrote ${outPath} (mode=${mode})`);
