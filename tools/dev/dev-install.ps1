# DEVELOPER install (unsigned copy of extension\, enables PlayerDebugMode).
# Normal users should use the installer from the GitHub release instead.
#   dev-install.bat          copy the extension into Adobe's extensions folder
#   dev-install.bat -Link    link it instead, so edits apply after an app restart
param([switch]$Link)

$ErrorActionPreference = 'Stop'
$id   = 'com.happyfew.discordpresence'
$src  = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'extension'
$root = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$dest = Join-Path $root $id

Write-Host ''
Write-Host '  Discord Presence for Adobe - developer install' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path (Join-Path $src 'CSXS\manifest.xml'))) {
  Write-Host "  Can't find the extension folder next to this script." -ForegroundColor Red
  exit 1
}

# 1. Let Adobe apps load unsigned extensions (per-user setting, one key per CEP version).
foreach ($v in 9..14) {
  $key = "HKCU:\Software\Adobe\CSXS.$v"
  New-Item -Path $key -Force | Out-Null
  Set-ItemProperty -Path $key -Name 'PlayerDebugMode' -Value '1' -Type String
}
Write-Host '  [ok] Allowed unsigned extensions (PlayerDebugMode)'

# 2. Put the extension where Premiere Pro and After Effects look for it.
New-Item -ItemType Directory -Path $root -Force | Out-Null
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
if ($Link) {
  New-Item -ItemType Junction -Path $dest -Target $src | Out-Null
  Write-Host "  [ok] Linked $dest -> $src"
} else {
  Copy-Item -Path $src -Destination $dest -Recurse -Force
  Write-Host "  [ok] Installed to $dest"
}

# 3. Remind about running apps.
$running = Get-Process -Name 'Adobe Premiere Pro', 'AfterFX', 'Photoshop', 'Illustrator', 'Adobe Audition', 'Adobe Media Encoder' -ErrorAction SilentlyContinue
if ($running) {
  Write-Host ''
  Write-Host '  An Adobe app is open - restart it to load the extension.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '  Next: open an Adobe app, then Window > Extensions > Discord Presence.'
Write-Host ''
