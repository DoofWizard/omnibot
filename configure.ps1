$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $root "config.json"

Write-Host ""
Write-Host "OMNIBOT CONFIGURATION" -ForegroundColor Cyan
Write-Host "Type the Kick channel name only." -ForegroundColor White
Write-Host "Example: if the channel is kick.com/ryan123, type ryan123" -ForegroundColor DarkGray
Write-Host ""

do {
    $channel = (Read-Host "Kick channel name").Trim()
} until ($channel.Length -gt 0)

$voice = (Read-Host "OmniVoice saved voice profile (press Enter to use default)").Trim()

$config = Get-Content $configPath -Raw | ConvertFrom-Json
$config.kickChannel = $channel
$config.voiceProfile = $voice
$config | ConvertTo-Json -Depth 10 | Set-Content -Path $configPath -Encoding UTF8

Write-Host ""
Write-Host "Saved." -ForegroundColor Green
Write-Host "Kick channel: $channel"
if ($voice) { Write-Host "Voice profile: $voice" } else { Write-Host "Voice profile: OmniVoice default" }
