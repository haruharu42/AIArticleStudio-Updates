$ErrorActionPreference = 'Stop'
$scriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Run this file with -File .\Update.ps1' }
$packageRoot = Split-Path -Parent $scriptFile
$target = Join-Path $env:LOCALAPPDATA 'AIArticleStudio'
$python = Join-Path $target '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Private Python environment was not found.' }

& $python (Join-Path $packageRoot 'phase36_v0429_preflight.py') --app-root $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.2.9 preflight failed. No changes were applied.' }

& $python (Join-Path $packageRoot 'patch_v0429.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.2.9 live Article Creator patch failed.' }

& $python (Join-Path $packageRoot 'set_version_v0429.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.2.9 version update failed.' }

& $python -m compileall -q -f (Join-Path $target 'src\ai_article_studio')
if ($LASTEXITCODE -ne 0) { throw 'v0.4.2.9 Python compile validation failed.' }

& $python (Join-Path $packageRoot 'validate_v0429.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.2.9 validation failed.' }

Write-Host ''
Write-Host 'UPDATE SUCCESS' -ForegroundColor Green
Write-Host 'AI Article Studio v0.4.2.9 is installed.'
Write-Host 'The real Article Creator navigation event now activates the approved six-step UI.'
