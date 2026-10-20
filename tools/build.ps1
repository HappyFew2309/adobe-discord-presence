# Builds a release:
#   dist/DiscordPresence-<version>.zxp          signed extension (also what the auto-updater downloads)
#   dist/DiscordPresence-Setup-<version>.exe    Windows installer (no admin, no debug-mode tweaks)
#   dist/checksums.txt                          SHA-256 of every file (the updater refuses files that don't match)
#
# Used by .github/workflows/release.yml. Also runs locally on Windows:
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1 -Version 1.2.0
#
# Signing certificate: set ZXP_CERT_B64 (base64 of a .p12) + ZXP_CERT_PASSWORD to reuse your own.
# Without them a fresh self-signed certificate is made for each build, which Adobe apps accept.
param([string]$Version = '')

$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$ext   = Join-Path $root 'extension'
$build = Join-Path $root 'build'
$dist  = Join-Path $root 'dist'
$id    = 'com.happyfew.discordpresence'

Remove-Item $build, $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $build, $dist | Out-Null

# 1. Clean copy of the extension (without the dev-only .debug file), stamped with the version.
$stage = Join-Path $build 'stage'
Copy-Item $ext $stage -Recurse
Remove-Item (Join-Path $stage '.debug') -Force -ErrorAction SilentlyContinue
$manifest = Join-Path $stage 'CSXS\manifest.xml'
$xml = [IO.File]::ReadAllText($manifest)
if (-not $Version) { $Version = [regex]::Match($xml, 'ExtensionBundleVersion="([^"]+)"').Groups[1].Value }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must look like 1.2.3 (got '$Version')" }
$xml = [regex]::Replace($xml, 'ExtensionBundleVersion="[^"]+"', 'ExtensionBundleVersion="' + $Version + '"')
$xml = [regex]::Replace($xml, '(<Extension Id="[^"]+" Version=")[^"]+"', '${1}' + $Version + '"')
[IO.File]::WriteAllText($manifest, $xml)
Write-Host "Building version $Version"

# 2. Adobe's signing tool.
$bin = Join-Path $PSScriptRoot 'bin'
$signer = Join-Path $bin 'ZXPSignCmd.exe'
if (-not (Test-Path $signer)) {
  New-Item -ItemType Directory -Path $bin -Force | Out-Null
  Write-Host 'Downloading ZXPSignCmd from Adobe-CEP/CEP-Resources'
  Invoke-WebRequest 'https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.103/win64/ZXPSignCmd.exe' -OutFile $signer
}

# 3. Certificate.
$cert = Join-Path $build 'cert.p12'
$pass = $env:ZXP_CERT_PASSWORD
if ($env:ZXP_CERT_B64 -and $pass) {
  [IO.File]::WriteAllBytes($cert, [Convert]::FromBase64String($env:ZXP_CERT_B64))
  Write-Host 'Using certificate from ZXP_CERT_B64'
} else {
  $pass = [guid]::NewGuid().ToString('N')
  & $signer -selfSignedCert NL NH happyfew 'Discord Presence for Adobe' $pass $cert -validityDays 3650
  if ($LASTEXITCODE -ne 0) { throw 'Could not create a signing certificate' }
}

# 4. Sign (timestamped, so the signature stays valid after the certificate expires).
$zxp = Join-Path $dist "DiscordPresence-$Version.zxp"
$signed = $false
foreach ($tsa in 'http://timestamp.digicert.com', 'http://timestamp.sectigo.com', 'http://timestamp.globalsign.com/tsa/r6advanced1') {
  & $signer -sign $stage $zxp $cert $pass -tsa $tsa
  if ($LASTEXITCODE -eq 0) { $signed = $true; break }
  Write-Warning "Timestamp server $tsa failed, trying the next one"
  Remove-Item $zxp -Force -ErrorAction SilentlyContinue
}
if (-not $signed) { throw 'Signing failed' }
& $signer -verify $zxp
if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed' }

# 5. Unpack the signed package; the installer ships exactly these files.
$unpacked = Join-Path $build $id
Copy-Item $zxp (Join-Path $build 'signed.zip')
Expand-Archive (Join-Path $build 'signed.zip') $unpacked
if (-not (Test-Path (Join-Path $unpacked 'META-INF\signatures.xml'))) { throw 'Signed package has no signature' }

# 6. Windows installer (Inno Setup).
$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if ($iscc) {
  & $iscc "/DAppVersion=$Version" "/DSourceDir=$unpacked" "/O$dist" (Join-Path $root 'installer\setup.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
} else {
  Write-Warning 'Inno Setup 6 not found - skipping the .exe (install it from https://jrsoftware.org/isdl.php)'
}

# 7. Checksums.
$files = Get-ChildItem $dist -File | Where-Object { $_.Name -ne 'checksums.txt' }
$lines = $files | ForEach-Object { '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name }
[IO.File]::WriteAllText((Join-Path $dist 'checksums.txt'), (($lines -join "`n") + "`n"))

Write-Host ''
Write-Host 'Done:'
Get-ChildItem $dist | ForEach-Object { Write-Host ('  ' + $_.Name) }
