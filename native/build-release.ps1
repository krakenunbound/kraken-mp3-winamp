# Builds Kraken MP3 (native) for release:
#   1. runs the unit tests
#   2. publishes a self-contained folder (for the installer) and a single-file portable exe
#   3. compiles the NSIS installer
#   4. copies "Kraken MP3 Setup <ver>.exe" and "Kraken MP3 <ver>.exe" to "Install File"
#
# Usage:  powershell -ExecutionPolicy Bypass -File native\build-release.ps1
# Needs:  .NET 10 SDK; NSIS 3 (makensis on PATH, or electron-builder's cached copy).

$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$repo = Split-Path $native -Parent
$app = Join-Path $native 'src\KrakenMp3.App\KrakenMp3.App.csproj'
$version = ([xml](Get-Content $app)).Project.PropertyGroup.Version | Where-Object { $_ } | Select-Object -First 1
if (-not $version) { throw 'No <Version> in KrakenMp3.App.csproj' }
Write-Host "Kraken MP3 $version"

dotnet test (Join-Path $native 'tests\KrakenMp3.Tests') --nologo
if ($LASTEXITCODE) { throw 'Unit tests failed' }

$pub = Join-Path $native 'publish'
if (Test-Path $pub) { Remove-Item $pub -Recurse -Force }
dotnet publish $app -c Release --self-contained -o (Join-Path $pub 'folder') --nologo
if ($LASTEXITCODE) { throw 'Publish (folder) failed' }
dotnet publish $app -c Release --self-contained -o (Join-Path $pub 'single') --nologo `
    -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true
if ($LASTEXITCODE) { throw 'Publish (single file) failed' }

$makensis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
if (-not $makensis) {
    $makensis = Get-ChildItem "$env:LOCALAPPDATA\electron-builder\Cache\nsis" -Recurse -Filter makensis.exe -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -notmatch 'linux|mac' } | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $makensis) { throw 'makensis.exe not found (install NSIS 3)' }
& $makensis -V2 "/DVERSION=$version" (Join-Path $native 'installer\KrakenMP3.nsi')
if ($LASTEXITCODE) { throw 'NSIS failed' }

$out = Join-Path $repo 'Install File'
Copy-Item (Join-Path $pub "Kraken MP3 Setup $version.exe") $out -Force
Copy-Item (Join-Path $pub 'single\Kraken MP3.exe') (Join-Path $out "Kraken MP3 $version.exe") -Force
Get-ChildItem $out -Filter "*$version*.exe" | Format-Table Name, @{n='MB'; e={[math]::Round($_.Length / 1MB, 1)}}
