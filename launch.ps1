$ErrorActionPreference = 'Stop'
$botRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $botRoot
$mutex = New-Object System.Threading.Mutex($false, 'Local\OmniBotLauncher')
$ownsMutex = $false
try {
    $ownsMutex = $mutex.WaitOne(0)
    if (-not $ownsMutex) { Write-Host 'OmniBot is already open. Look for the OmniBot browser tab.'; Read-Host 'Press Enter to close'; exit }
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    $supported = $false
    if ($nodeCommand) { $nodeVersion = & $nodeCommand.Source --version; $major = ([version]$nodeVersion.TrimStart('v')).Major; $supported = $major -ge 22 }
    if (-not $supported) {
        Write-Host 'OmniBot needs Node.js 22 or newer. Installing the current LTS version...'
        if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS from https://nodejs.org, then double-click START_OMNIBOT.bat again.' }
        & winget.exe install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
        if ($LASTEXITCODE -ne 0) { throw 'Node installation did not finish. Install Node.js LTS from https://nodejs.org, then try again.' }
        $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $nodeCommand) { throw 'Node.js installed. Close this window and double-click START_OMNIBOT.bat again.' }
    }
    $nodeVersion = & $nodeCommand.Source --version
    $major = ([version]$nodeVersion.TrimStart('v')).Major
    if ([int]$major -lt 22) { throw 'Node.js 22 or newer is required. Restart Windows after updating Node.js, then try again.' }
    $npmPath = Join-Path (Split-Path -Parent $nodeCommand.Source) 'npm.cmd'
    $lockHash = (Get-FileHash -LiteralPath 'package-lock.json' -Algorithm SHA256).Hash
    $stamp = Join-Path $botRoot 'node_modules/.omnibot-lock'
    if (-not (Test-Path 'node_modules/kick-wss/package.json') -or -not (Test-Path $stamp) -or (Get-Content $stamp -Raw).Trim() -ne $lockHash) {
        Write-Host 'Preparing OmniBot. This only needs the internet on first run or after an update...'
        & $npmPath ci --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Download failed. Check the internet connection and open OmniBot again.' }
        Set-Content -LiteralPath $stamp -Value $lockHash
    }
    & $nodeCommand.Source 'src/index.js'
    if ($LASTEXITCODE -ne 0) { throw 'OmniBot stopped with an error. See the message above.' }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; Read-Host 'Press Enter to close' }
finally { if ($ownsMutex) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
