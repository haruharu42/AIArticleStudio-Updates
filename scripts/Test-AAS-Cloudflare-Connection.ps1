param(
    [string]$RepoRoot = (Get-Location).Path,
    [switch]$LoginIfNeeded
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$PackageLock = Join-Path $PwaRoot "package-lock.json"
$WranglerCmd = Join-Path $PwaRoot "node_modules\.bin\wrangler.cmd"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS Cloudflare Connection Check"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "This check never deploys or modifies an AAS Worker." -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository or worktree"
}
if (-not (Test-Path -LiteralPath $PwaRoot -PathType Container)) {
    throw "pwa directory not found"
}
if (-not (Test-Path -LiteralPath $PackageLock -PathType Leaf)) {
    throw "pwa/package-lock.json not found"
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js was not found"
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm was not found"
}

Set-Location $RepoRoot
$beforeStatus = @(git status --porcelain)
if ($beforeStatus.Count -ne 0) {
    $beforeStatus
    throw "Repository worktree is not clean"
}

if (-not (Test-Path -LiteralPath $WranglerCmd -PathType Leaf)) {
    Write-Host "Pinned Wrangler is not installed locally. Installing locked dependencies..." -ForegroundColor Yellow
    Push-Location $PwaRoot
    try {
        & npm.cmd ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed"
        }
    }
    finally {
        Pop-Location
    }
}

if (-not (Test-Path -LiteralPath $WranglerCmd -PathType Leaf)) {
    throw "Pinned Wrangler executable was not found after npm ci"
}

function Test-CloudflareLogin {
    Push-Location $PwaRoot
    try {
        $whoamiOutput = @(& $WranglerCmd whoami --json 2>&1)
        $whoamiExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    return [pscustomobject]@{
        ExitCode = $whoamiExitCode
        Output = $whoamiOutput
    }
}

$result = Test-CloudflareLogin
if ($result.ExitCode -ne 0) {
    if (-not $LoginIfNeeded) {
        Write-Host "CLOUDFLARE AUTH: NOT LOGGED IN" -ForegroundColor Yellow
        Write-Host "No account details or credentials were printed."
        Write-Host "Run the same script with -LoginIfNeeded to open Cloudflare OAuth login."
        exit 2
    }

    Write-Host "Cloudflare login is required." -ForegroundColor Yellow
    Write-Host "Opening Wrangler OAuth login with OS keyring storage enabled..." -ForegroundColor Yellow
    Push-Location $PwaRoot
    try {
        & $WranglerCmd login --use-keyring
        if ($LASTEXITCODE -ne 0) {
            throw "Cloudflare OAuth login failed"
        }
    }
    finally {
        Pop-Location
    }

    $result = Test-CloudflareLogin
    if ($result.ExitCode -ne 0) {
        throw "Cloudflare authentication could not be confirmed after login"
    }
}

$afterStatus = @(git status --porcelain)
if ($afterStatus.Count -ne 0) {
    $afterStatus
    throw "Repository changed during Cloudflare connection check"
}

Write-Host ""
Write-Host "CLOUDFLARE AUTH: PASS" -ForegroundColor Green
Write-Host "Pinned Wrangler authentication is confirmed." -ForegroundColor Green
Write-Host "Account details and credential values were intentionally not printed."
Write-Host "No Worker was created, updated, or deployed."
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " CLOUDFLARE CONNECTION CHECK: PASS"
Write-Host "==================================================" -ForegroundColor Green
