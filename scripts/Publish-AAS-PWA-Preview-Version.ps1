param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "AIArticleStudio"),
    [string]$ExpectedGitRef = "origin/prep/pwa-production-release",
    [string]$WorkerName = "ai-article-studio-pwa-preview",
    [string]$PreviewAlias = "aas-preview",
    [switch]$ConfirmPreviewUpload
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-JsonPropertyValue {
    param(
        [Parameter(Mandatory = $true)] [object]$Object,
        [Parameter(Mandatory = $true)] [string[]]$Names
    )

    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property) {
            $value = [string]$property.Value
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                return $value
            }
        }
    }
    return $null
}

function Invoke-NpmStep([string]$Label, [string[]]$Arguments) {
    Write-Host "=== $Label ===" -ForegroundColor Yellow
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed"
    }
    Write-Host "PASS $Label" -ForegroundColor Green
}

if (-not $ConfirmPreviewUpload) {
    Write-Host "REFUSED: -ConfirmPreviewUpload is required." -ForegroundColor Yellow
    Write-Host "No Cloudflare version was uploaded."
    exit 2
}

if ($WorkerName -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
    throw "WorkerName contains unsupported characters"
}
if ($PreviewAlias -notmatch '^[a-z][a-z0-9-]{0,31}$') {
    throw "PreviewAlias contains unsupported characters"
}
if (("$PreviewAlias-$WorkerName").Length -gt 63) {
    throw "PreviewAlias and WorkerName exceed the workers.dev DNS label limit"
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$AuthConfig = Join-Path $InstallRoot "config\auth.json"
$TempRoot = Join-Path $env:TEMP ("AAS-PWA-PreviewUpload-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss"))
$Worktree = Join-Path $TempRoot "repo"
$ReportPath = Join-Path $env:USERPROFILE "Downloads\AIArticleStudio-PWA-Preview-Upload.json"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS PWA Cloudflare Preview Version Upload"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "This uploads a preview version only." -ForegroundColor Yellow
Write-Host "The production workers.dev route remains disabled." -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository or worktree"
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
$expectedHead = (git rev-parse $ExpectedGitRef).Trim()
Write-Host "Expected ref  = $ExpectedGitRef"
Write-Host "Expected HEAD = $expectedHead"

$jsonText = Get-Content -LiteralPath $AuthConfig -Raw -Encoding UTF8
if ($jsonText -match '(?i)service[_-]?role|sb_secret_') {
    throw "Forbidden secret material detected in auth.json"
}
$auth = $jsonText | ConvertFrom-Json
$supabaseUrl = Get-JsonPropertyValue $auth @("supabase_url", "url", "SUPABASE_URL")
$publishableKey = Get-JsonPropertyValue $auth @(
    "supabase_publishable_key",
    "publishable_key",
    "supabase_anon_key",
    "anon_key",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY"
)
if ([string]::IsNullOrWhiteSpace($supabaseUrl)) { throw "Supabase public URL not found" }
if ([string]::IsNullOrWhiteSpace($publishableKey)) { throw "Supabase publishable key not found" }
if ($publishableKey -match '^(?i)sb_secret_' -or $publishableKey -match '(?i)service[_-]?role') {
    throw "Refusing secret/service-role key"
}

New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
$uploaded = $false
$previewUrl = $null

try {
    git worktree add --detach $Worktree $ExpectedGitRef
    if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

    $WorkPwa = Join-Path $Worktree "pwa"
    Push-Location $WorkPwa
    try {
        $env:NEXT_PUBLIC_AAS_SUPABASE_URL = $supabaseUrl.TrimEnd('/')
        $env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY = $publishableKey
        $env:NEXT_PUBLIC_AAS_TERMS_URL = "/terms"
        $env:NEXT_PUBLIC_AAS_PRIVACY_URL = "/privacy"
        $env:NEXT_PUBLIC_AAS_AI_TERMS_URL = "/ai-terms"
        $env:AAS_CLOUDFLARE_WORKER_NAME = $WorkerName
        $env:WRANGLER_WRITE_LOGS = "false"

        Invoke-NpmStep "npm ci" @("ci", "--ignore-scripts", "--no-audit", "--no-fund")
        Invoke-NpmStep "typecheck" @("run", "typecheck")
        Invoke-NpmStep "lint" @("run", "lint")
        Invoke-NpmStep "build and regression" @("test")
        Invoke-NpmStep "dependency audit" @("audit", "--audit-level=high")

        $WranglerConfig = Get-ChildItem -LiteralPath $WorkPwa -Filter "wrangler.json" -File -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.FullName -notmatch '\\.wrangler\\' } |
            Select-Object -First 1
        if (-not $WranglerConfig) { throw "Generated wrangler.json not found" }

        $configText = Get-Content -LiteralPath $WranglerConfig.FullName -Raw -Encoding UTF8
        if ($configText -match '(?i)service[_-]?role|sb_secret_') {
            throw "Forbidden secret marker found in generated Wrangler config"
        }
        $config = $configText | ConvertFrom-Json
        if ([string]$config.name -ne $WorkerName) { throw "Generated Worker name mismatch" }
        if ($config.workers_dev -ne $false) { throw "workers_dev must be false for preview upload" }
        if ($config.preview_urls -ne $true) { throw "preview_urls must be true for preview upload" }
        if ([string]$config.assets.binding -ne "ASSETS") { throw "ASSETS binding missing" }
        $hasImages = $false
        foreach ($binding in @($config.images)) {
            if ([string]$binding.binding -eq "IMAGES") { $hasImages = $true }
        }
        if (-not $hasImages) { throw "IMAGES binding missing" }

        $Wrangler = Join-Path $WorkPwa "node_modules\.bin\wrangler.cmd"
        if (-not (Test-Path -LiteralPath $Wrangler -PathType Leaf)) {
            throw "Pinned Wrangler executable not found"
        }

        $oldPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $whoami = @(& $Wrangler whoami --json 2>&1)
            $whoamiExit = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $oldPreference
        }
        if ($whoamiExit -ne 0) { throw "Cloudflare authentication is not active" }
        Write-Host "PASS Cloudflare authentication" -ForegroundColor Green

        $DryRunDir = Join-Path $WorkPwa ".aas-preview-dry-run"
        & $Wrangler deploy --dry-run --config $WranglerConfig.FullName --outdir $DryRunDir
        if ($LASTEXITCODE -ne 0) { throw "Wrangler dry-run failed" }
        Write-Host "PASS Wrangler dry-run" -ForegroundColor Green

        Write-Host ""
        Write-Host "Uploading preview version..." -ForegroundColor Yellow
        Write-Host "Worker = $WorkerName"
        Write-Host "Alias  = $PreviewAlias"

        $oldPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            $uploadOutput = @(
                & $Wrangler versions upload `
                    --config $WranglerConfig.FullName `
                    --preview-alias $PreviewAlias `
                    --message "AAS PWA preview $expectedHead" `
                    2>&1
            )
            $uploadExit = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $oldPreference
        }
        if ($uploadExit -ne 0) {
            throw "Cloudflare preview version upload failed"
        }
        $uploaded = $true

        $uploadText = (($uploadOutput | ForEach-Object { [string]$_ }) -join "`n")
        $urlMatch = [regex]::Match($uploadText, 'https://[a-z0-9.-]+\.workers\.dev(?:/[^\s]*)?', 'IgnoreCase')
        if ($urlMatch.Success) {
            $previewUrl = $urlMatch.Value
        }

        [ordered]@{
            generated_at = [DateTimeOffset]::UtcNow.ToString("o")
            commit = $expectedHead
            worker_name = $WorkerName
            preview_alias = $PreviewAlias
            preview_url = $previewUrl
            production_workers_dev_enabled = $false
            preview_urls_enabled = $true
            cloudflare_version_uploaded = $true
            production_deployment_performed = $false
            result = "PASS"
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

        Write-Host ""
        Write-Host "PREVIEW VERSION UPLOAD: PASS" -ForegroundColor Green
        if ($previewUrl) {
            Write-Host "Preview URL = $previewUrl" -ForegroundColor Green
        } else {
            Write-Host "Preview URL was not parsed; use the Cloudflare dashboard to open the uploaded preview version." -ForegroundColor Yellow
        }
        Write-Host "No production deployment was performed." -ForegroundColor Green
        Write-Host "Report = $ReportPath"
    }
    finally {
        Remove-Item Env:NEXT_PUBLIC_AAS_SUPABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
        Remove-Item Env:NEXT_PUBLIC_AAS_TERMS_URL -ErrorAction SilentlyContinue
        Remove-Item Env:NEXT_PUBLIC_AAS_PRIVACY_URL -ErrorAction SilentlyContinue
        Remove-Item Env:NEXT_PUBLIC_AAS_AI_TERMS_URL -ErrorAction SilentlyContinue
        Remove-Item Env:AAS_CLOUDFLARE_WORKER_NAME -ErrorAction SilentlyContinue
        Remove-Item Env:WRANGLER_WRITE_LOGS -ErrorAction SilentlyContinue
        Pop-Location
    }
}
finally {
    Set-Location $RepoRoot
    $registered = @(git worktree list --porcelain | Select-String -SimpleMatch $Worktree)
    if ($registered.Count -gt 0) {
        git worktree remove --force $Worktree
    }
    git worktree prune
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not $uploaded) {
    throw "Preview version was not uploaded"
}
if (@(git status --porcelain).Count -ne 0) {
    throw "Stable repository changed during preview upload"
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " PWA CLOUDFLARE PREVIEW VERSION: PASS"
Write-Host " Production deployment: NOT PERFORMED"
Write-Host "==================================================" -ForegroundColor Green
