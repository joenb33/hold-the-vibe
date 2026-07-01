$root = Split-Path $PSScriptRoot -Parent
$ding = Join-Path $root 'media\ding.wav'
$hold = Join-Path $root 'media\hold-music.wav'

if (-not (Test-Path $ding)) { Write-Error "Missing $ding"; exit 1 }
if (-not (Test-Path $hold)) { Write-Error "Missing $hold"; exit 1 }

Write-Host "Playing ding (2s)..."
$p = New-Object System.Media.SoundPlayer $ding
$p.PlaySync()
Write-Host "Ding OK"

Write-Host "Hold file size:" (Get-Item $hold).Length "bytes"
Write-Host "Audio files look good."
