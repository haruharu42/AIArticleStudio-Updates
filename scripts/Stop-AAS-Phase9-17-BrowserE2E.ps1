param(
    [string]$RepoRoot = "C:\Users\ragno\Desktop\新しいフォルダー\AIArticleStudio-Dev",
    [string]$StateFile
)

$ErrorActionPreference = "Stop"

function Normalize-Path([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return "" }
    return ([System.IO.Path]::GetFullPath($Value)).TrimEnd('\', '/').Replace('\', '/').ToLowerInvariant()
}

function Get-RegisteredWorktreePaths {
    return @(
        git worktree list --porcelain |
            Where-Object { $_ -like "worktree *" } |
            ForEach-Object { Normalize-Path ($_.Substring(9)) }
    )
}

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

if ([string]::IsNullOrWhiteSpace($Worktree)) {
    throw "Worktree path is missing from state file."
}

$Downloads = [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "Downloads"))
$WorktreeFull = [System.IO.Path]::GetFullPath($Worktree)
$DownloadsPrefix = $Downloads.TrimEnd('\') + '\'
$WorktreeLeaf = Split-Path -Leaf $WorktreeFull
if (-not $WorktreeFull.StartsWith($DownloadsPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $WorktreeLeaf -notlike "AAS-Phase9-17-BrowserE2E-*") {
    throw "Refusing to clean unexpected worktree path: $WorktreeFull"
}

Write-Host "Stopping PWA process" $PidToStop -ForegroundColor Yellow
Stop-Process -Id $PidToStop -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
if (Get-Process -Id $PidToStop -ErrorAction SilentlyContinue) {
    Stop-Process -Id $PidToStop -Force -ErrorAction Stop
}

# Vite/Miniflare can leave node/workerd children alive after the launcher exits.
# Restrict cleanup to those runtime executables and this exact disposable path.
# Do not match powershell.exe: the helper itself receives -StateFile under the
# worktree path and would otherwise terminate itself before cleanup completes.
$RuntimeNames = @("node.exe", "workerd.exe")
$ChildProcesses = @(
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $RuntimeNames -contains $_.Name.ToLowerInvariant() -and
            $_.CommandLine -and
            $_.CommandLine.IndexOf(
                $WorktreeFull,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        }
)
foreach ($Process in ($ChildProcesses | Sort-Object ProcessId -Descending)) {
    Write-Host "Stopping E2E child process" $Process.ProcessId $Process.Name -ForegroundColor Yellow
    Stop-Process -Id ([int]$Process.ProcessId) -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2

$RemainingProcesses = @(
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $RuntimeNames -contains $_.Name.ToLowerInvariant() -and
            $_.CommandLine -and
            $_.CommandLine.IndexOf(
                $WorktreeFull,
                [System.StringComparison]::OrdinalIgnoreCase
            ) -ge 0
        }
)
if ($RemainingProcesses.Count -ne 0) {
    $RemainingProcesses |
        Select-Object ProcessId, ParentProcessId, Name, CommandLine |
        Format-Table -Wrap
    throw "E2E runtime processes are still using the worktree."
}

if (Test-Path -LiteralPath $RepoRoot -PathType Container) {
    Set-Location $RepoRoot

    $NormalizedWorktree = Normalize-Path $WorktreeFull
    $RegisteredPaths = Get-RegisteredWorktreePaths
    $IsRegistered = $RegisteredPaths -contains $NormalizedWorktree

    if ($IsRegistered) {
        git worktree remove --force $WorktreeFull
        $RemoveExitCode = $LASTEXITCODE

        if ($RemoveExitCode -ne 0) {
            # Git on Windows can unregister a worktree before directory removal
            # fails because a recently stopped process still had a file handle.
            # Re-check registration before deciding whether this is fatal.
            Start-Sleep -Milliseconds 750
            $RegisteredAfterFailure = Get-RegisteredWorktreePaths
            if ($RegisteredAfterFailure -contains $NormalizedWorktree) {
                throw "git worktree remove failed and metadata still remains: $WorktreeFull"
            }
        }
    }

    $RegisteredNow = Get-RegisteredWorktreePaths
    if (-not ($RegisteredNow -contains $NormalizedWorktree) -and
        (Test-Path -LiteralPath $WorktreeFull -PathType Container)) {
        # The path is no longer a registered worktree. Remove only the validated
        # disposable E2E directory; never run git clean/reset/restore here.
        Write-Host "Removing orphaned E2E directory" $WorktreeFull -ForegroundColor Yellow
        Remove-Item -LiteralPath $WorktreeFull -Recurse -Force -ErrorAction Stop
    }

    git worktree prune

    $RegisteredAfter = Get-RegisteredWorktreePaths
    if ($RegisteredAfter -contains $NormalizedWorktree) {
        throw "Worktree metadata still remains: $WorktreeFull"
    }
    if (Test-Path -LiteralPath $WorktreeFull) {
        throw "Worktree directory still remains: $WorktreeFull"
    }
}

Write-Host "BROWSER E2E CLEANUP: PASS" -ForegroundColor Green
Write-Host "State file was:" $StateFile
