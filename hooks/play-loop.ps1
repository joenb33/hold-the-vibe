param(
  [Parameter(Mandatory = $true)][string]$SoundFile,
  [int]$VolumePercent = 80
)

$ErrorActionPreference = 'Stop'
$volume = [Math]::Max(0, [Math]::Min(100, $VolumePercent)) / 100.0

# MediaPlayer streams from disk; SoundPlayer loads the entire WAV into memory first
# (~3s for a 7MB file), so agent turns often finish before any audio is heard.
#
# MediaPlayer is a DispatcherObject: MediaEnded (and MediaOpened/MediaFailed) are
# marshaled through the thread's dispatcher and will NEVER fire without an active
# message pump. A bare `Start-Sleep` keep-alive loop does not pump one, so without
# Dispatcher::Run() the clip plays through once and then goes silent for the rest
# of the agent turn — confirmed empirically (Position freezes at the clip's natural
# duration; MediaEnded never fires, even minutes past the end).
try {
  Add-Type -AssemblyName presentationCore
  Add-Type -AssemblyName WindowsBase
  $uri = [System.Uri]::new((Resolve-Path -LiteralPath $SoundFile).Path)
  $player = New-Object System.Windows.Media.MediaPlayer
  $player.Volume = $volume
  $player.Open($uri)
  $player.add_MediaEnded({
    param($sender, $e)
    $sender.Position = [TimeSpan]::Zero
    $sender.Play()
  })
  $player.Play()
  [System.Windows.Threading.Dispatcher]::Run()
} catch {
  # PlayLooping() loops natively (not via a managed event), so a bare keep-alive
  # loop is fine here — no dispatcher pump needed.
  $fallback = New-Object System.Media.SoundPlayer $SoundFile
  $fallback.PlayLooping()
  while ($true) { Start-Sleep -Seconds 3600 }
}
