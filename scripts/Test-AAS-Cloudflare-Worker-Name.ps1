param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$WorkerName = "ai-article-studio-pwa-preview"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$Wrangler = Join-Path $PwaRoot "node_modules\.bin\wrangler.cmd"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS Cloudflare Preview Worker Name Check"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "This is a read-only check. No Worker is created, updated, or deployed." -ForegroundColor Yellow

if ([string]::IsNullOrWhiteSpace($WorkerName)) {
    throw "WorkerName is required"
}
if ($WorkerName -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
    throw "WorkerName contains unsupported characters"
}
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository or worktree"
}
if (-not (Test-Path -LiteralPath $PwaRoot -PathType Container)) {
    throw "pwa directory not found"
}
if (-not (Test-Path -LiteralPath $Wrangler -PathType Leaf)) {
    throw "Pinned Wrangler was not found. Do not use a global Wrangler."
}

Set-Location $RepoRoot
$beforeStatus = @(git status --porcelain)
if ($beforeStatus.Count -ne 0) {
    $beforeStatus
    throw "Repository worktree is not clean"
}

Push-Location $PwaRoot
try {
    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $whoami = @(& $Wrangler whoami --json 2>&1)
        $whoamiExit = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    if ($whoamiExit -ne 0) {
        throw "Cloudflare authentication is not active"
    }
    Write-Host "PASS Cloudflare authentication" -ForegroundColor Green

    $oldPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 promotes native stderr to ErrorRecord. Keep the
        # command non-terminating so we can classify Cloudflare's read-only 404.
        $ErrorActionPreference = "Continue"
        $output = @(
            & $Wrangler versions list `
                --name $WorkerName `
                --json `
                2>&1
        )
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    $text = (($output | ForEach-Object { [string]$_ }) -join "`n")

    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "WORKER NAME STATUS: EXISTS" -ForegroundColor Yellow
        Write-Host "Worker name = $WorkerName"
        Write-Host "No deployment was performed."
        exit 3
    }

    $notFoundPatterns = @(
        '(?i)\b404\b',
        '(?i)not found',
        '(?i)does not exist',
        '(?i)could not find',
        "(?i)couldn't find",
        '(?i)no worker',
        '(?i)worker.+missing',
        '(?i)script.+missing',
        '(?i)code[^0-9]*10090'
    )

    $isNotFound = $false
    foreach ($pattern in $notFoundPatterns) {
        if ($text -match $pattern) {
            $isNotFound = $true
            break
        }
    }

    if ($isNotFound) {
        Write-Host ""
        Write-Host "WORKER NAME STATUS: AVAILABLE" -ForegroundColor Green
        Write-Host "Worker name = $WorkerName"
        Write-Host "Cloudflare returned a read-only not-found response for this Worker name."
        Write-Host "No Worker was created."
        Write-Host "No deployment was performed."
        Write-Host ""
        Write-Host "==================================================" -ForegroundColor Green
        Write-Host " CLOUDFLARE WORKER NAME CHECK: PASS"
        Write-Host "==================================================" -ForegroundColor Green
        exit 0
    }

    if ($text -match '(?i)unauthorized|forbidden|permission|authentication|token|login') {
        Write-Host "WORKER NAME STATUS: INDETERMINATE" -ForegroundColor Red
        Write-Host "Cloudflare authentication/permission response prevented a safe decision."
        Write-Host "Raw Cloudflare output was intentionally not printed."
        exit 4
    }

    Write-Host "WORKER NAME STATUS: INDETERMINATE" -ForegroundColor Red
    Write-Host "Cloudflare returned an unexpected read-only response."
    Write-Host "Native exit code = $exitCode"
    Write-Host "Raw Cloudflare output was intentionally not printed."
    exit 4
}
finally {
    Pop-Location
}
