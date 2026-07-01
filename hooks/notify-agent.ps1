param(
  [Parameter(Mandatory = $true)][string]$Action
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-BridgePort {
  $paths = @(
    (Join-Path $HOME '.elevator-music' 'bridge.json'),
    (Join-Path $HOME '.copilot' 'elevator-music-bridge.json')
  )
  $port = 17351
  foreach ($bridgeFile in $paths) {
    if (-not (Test-Path $bridgeFile)) { continue }
    try {
      $json = Get-Content $bridgeFile -Raw | ConvertFrom-Json
      if ($json.port) { return [int]$json.port }
    } catch {}
  }
  return $port
}

$port = Get-BridgePort

function Invoke-Bridge {
  param([string]$Path)
  $uri = "http://127.0.0.1:$port$Path"
  try {
    Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Post-Bridge {
  param([string]$Path)
  $uri = "http://127.0.0.1:$port$Path"
  try {
    Invoke-RestMethod -Uri $uri -Method Post -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

$path = $null
if ($Action -eq 'start') {
  $path = '/activity/start'
} elseif ($Action -eq 'stop') {
  $path = '/activity/stop'
} else {
  exit 0
}

if (-not (Invoke-Bridge '/health')) {
  Start-Sleep -Milliseconds 250
  Invoke-Bridge '/health' | Out-Null
}

if (-not (Post-Bridge $path)) {
  Start-Sleep -Milliseconds 250
  Post-Bridge $path | Out-Null
}

exit 0
