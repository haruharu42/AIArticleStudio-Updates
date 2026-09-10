param(
    [string]$RepoRoot = "C:\Users\ragno\Desktop\新しいフォルダー\AIArticleStudio-Dev",
    [string]$InstallRoot = "$env:LOCALAPPDATA\AIArticleStudio"
)

$ErrorActionPreference = "Stop"
$Branch = "implementation/phase12-17-batch"
$RelativeModels = "src/ai_article_studio/core/models.py"
$InstalledModels = Join-Path $InstallRoot "src\ai_article_studio\core\models.py"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Worktree = Join-Path $env:USERPROFILE "Downloads\AAS-Models-Recovery-$Stamp"
$BackupRoot = Join-Path $env:USERPROFILE "Downloads\AIArticleStudio-Models-Baseline-Backup-$Stamp"
$KeepWorktree = $false

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " AAS ArticleRecord Baseline Recovery"
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "RepoRoot not found: $RepoRoot"
}
if (-not (Test-Path -LiteralPath $InstalledModels -PathType Leaf)) {
    throw "Installed models.py not found: $InstalledModels"
}

$Bytes = [System.IO.File]::ReadAllBytes($InstalledModels)
if ($Bytes.Length -lt 50) {
    throw "Installed models.py is unexpectedly small"
}

$InstalledHash = (Get-FileHash -LiteralPath $InstalledModels -Algorithm SHA256).Hash
Write-Host "Installed models.py SHA256 =" $InstalledHash

New-Item -ItemType Directory -Path $BackupRoot -Force:$false | Out-Null
Copy-Item -LiteralPath $InstalledModels -Destination (Join-Path $BackupRoot "models.py") -Force
$InstalledHash | Set-Content -LiteralPath (Join-Path $BackupRoot "models.py.sha256.txt") -Encoding ASCII
Write-Host "Backup =" $BackupRoot

Set-Location $RepoRoot
if (@(git status --porcelain).Count -ne 0) {
    throw "Stable worktree is not clean. Recovery aborted."
}

git fetch origin --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$RemoteRef = "origin/$Branch"
$RemoteHeadBefore = (git rev-parse $RemoteRef).Trim()
Write-Host "Development branch base =" $RemoteHeadBefore

try {
    git worktree add --detach $Worktree $RemoteRef
    if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

    $TargetModels = Join-Path $Worktree "src\ai_article_studio\core\models.py"
    if (Test-Path -LiteralPath $TargetModels -PathType Leaf) {
        $ExistingHash = (Get-FileHash -LiteralPath $TargetModels -Algorithm SHA256).Hash
        if ($ExistingHash -eq $InstalledHash) {
            Write-Host "models.py is already restored with the same SHA256." -ForegroundColor Green
            return
        }
        throw "Development branch already contains a different models.py"
    }

    Copy-Item -LiteralPath $InstalledModels -Destination $TargetModels -Force
    $CopiedHash = (Get-FileHash -LiteralPath $TargetModels -Algorithm SHA256).Hash
    if ($CopiedHash -ne $InstalledHash) {
        throw "Copied models.py hash mismatch"
    }

    $Text = Get-Content -LiteralPath $TargetModels -Raw -Encoding UTF8
    if ($Text -notmatch 'class\s+ArticleRecord') {
        throw "Installed models.py does not define ArticleRecord"
    }
    if ($Text -match 'sb_secret_' -or $Text -match '(?i)service[_-]?role\s*[=:]\s*["'']') {
        throw "Potential secret material detected in models.py"
    }

    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $env:PYTHONPATH = Join-Path $Worktree "src"
    Set-Location $Worktree

    Write-Host "Running Python compile validation..." -ForegroundColor Yellow
    python -m py_compile $TargetModels
    if ($LASTEXITCODE -ne 0) { throw "models.py py_compile failed" }

    Write-Host "Running ArticleRecord import validation..." -ForegroundColor Yellow
    @'
from ai_article_studio.core.models import ArticleRecord
record = ArticleRecord()
payload = record.to_dict()
assert isinstance(payload, dict)
assert payload.get("article_id")
assert "created_at" in payload
assert "updated_at" in payload
assert "request" in payload
assert "content" in payload
print("PASS ArticleRecord import/default/to_dict")
'@ | python -
    if ($LASTEXITCODE -ne 0) { throw "ArticleRecord runtime validation failed" }

    Write-Host "Running the regression that exposed the missing baseline..." -ForegroundColor Yellow
    python scripts/test_v0432_publish_copy.py
    if ($LASTEXITCODE -ne 0) { throw "test_v0432_publish_copy.py failed" }

    $Changed = @(
        git status --porcelain |
        ForEach-Object { $_.Substring(3).Replace("\", "/") }
    )
    if ($Changed.Count -ne 1 -or $Changed[0] -ne $RelativeModels) {
        $Changed
        throw "Recovery scope is not exactly models.py"
    }

    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "git diff --check failed" }

    git add -- $RelativeModels
    if ($LASTEXITCODE -ne 0) { throw "git add failed" }

    $Staged = @(git diff --cached --name-only)
    if ($Staged.Count -ne 1 -or $Staged[0] -ne $RelativeModels) {
        $Staged
        throw "Staged scope is not exactly models.py"
    }

    git diff --cached --check
    if ($LASTEXITCODE -ne 0) { throw "staged diff check failed" }

    git commit -m "fix: restore ArticleRecord baseline model"
    if ($LASTEXITCODE -ne 0) { throw "commit failed" }

    $RecoveryCommit = (git rev-parse HEAD).Trim()
    Write-Host "Recovery commit =" $RecoveryCommit

    git fetch origin --prune
    if ($LASTEXITCODE -ne 0) {
        $KeepWorktree = $true
        throw "pre-push fetch failed; recovery worktree retained"
    }

    $RemoteHeadNow = (git rev-parse $RemoteRef).Trim()
    if ($RemoteHeadNow -ne $RemoteHeadBefore) {
        $KeepWorktree = $true
        throw "Development branch changed during recovery; no push performed. Worktree retained: $Worktree"
    }

    git push origin "HEAD:$Branch"
    if ($LASTEXITCODE -ne 0) {
        $KeepWorktree = $true
        throw "push failed; recovery commit retained in worktree: $Worktree"
    }

    git fetch origin --prune
    if ($LASTEXITCODE -ne 0) { throw "post-push fetch failed" }
    $RemoteHeadAfter = (git rev-parse $RemoteRef).Trim()
    if ($RemoteHeadAfter -ne $RecoveryCommit) {
        throw "Remote branch does not match recovery commit"
    }

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host " ARTICLE RECORD BASELINE RECOVERY: PASS"
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "models.py SHA256 =" $InstalledHash
    Write-Host "Remote HEAD       =" $RemoteHeadAfter
    Write-Host "Backup            =" $BackupRoot
}
catch {
    Write-Host "RECOVERY FAILED: $($_.Exception.Message)" -ForegroundColor Red
    throw
}
finally {
    Set-Location $RepoRoot
    if (-not $KeepWorktree -and (Test-Path -LiteralPath $Worktree -PathType Container)) {
        git worktree remove --force $Worktree 2>$null
        git worktree prune
    }
    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
}
