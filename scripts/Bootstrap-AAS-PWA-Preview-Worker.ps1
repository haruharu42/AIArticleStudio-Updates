param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA "AIArticleStudio"),
    [string]$ExpectedGitRef = "origin/prep/pwa-production-release",
    [string]$WorkerName = "ai-article-studio-pwa-preview",
    [switch]$ConfirmBootstrapDeploy
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

function Invoke-WranglerCapture {
    param(
        [Parameter(Mandatory = $true)] [string]$Wrangler,
        [Parameter(Mandatory = $true)] [string[]]$Arguments
    )

    $oldPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = @(& $Wrangler @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $oldPreference
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Text = (($output | ForEach-Object { [string]$_ }) -join "`n")
    }
}

if (-not $ConfirmBootstrapDeploy) {
    Write-Host "REFUSED: -ConfirmBootstrapDeploy is required." -ForegroundColor Yellow
    Write-Host "No Cloudflare Worker was created or deployed."
    exit 2
}

if ($WorkerName -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') {
    throw "WorkerName contains unsupported characters"
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$AuthConfig = Join-Path $InstallRoot "config\auth.json"
$TempRoot = Join-Path $env:TEMP ("AAS-PWA-PreviewBootstrap-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss"))
$Worktree = Join-Path $TempRoot "repo"
$ReportPath = Join-Path $env:USERPROFILE "Downloads\AIArticleStudio-PWA-Preview-Bootstrap.json"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS PWA First-Worker Preview Bootstrap"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "This creates the first Cloudflare Worker deployment because" -ForegroundColor Yellow
Write-Host "Cloudflare does not allow 'versions upload' as the first upload." -ForegroundColor Yellow
Write-Host "workers.dev production routing must remain disabled." -ForegroundColor Yellow
Write-Host "Preview URLs remain explicitly enabled." -ForegroundColor Yellow

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
$bootstrapCompleted = $false
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
        if ($config.workers_dev -ne $false) { throw "workers_dev must be false for bootstrap" }
        if ($config.preview_urls -ne $true) { throw "preview_urls must be true for bootstrap" }
        if ([string]$config.assets.binding -ne "ASSETS") { throw "ASSETS binding missing" }

        $hasImages = $false
        foreach ($binding in @($config.images)) {
            if ([string]$binding.binding -eq "IMAGES") { $hasImages = $true }
        }
        if (-not $hasImages) { throw "IMAGES binding missing" }

        $routeProperty = $config.PSObject.Properties["route"]
        $routesProperty = $config.PSObject.Properties["routes"]
        if (($null -ne $routeProperty -and $null -ne $routeProperty.Value) -or
            ($null -ne $routesProperty -and @($routesProperty.Value).Count -gt 0)) {
            throw "Production routes must be absent during preview bootstrap"
        }

        $Wrangler = Join-Path $WorkPwa "node_modules\.bin\wrangler.cmd"
        if (-not (Test-Path -LiteralPath $Wrangler -PathType Leaf)) {
            throw "Pinned Wrangler executable not found"
        }

        $whoami = Invoke-WranglerCapture $Wrangler @("whoami", "--json")
        if ($whoami.ExitCode -ne 0) { throw "Cloudflare authentication is not active" }
        Write-Host "PASS Cloudflare authentication" -ForegroundColor Green

        $existing = Invoke-WranglerCapture $Wrangler @("versions", "list", "--name", $WorkerName, "--json")
        if ($existing.ExitCode -eq 0) {
            throw "Worker already exists. Use Publish-AAS-PWA-Preview-Version.ps1 instead of bootstrap."
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
        $isMissing = $false
        foreach ($pattern in $notFoundPatterns) {
            if ($existing.Text -match $pattern) {
                $isMissing = $true
                break
            }
        }
        if (-not $isMissing) {
            throw "Worker existence could not be classified safely; bootstrap refused"
        }
        Write-Host "PASS Worker is not yet created" -ForegroundColor Green

        $DryRunDir = Join-Path $WorkPwa ".aas-bootstrap-dry-run"
        & $Wrangler deploy --dry-run --config $WranglerConfig.FullName --outdir $DryRunDir
        if ($LASTEXITCODE -ne 0) { throw "Wrangler dry-run failed" }
        Write-Host "PASS Wrangler dry-run" -ForegroundColor Green

        Write-Host ""
        Write-Host "Creating the first Worker deployment with production routing disabled..." -ForegroundColor Yellow
        Write-Host "Worker = $WorkerName"

        $deploy = Invoke-WranglerCapture $Wrangler @("deploy", "--config", $WranglerConfig.FullName)
        if ($deploy.ExitCode -ne 0) {
            throw "Cloudflare first-Worker bootstrap deploy failed"
        }

        $verify = Invoke-WranglerCapture $Wrangler @("versions", "list", "--name", $WorkerName, "--json")
        if ($verify.ExitCode -ne 0) {
            throw "Worker bootstrap completed but version verification failed"
        }

        $bootstrapCompleted = $true
        $urlMatch = [regex]::Match($deploy.Text, 'https://[a-z0-9.-]+\.workers\.dev(?:/[^\s]*)?', 'IgnoreCase')
        if ($urlMatch.Success) {
            $previewUrl = $urlMatch.Value
        }

        [ordered]@{
            generated_at = [DateTimeOffset]::UtcNow.ToString("o")
            commit = $expectedHead
            worker_name = $WorkerName
            bootstrap_deployment_performed = $true
            production_workers_dev_enabled = $false
            production_routes_configured = $false
            preview_urls_enabled = $true
            preview_url = $previewUrl
            result = "PASS"
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

        Write-Host ""
        Write-Host "FIRST-WORKER PREVIEW BOOTSTRAP: PASS" -ForegroundColor Green
        if ($previewUrl) {
            Write-Host "Preview URL = $previewUrl" -ForegroundColor Green
        } else {
            Write-Host "Preview URL was not parsed from Wrangler output." -ForegroundColor Yellow
        }
        Write-Host "Production workers.dev route: DISABLED" -ForegroundColor Green
        Write-Host "Production custom routes: NONE" -ForegroundColor Green
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

if (-not $bootstrapCompleted) {
    throw "First-Worker preview bootstrap did not complete"
}
if (@(git status --porcelain).Count -ne 0) {
    throw "Stable repository changed during preview bootstrap"
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " PWA CLOUDFLARE FIRST-WORKER BOOTSTRAP: PASS"
Write-Host " Production workers.dev route: DISABLED"
Write-Host " Production custom routes: NONE"
Write-Host "==================================================" -ForegroundColor Green
