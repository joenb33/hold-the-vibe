param(
  [Parameter(Mandatory = $true)][string]$SoundFile,
  [int]$VolumePercent = 80
)

$ErrorActionPreference = 'Stop'
$volume = [Math]::Max(0, [Math]::Min(100, $VolumePercent)) / 100.0

# MediaPlayer streams from disk; SoundPlayer loads the entire WAV first (slow for
# large bundled dings). MediaPlayer needs a dispatcher pump for MediaEnded.
try {
  Add-Type -AssemblyName presentationCore
  Add-Type -AssemblyName WindowsBase
  $uri = [System.Uri]::new((Resolve-Path -LiteralPath $SoundFile).Path)
  $player = New-Object System.Windows.Media.MediaPlayer
  $player.Volume = $volume
  $player.Open($uri)
  $player.add_MediaEnded({
    param($sender, $e)
    [System.Windows.Threading.Dispatcher]::ExitAll()
  })
  $player.Play()
  [System.Windows.Threading.Dispatcher]::Run()
} catch {
  $fallback = New-Object System.Media.SoundPlayer $SoundFile
  $fallback.PlaySync()
}
