param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "AIArticleStudio"),
    [string]$TermsUrl = $env:NEXT_PUBLIC_AAS_TERMS_URL,
    [string]$PrivacyUrl = $env:NEXT_PUBLIC_AAS_PRIVACY_URL,
    [string]$AiTermsUrl = $env:NEXT_PUBLIC_AAS_AI_TERMS_URL
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-HttpsUrl([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "$Name is required for production preflight"
    }
    $uri = $null
    if (-not [System.Uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) {
        throw "$Name is not a valid absolute URL"
    }
    if ($uri.Scheme -ne "https") {
        throw "$Name must use HTTPS"
    }
}

function Invoke-NpmStep([string]$Label, [string[]]$Arguments) {
    Write-Host "=== $Label ===" -ForegroundColor Yellow
    & npm @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed"
    }
    Write-Host "PASS $Label" -ForegroundColor Green
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$AuthConfig = Join-Path $InstallRoot "config\auth.json"
$ReportPath = Join-Path $env:USERPROFILE "Downloads\AIArticleStudio-PWA-Production-Preflight.json"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS PWA Production Preflight"
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository"
}
if (-not (Test-Path -LiteralPath $PwaRoot -PathType Container)) {
    throw "pwa directory not found"
}
if (-not (Test-Path -LiteralPath $AuthConfig -PathType Leaf)) {
    throw "Installed auth.json not found"
}

Set-Location $RepoRoot
$status = @(git status --porcelain)
if ($status.Count -ne 0) {
    $status
    throw "Stable repository is not clean"
}

git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }
$localHead = (git rev-parse HEAD).Trim()
$mainHead = (git rev-parse origin/main).Trim()
Write-Host "Local HEAD  = $localHead"
Write-Host "origin/main = $mainHead"
if ($localHead -ne $mainHead) {
    throw "Local repository is not at origin/main"
}
Write-Host "PASS source baseline" -ForegroundColor Green

$nodeVersionRaw = (& node --version).Trim().TrimStart('v')
$nodeVersion = [version]$nodeVersionRaw
if ($nodeVersion -lt [version]"22.13.0") {
    throw "Node.js 22.13.0 or newer is required"
}
Write-Host "PASS Node.js $nodeVersionRaw" -ForegroundColor Green

$auth = Get-Content -LiteralPath $AuthConfig -Raw -Encoding UTF8 | ConvertFrom-Json
$urlCandidates = @(
    $auth.supabase_url,
    $auth.url,
    $auth.SUPABASE_URL
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
$keyCandidates = @(
    $auth.supabase_publishable_key,
    $auth.publishable_key,
    $auth.anon_key,
    $auth.SUPABASE_ANON_KEY
) | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }

if ($urlCandidates.Count -lt 1) { throw "Public Supabase URL was not found in installed auth.json" }
if ($keyCandidates.Count -lt 1) { throw "Publishable/anon Supabase key was not found in installed auth.json" }

$supabaseUrl = [string]$urlCandidates[0]
$publishableKey = [string]$keyCandidates[0]
if ($publishableKey -match '^(?i)sb_secret_' -or $publishableKey -match '(?i)service[_-]?role') {
    throw "Refusing to use a secret/service-role key"
}

Assert-HttpsUrl "NEXT_PUBLIC_AAS_TERMS_URL" $TermsUrl
Assert-HttpsUrl "NEXT_PUBLIC_AAS_PRIVACY_URL" $PrivacyUrl
Assert-HttpsUrl "NEXT_PUBLIC_AAS_AI_TERMS_URL" $AiTermsUrl

$swPath = Join-Path $PwaRoot "public\sw.js"
$manifestPath = Join-Path $PwaRoot "public\manifest.webmanifest"
$icon192 = Join-Path $PwaRoot "public\icon-192.png"
$icon512 = Join-Path $PwaRoot "public\icon-512.png"
foreach ($required in @($swPath, $manifestPath, $icon192, $icon512)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required PWA asset missing: $required"
    }
}

$sw = Get-Content -LiteralPath $swPath -Raw -Encoding UTF8
foreach ($guard in @('/auth/callback','/api/','access_token','refresh_token')) {
    if (-not $sw.Contains($guard)) {
        throw "Service worker auth/cache guard missing: $guard"
    }
}
Write-Host "PASS PWA manifest/icons/service-worker guards" -ForegroundColor Green

$oldEnv = @{
    NEXT_PUBLIC_AAS_SUPABASE_URL = $env:NEXT_PUBLIC_AAS_SUPABASE_URL
    NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY = $env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY
    NEXT_PUBLIC_AAS_TERMS_URL = $env:NEXT_PUBLIC_AAS_TERMS_URL
    NEXT_PUBLIC_AAS_PRIVACY_URL = $env:NEXT_PUBLIC_AAS_PRIVACY_URL
    NEXT_PUBLIC_AAS_AI_TERMS_URL = $env:NEXT_PUBLIC_AAS_AI_TERMS_URL
}

try {
    $env:NEXT_PUBLIC_AAS_SUPABASE_URL = $supabaseUrl
    $env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY = $publishableKey
    $env:NEXT_PUBLIC_AAS_TERMS_URL = $TermsUrl
    $env:NEXT_PUBLIC_AAS_PRIVACY_URL = $PrivacyUrl
    $env:NEXT_PUBLIC_AAS_AI_TERMS_URL = $AiTermsUrl

    Set-Location $PwaRoot
    Invoke-NpmStep "npm ci" @("ci", "--ignore-scripts", "--no-audit", "--no-fund")
    Invoke-NpmStep "typecheck" @("run", "typecheck")
    Invoke-NpmStep "lint" @("run", "lint")
    Invoke-NpmStep "test/build regression" @("test")
    Invoke-NpmStep "npm audit" @("audit")
}
finally {
    foreach ($name in $oldEnv.Keys) {
        [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], "Process")
    }
}

$report = [ordered]@{
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    repo_head = $localHead
    origin_main = $mainHead
    node_version = $nodeVersionRaw
    supabase_public_config_present = $true
    secret_key_rejected = $true
    terms_https = $true
    privacy_https = $true
    ai_terms_https = $true
    pwa_assets_present = $true
    service_worker_auth_guards_present = $true
    npm_ci = "pass"
    typecheck = "pass"
    lint = "pass"
    regression_build = "pass"
    npm_audit = "pass"
    deploy_performed = $false
    result = "PASS"
}

$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8
Write-Host ""
Write-Host "Report = $ReportPath"
Write-Host "No secret values were written to the report."
Write-Host "No deployment was performed."
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " PWA PRODUCTION PREFLIGHT: PASS"
Write-Host "==================================================" -ForegroundColor Green
