# Install Kraken MP3

## 3.0.1 (native) — recommended

| File | Use |
|------|-----|
| **`Kraken MP3 Setup 3.0.1.exe`** | Normal Windows install (Start menu + desktop shortcut). Replaces Kraken MP3 2.x in place. |
| **`Kraken MP3 3.0.1.exe`** | Portable — no installer, nothing registered. |

Built with `powershell -ExecutionPolicy Bypass -File native\build-release.ps1`.
What changed: [CHANGELOG_V3.md](../CHANGELOG_V3.md).

Upgrading from 2.x: close Kraken MP3 first. The installer removes the 2.x
program files from the same folder, keeps your 2.x settings folder, and keeps
any file types you had set to open with Kraken MP3. 3.0.1 starts with default
settings. To make Kraken MP3 the default player, tick "Open Windows Default
Apps" on the last page (or use FX → Choose defaults for Kraken MP3).

## 2.x (Electron) — previous version

After `npm run build:v2:win`, the 2.x installers are copied here
(`Kraken MP3 Setup 2.0.5.exe`, `Kraken MP3 2.0.5.exe`). Installing 2.x over 3.0.1
is possible; it uses the same Apps & Features entry.

These `.exe` files are **not in git** (too large). Download from [GitHub Releases](https://github.com/krakenunbound/kraken-mp3-winamp/releases/latest) or rebuild locally.

**Classic v1 installer:** [kraken-mp3 releases](https://github.com/krakenunbound/kraken-mp3/releases/latest) — different product; both can be installed together.

**Documentation:** [docs/V2_USER_GUIDE.md](../docs/V2_USER_GUIDE.md), [docs/NATIVE_REWRITE_PLAN.md](../docs/NATIVE_REWRITE_PLAN.md)
