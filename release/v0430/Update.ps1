$ErrorActionPreference = 'Stop'
$scriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Run this file with -File .\Update.ps1' }
$packageRoot = Split-Path -Parent $scriptFile
$target = Join-Path $env:LOCALAPPDATA 'AIArticleStudio'
$python = Join-Path $target '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Private Python environment was not found.' }

& $python (Join-Path $packageRoot 'phase36_v0430_preflight.py') --app-root $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 preflight failed. No changes were applied.' }

& $python (Join-Path $packageRoot 'patch_v0430.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 creation-flow patch failed.' }

& $python (Join-Path $packageRoot 'cleanup_v0430.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 safe cache cleanup failed.' }

& $python (Join-Path $packageRoot 'set_version_v0430.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 version update failed.' }

& $python -m compileall -q -f (Join-Path $target 'src\ai_article_studio')
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 Python compile validation failed.' }

& $python (Join-Path $packageRoot 'validate_v0430.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.0 validation failed.' }

Write-Host ''
Write-Host 'UPDATE SUCCESS' -ForegroundColor Green
Write-Host 'AI Article Studio v0.4.3.0 is installed.'
Write-Host 'Step 4 now uses the original validated creation action, and AI-auto theme selection is available.'
