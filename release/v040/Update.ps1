$ErrorActionPreference = 'Stop'
$scriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Run this file with -File .\Update.ps1' }
$packageRoot = Split-Path -Parent $scriptFile
$target = Join-Path $env:LOCALAPPDATA 'AIArticleStudio'
$appFile = Join-Path $target 'src\ai_article_studio\ui\app.py'
$initFile = Join-Path $target 'src\ai_article_studio\__init__.py'
$python = Join-Path $target '.venv\Scripts\python.exe'
if (-not (Test-Path $appFile)) { throw "AI Article Studio is not installed: $appFile" }
if (-not (Test-Path $initFile)) { throw "AI Article Studio version file was not found: $initFile" }
if (-not (Test-Path $python)) { throw 'Private Python environment was not found.' }

& $python (Join-Path $packageRoot 'phase35_v040_preflight.py') --app-root $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.0 preflight failed. No changes were applied.' }

& $python (Join-Path $packageRoot 'patch_v040.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.0 patch failed.' }

& $python -m compileall -q (Join-Path $target 'src\ai_article_studio')
if ($LASTEXITCODE -ne 0) { throw 'v0.4.0 Python compile validation failed.' }

& $python (Join-Path $packageRoot 'validate_v040.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.0 feature validation failed.' }

Write-Host ''
Write-Host 'UPDATE SUCCESS' -ForegroundColor Green
Write-Host 'AI Article Studio v0.4.0 is installed.'
Write-Host 'Phase 3.5 Web AI production workflow is integrated.'
Write-Host 'Restart AI Article Studio.'
