param(
    [string]$RepoRoot = "C:\Users\ragno\Desktop\新しいフォルダー\AIArticleStudio-Dev",
    [string]$StateFile
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($StateFile)) {
    $Latest = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE "Downloads") `
        -Directory `
        -Filter "AAS-Phase9-17-BrowserE2E-*" `
        -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $Latest) {
        throw "No AAS Phase 9-17 Browser E2E directory found."
    }
    $StateFile = Join-Path $Latest.FullName "browser-e2e-state.json"
}

if (-not (Test-Path -LiteralPath $StateFile -PathType Leaf)) {
    throw "State file not found: $StateFile"
}

$State = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
$PidToStop = [int]$State.pid
$Worktree = [string]$State.worktree

Write-Host "Stopping PWA process" $PidToStop -ForegroundColor Yellow
Stop-Process -Id $PidToStop -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

if (Get-Process -Id $PidToStop -ErrorAction SilentlyContinue) {
    Stop-Process -Id $PidToStop -Force -ErrorAction Stop
}

if (Test-Path -LiteralPath $RepoRoot -PathType Container) {
    Set-Location $RepoRoot
    if (Test-Path -LiteralPath $Worktree -PathType Container) {
        git worktree remove --force $Worktree
        if ($LASTEXITCODE -ne 0) {
            throw "git worktree remove failed: $Worktree"
        }
    }
    git worktree prune
}

Write-Host "BROWSER E2E CLEANUP: PASS" -ForegroundColor Green
Write-Host "State file was:" $StateFile
