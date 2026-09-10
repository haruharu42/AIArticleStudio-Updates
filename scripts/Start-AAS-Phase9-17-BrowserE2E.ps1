param(
    [string]$RepoRoot = "C:\Users\ragno\Desktop\新しいフォルダー\AIArticleStudio-Dev",
    [string]$InstallRoot = "$env:LOCALAPPDATA\AIArticleStudio",
    [int]$Port = 5173
)

$ErrorActionPreference = "Stop"
$Branch = "implementation/phase12-17-batch"
$AuthJson = Join-Path $InstallRoot "config\auth.json"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$WorktreeRoot = Join-Path $env:USERPROFILE "Downloads\AAS-Phase9-17-BrowserE2E-$Stamp"
$PwaRoot = Join-Path $WorktreeRoot "pwa"
$StateFile = Join-Path $WorktreeRoot "browser-e2e-state.json"
$StdoutLog = Join-Path $WorktreeRoot "pwa.stdout.log"
$StderrLog = Join-Path $WorktreeRoot "pwa.stderr.log"

function Clear-PublicEnv {
    Remove-Item Env:NEXT_PUBLIC_AAS_SUPABASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_AAS_TERMS_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_AAS_PRIVACY_URL -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_AAS_AI_TERMS_URL -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS Phase 9-17 Browser E2E Preview"
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "RepoRoot not found: $RepoRoot"
}
if (-not (Test-Path -LiteralPath $AuthJson -PathType Leaf)) {
    throw "Installed auth.json not found: $AuthJson"
}
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $Port is already in use. Stop the existing process first."
}

Set-Location $RepoRoot
if (@(git status --porcelain).Count -ne 0) {
    throw "Stable repository worktree is not clean. Browser E2E preview aborted."
}

git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$RemoteRef = "origin/$Branch"
$RemoteHead = (git rev-parse $RemoteRef).Trim()
Write-Host "Development HEAD =" $RemoteHead

Write-Host "Creating isolated worktree..." -ForegroundColor Yellow
git worktree add --detach $WorktreeRoot $RemoteRef
if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

try {
    $Config = Get-Content -LiteralPath $AuthJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $JsonText = Get-Content -LiteralPath $AuthJson -Raw -Encoding UTF8
    if ($JsonText -match '(?i)service[_-]?role|sb_secret_') {
        throw "Forbidden secret material detected in auth.json"
    }

    $SupabaseUrl = [string]$Config.supabase_url
    $PublishableKey = [string]$Config.anon_key
    if ([string]::IsNullOrWhiteSpace($SupabaseUrl) -or [string]::IsNullOrWhiteSpace($PublishableKey)) {
        throw "Supabase public URL/key missing in installed auth.json"
    }

    $env:NEXT_PUBLIC_AAS_SUPABASE_URL = $SupabaseUrl.TrimEnd('/')
    $env:NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY = $PublishableKey
    $env:NEXT_PUBLIC_AAS_TERMS_URL = [string]$Config.terms_url
    $env:NEXT_PUBLIC_AAS_PRIVACY_URL = [string]$Config.privacy_url
    $env:NEXT_PUBLIC_AAS_AI_TERMS_URL = [string]$Config.ai_terms_url

    Set-Location $PwaRoot

    Write-Host "Installing locked dependencies..." -ForegroundColor Yellow
    npm ci --ignore-scripts --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

    Write-Host "Running typecheck..." -ForegroundColor Yellow
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }

    Write-Host "Running production build..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "build failed" }

    Write-Host "Starting local PWA on 127.0.0.1:$Port..." -ForegroundColor Yellow
    $Process = Start-Process -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", "127.0.0.1", "--port", "$Port") `
        -WorkingDirectory $PwaRoot `
        -RedirectStandardOutput $StdoutLog `
        -RedirectStandardError $StderrLog `
        -PassThru

    $RootUrl = "http://127.0.0.1:$Port"
    $Ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($Process.HasExited) {
            throw "PWA process exited early. Check: $StderrLog"
        }
        try {
            $Response = Invoke-WebRequest -Uri $RootUrl -UseBasicParsing -TimeoutSec 3
            if ($Response.StatusCode -eq 200) {
                $Ready = $true
                break
            }
        } catch {
            # Keep waiting until timeout.
        }
    }
    if (-not $Ready) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        throw "PWA did not become ready within 60 seconds"
    }

    $Routes = @("/", "/invite", "/admin", "/create", "/tools", "/images", "/sns", "/publish", "/analytics")
    foreach ($Route in $Routes) {
        $Response = Invoke-WebRequest -Uri ($RootUrl + $Route) -UseBasicParsing -TimeoutSec 10
        if ($Response.StatusCode -ne 200) {
            throw "Route smoke test failed: $Route -> $($Response.StatusCode)"
        }
        Write-Host "PASS HTTP 200" $Route -ForegroundColor Green
    }

    [ordered]@{
        started_at = (Get-Date).ToString("o")
        branch = $Branch
        commit = $RemoteHead
        pid = $Process.Id
        worktree = $WorktreeRoot
        pwa_root = $PwaRoot
        root_url = $RootUrl
        stdout_log = $StdoutLog
        stderr_log = $StderrLog
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $StateFile -Encoding UTF8

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " BROWSER E2E PREVIEW: READY"
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "URL       =" $RootUrl
    Write-Host "Commit    =" $RemoteHead
    Write-Host "Process   =" $Process.Id
    Write-Host "StateFile =" $StateFile
    Write-Host ""
    Write-Host "Public Supabase configuration was loaded without printing key values." -ForegroundColor Yellow
    Write-Host "No firewall rule was created; the server is loopback-only." -ForegroundColor Yellow

    Start-Process $RootUrl
}
catch {
    Write-Host "Browser E2E setup failed: $($_.Exception.Message)" -ForegroundColor Red
    if (Test-Path -LiteralPath $WorktreeRoot) {
        Set-Location $RepoRoot
        git worktree remove --force $WorktreeRoot 2>$null
    }
    throw
}
finally {
    Clear-PublicEnv
    Set-Location $RepoRoot
}
