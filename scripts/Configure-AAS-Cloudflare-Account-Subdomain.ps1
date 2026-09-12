param(
    [string]$RepoRoot = (Get-Location).Path,
    [string]$WorkerName = "ai-article-studio-pwa-preview",
    [string]$PreviewAlias = "aas-preview",
    [string]$AccountSubdomain = "ai-article-studio",
    [switch]$ConfirmCreateAccountSubdomain
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

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

function Get-CloudflareErrorInfo {
    param([Parameter(Mandatory = $true)] $ErrorRecord)

    $statusCode = $null
    $rawBody = $null
    $codes = @()

    if ($null -ne $ErrorRecord.Exception.Response) {
        try {
            $statusCode = [int]$ErrorRecord.Exception.Response.StatusCode
        }
        catch {
        }

        try {
            $stream = $ErrorRecord.Exception.Response.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                try {
                    $rawBody = $reader.ReadToEnd()
                }
                finally {
                    $reader.Dispose()
                }
            }
        }
        catch {
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
        try {
            $json = $rawBody | ConvertFrom-Json
            foreach ($item in @($json.errors)) {
                if ($null -ne $item -and $null -ne $item.code) {
                    $codes += [int]$item.code
                }
            }
        }
        catch {
        }
    }

    return [pscustomobject]@{
        StatusCode = $statusCode
        Codes = @($codes | Sort-Object -Unique)
        RawBody = $rawBody
    }
}

function Invoke-CloudflareGet {
    param(
        [Parameter(Mandatory = $true)] [string]$Uri,
        [Parameter(Mandatory = $true)] [hashtable]$Headers
    )

    try {
        $response = Invoke-RestMethod -Method Get -Uri $Uri -Headers $Headers -TimeoutSec 30
        return [pscustomobject]@{
            Ok = $true
            StatusCode = 200
            Result = $response
            Codes = @()
        }
    }
    catch {
        $errorInfo = Get-CloudflareErrorInfo $_
        return [pscustomobject]@{
            Ok = $false
            StatusCode = $errorInfo.StatusCode
            Result = $null
            Codes = @($errorInfo.Codes)
        }
    }
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
if ($AccountSubdomain.Length -gt 63 -or $AccountSubdomain -notmatch '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$') {
    throw "AccountSubdomain must be a valid lowercase DNS label"
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$PwaRoot = Join-Path $RepoRoot "pwa"
$Wrangler = Join-Path $PwaRoot "node_modules\.bin\wrangler.cmd"
$ReportPath = Join-Path $env:USERPROFILE "Downloads\AIArticleStudio-Cloudflare-Account-Subdomain.json"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS Cloudflare workers.dev Account Subdomain"
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "This helper only creates the account-level workers.dev namespace when missing." -ForegroundColor Yellow
Write-Host "It never enables the Worker's production workers.dev route." -ForegroundColor Yellow
Write-Host "It never uploads a Worker version or performs a deployment." -ForegroundColor Yellow

if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    throw "RepoRoot is not a Git repository or worktree"
}
if (-not (Test-Path -LiteralPath $Wrangler -PathType Leaf)) {
    throw "Pinned Wrangler executable not found; run npm ci in pwa first"
}

Set-Location $RepoRoot
$beforeHead = (git rev-parse HEAD).Trim()
$beforeStatus = @(git status --porcelain)
if ($beforeStatus.Count -ne 0) {
    $beforeStatus
    throw "Stable repository is not clean"
}

$oldWriteLogs = $env:WRANGLER_WRITE_LOGS
$oldLogPath = $env:WRANGLER_LOG_PATH
$tempLog = Join-Path $env:TEMP ("AAS-Cloudflare-AccountSubdomain-" + $PID + ".log")
$token = $null
$headers = $null
$created = $false
$selectedAccountId = $null
$workerProductionEnabled = $null
$workerPreviewsEnabled = $null
$existingAliasReachable = $false
$expectedAliasUrl = $null

try {
    $env:WRANGLER_WRITE_LOGS = "false"
    $env:WRANGLER_LOG_PATH = $tempLog

    Push-Location $PwaRoot
    try {
        Write-Host ""
        Write-Host "[1] VERIFY CLOUDFLARE AUTH" -ForegroundColor Yellow
        $whoami = Invoke-WranglerCapture $Wrangler @("whoami", "--json")
        if ($whoami.ExitCode -ne 0) {
            throw "Cloudflare authentication is not active"
        }
        $whoamiJson = $whoami.Text | ConvertFrom-Json

        $accountIds = New-Object System.Collections.Generic.List[string]
        $accountsProperty = $whoamiJson.PSObject.Properties["accounts"]
        if ($null -ne $accountsProperty) {
            foreach ($account in @($accountsProperty.Value)) {
                $idProperty = $account.PSObject.Properties["id"]
                if ($null -ne $idProperty -and -not [string]::IsNullOrWhiteSpace([string]$idProperty.Value)) {
                    if (-not $accountIds.Contains([string]$idProperty.Value)) {
                        $accountIds.Add([string]$idProperty.Value)
                    }
                }
            }
        }
        $accountProperty = $whoamiJson.PSObject.Properties["account"]
        if ($null -ne $accountProperty -and $null -ne $accountProperty.Value) {
            $idProperty = $accountProperty.Value.PSObject.Properties["id"]
            if ($null -ne $idProperty -and -not [string]::IsNullOrWhiteSpace([string]$idProperty.Value)) {
                if (-not $accountIds.Contains([string]$idProperty.Value)) {
                    $accountIds.Add([string]$idProperty.Value)
                }
            }
        }
        $directAccountId = $whoamiJson.PSObject.Properties["account_id"]
        if ($null -ne $directAccountId -and -not [string]::IsNullOrWhiteSpace([string]$directAccountId.Value)) {
            if (-not $accountIds.Contains([string]$directAccountId.Value)) {
                $accountIds.Add([string]$directAccountId.Value)
            }
        }
        if ($accountIds.Count -lt 1) {
            throw "Could not determine a Cloudflare account from Wrangler authentication"
        }
        Write-Host "PASS Cloudflare authentication" -ForegroundColor Green

        Write-Host ""
        Write-Host "[2] LOAD OAUTH TOKEN INTO MEMORY ONLY" -ForegroundColor Yellow
        $authResult = Invoke-WranglerCapture $Wrangler @("auth", "token", "--json")
        if ($authResult.ExitCode -ne 0) {
            throw "Could not obtain the authenticated Wrangler token"
        }
        $authJson = $authResult.Text | ConvertFrom-Json
        $tokenProperty = $authJson.PSObject.Properties["token"]
        if ($null -eq $tokenProperty -or [string]::IsNullOrWhiteSpace([string]$tokenProperty.Value)) {
            throw "Wrangler authentication token was unavailable"
        }
        $token = [string]$tokenProperty.Value
        $headers = @{ Authorization = "Bearer $token" }
        Write-Host "PASS authenticated token loaded in memory" -ForegroundColor Green
        Write-Host "Token value intentionally not displayed." -ForegroundColor DarkGray

        Write-Host ""
        Write-Host "[3] LOCATE WORKER ACCOUNT AND VERIFY WORKER ROUTING" -ForegroundColor Yellow
        foreach ($accountId in $accountIds) {
            $workerSubdomainUri = "https://api.cloudflare.com/client/v4/accounts/$accountId/workers/scripts/$WorkerName/subdomain"
            $workerState = Invoke-CloudflareGet -Uri $workerSubdomainUri -Headers $headers
            if ($workerState.Ok -and $workerState.Result.success -eq $true) {
                $selectedAccountId = $accountId
                $workerProductionEnabled = [bool]$workerState.Result.result.enabled
                $workerPreviewsEnabled = [bool]$workerState.Result.result.previews_enabled
                break
            }
        }
        if ([string]::IsNullOrWhiteSpace($selectedAccountId)) {
            throw "Worker was not found in the authenticated Cloudflare accounts"
        }
        if ($workerProductionEnabled) {
            throw "Refusing account-subdomain setup because the Worker's production workers.dev route is enabled"
        }
        if (-not $workerPreviewsEnabled) {
            throw "Refusing account-subdomain setup because Preview URLs are disabled for the Worker"
        }
        Write-Host "PASS Worker located" -ForegroundColor Green
        Write-Host "PASS production workers.dev disabled" -ForegroundColor Green
        Write-Host "PASS Preview URLs enabled" -ForegroundColor Green

        Write-Host ""
        Write-Host "[4] READ ACCOUNT workers.dev SUBDOMAIN" -ForegroundColor Yellow
        $accountSubdomainUri = "https://api.cloudflare.com/client/v4/accounts/$selectedAccountId/workers/subdomain"
        $current = Invoke-CloudflareGet -Uri $accountSubdomainUri -Headers $headers

        if ($current.Ok -and $current.Result.success -eq $true) {
            $currentName = [string]$current.Result.result.subdomain
            if ([string]::IsNullOrWhiteSpace($currentName)) {
                throw "Cloudflare returned an empty account workers.dev subdomain"
            }
            if ($currentName -ne $AccountSubdomain) {
                Write-Host "An account workers.dev subdomain already exists." -ForegroundColor Yellow
                Write-Host "Existing subdomain is intentionally not printed by this helper." -ForegroundColor DarkGray
                throw "Refusing to rename an existing account-wide workers.dev subdomain"
            }
            Write-Host "PASS requested account subdomain already exists" -ForegroundColor Green
        }
        else {
            $isMissing = ($current.StatusCode -eq 404 -and @($current.Codes) -contains 10007)
            if (-not $isMissing) {
                throw "Account workers.dev subdomain lookup failed unexpectedly"
            }

            Write-Host "Account workers.dev subdomain is not configured." -ForegroundColor Yellow
            if (-not $ConfirmCreateAccountSubdomain) {
                Write-Host "REFUSED: -ConfirmCreateAccountSubdomain is required for the account-wide write." -ForegroundColor Yellow
                Write-Host "No Cloudflare account setting was changed."
                exit 2
            }

            Write-Host ""
            Write-Host "[5] CREATE ACCOUNT workers.dev SUBDOMAIN" -ForegroundColor Yellow
            $body = @{ subdomain = $AccountSubdomain } | ConvertTo-Json -Compress
            try {
                $createResponse = Invoke-RestMethod `
                    -Method Put `
                    -Uri $accountSubdomainUri `
                    -Headers $headers `
                    -ContentType "application/json" `
                    -Body $body `
                    -TimeoutSec 30
            }
            catch {
                $errorInfo = Get-CloudflareErrorInfo $_
                $codeText = if (@($errorInfo.Codes).Count -gt 0) { (@($errorInfo.Codes) -join ",") } else { "none" }
                throw "Cloudflare account-subdomain creation failed (HTTP $($errorInfo.StatusCode); CF codes $codeText)"
            }
            if ($createResponse.success -ne $true -or [string]$createResponse.result.subdomain -ne $AccountSubdomain) {
                throw "Cloudflare did not confirm the requested account workers.dev subdomain"
            }
            $created = $true
            Write-Host "PASS account workers.dev subdomain created" -ForegroundColor Green
        }

        Write-Host ""
        Write-Host "[6] VERIFY ACCOUNT SUBDOMAIN AND WORKER ROUTING" -ForegroundColor Yellow
        $verifyAccount = Invoke-CloudflareGet -Uri $accountSubdomainUri -Headers $headers
        if (-not $verifyAccount.Ok -or $verifyAccount.Result.success -ne $true) {
            throw "Account workers.dev subdomain verification failed"
        }
        if ([string]$verifyAccount.Result.result.subdomain -ne $AccountSubdomain) {
            throw "Verified account workers.dev subdomain does not match the requested value"
        }

        $workerSubdomainUri = "https://api.cloudflare.com/client/v4/accounts/$selectedAccountId/workers/scripts/$WorkerName/subdomain"
        $verifyWorker = Invoke-CloudflareGet -Uri $workerSubdomainUri -Headers $headers
        if (-not $verifyWorker.Ok -or $verifyWorker.Result.success -ne $true) {
            throw "Worker routing verification failed"
        }
        $workerProductionEnabled = [bool]$verifyWorker.Result.result.enabled
        $workerPreviewsEnabled = [bool]$verifyWorker.Result.result.previews_enabled
        if ($workerProductionEnabled) {
            throw "Unexpected production workers.dev route became enabled"
        }
        if (-not $workerPreviewsEnabled) {
            throw "Preview URLs became disabled unexpectedly"
        }
        Write-Host "PASS account subdomain verified" -ForegroundColor Green
        Write-Host "PASS production workers.dev remains disabled" -ForegroundColor Green
        Write-Host "PASS Preview URLs remain enabled" -ForegroundColor Green

        Write-Host ""
        Write-Host "[7] CHECK EXISTING PREVIEW ALIAS WITHOUT WRITING" -ForegroundColor Yellow
        $expectedAliasUrl = "https://$PreviewAlias-$WorkerName.$AccountSubdomain.workers.dev"
        try {
            $aliasResponse = Invoke-WebRequest -Uri $expectedAliasUrl -UseBasicParsing -MaximumRedirection 5 -TimeoutSec 30
            $statusCode = [int]$aliasResponse.StatusCode
            $existingAliasReachable = ($statusCode -ge 200 -and $statusCode -lt 400)
            Write-Host "Alias HTTP status = $statusCode"
        }
        catch {
            $statusCode = $null
            if ($null -ne $_.Exception.Response) {
                try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { }
            }
            if ($null -ne $statusCode) {
                Write-Host "Alias HTTP status = $statusCode" -ForegroundColor Yellow
            }
            else {
                Write-Host "Alias HTTP result = CONNECTION FAILED" -ForegroundColor Yellow
            }
            $existingAliasReachable = $false
        }
        if ($existingAliasReachable) {
            Write-Host "PASS existing preview alias is reachable" -ForegroundColor Green
        }
        else {
            Write-Host "Existing preview alias is not yet routable; a fresh preview version upload may be required." -ForegroundColor Yellow
        }
    }
    finally {
        Pop-Location -ErrorAction SilentlyContinue
    }
}
finally {
    $token = $null
    $headers = $null

    if ($null -eq $oldWriteLogs) {
        Remove-Item Env:WRANGLER_WRITE_LOGS -ErrorAction SilentlyContinue
    }
    else {
        $env:WRANGLER_WRITE_LOGS = $oldWriteLogs
    }
    if ($null -eq $oldLogPath) {
        Remove-Item Env:WRANGLER_LOG_PATH -ErrorAction SilentlyContinue
    }
    else {
        $env:WRANGLER_LOG_PATH = $oldLogPath
    }
    Remove-Item -LiteralPath $tempLog -Force -ErrorAction SilentlyContinue
}

Set-Location $RepoRoot
$afterHead = (git rev-parse HEAD).Trim()
$afterStatus = @(git status --porcelain)
if ($afterHead -ne $beforeHead) {
    throw "Repository HEAD changed during Cloudflare account-subdomain setup"
}
if ($afterStatus.Count -ne 0) {
    $afterStatus
    throw "Repository changed during Cloudflare account-subdomain setup"
}

[ordered]@{
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    worker_name = $WorkerName
    preview_alias = $PreviewAlias
    account_subdomain = $AccountSubdomain
    account_subdomain_created = $created
    production_workers_dev_enabled = [bool]$workerProductionEnabled
    preview_urls_enabled = [bool]$workerPreviewsEnabled
    existing_alias_url = $expectedAliasUrl
    existing_alias_reachable = [bool]$existingAliasReachable
    new_version_uploaded = $false
    production_deployment_performed = $false
    routing_changes_performed = $false
    repository_clean = $true
    result = "PASS"
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReportPath -Encoding UTF8

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host " CLOUDFLARE ACCOUNT SUBDOMAIN: PASS"
Write-Host " Account subdomain created = $created"
Write-Host " Production workers.dev = DISABLED"
Write-Host " Preview URLs = ENABLED"
if ($existingAliasReachable) {
    Write-Host " Existing preview alias = REACHABLE"
    Write-Host " Preview URL = $expectedAliasUrl"
}
else {
    Write-Host " Existing preview alias = NOT ROUTABLE"
    Write-Host " Next action = fresh preview version upload"
}
Write-Host " New version uploaded = NO"
Write-Host " Production deployment = NO"
Write-Host " Repository = CLEAN"
Write-Host " Report = $ReportPath"
Write-Host "==================================================" -ForegroundColor Green
