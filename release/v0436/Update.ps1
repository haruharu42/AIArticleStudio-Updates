$ErrorActionPreference = 'Stop'
$scriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Run this file with -File .\Update.ps1' }
$packageRoot = Split-Path -Parent $scriptFile
$target = Join-Path $env:LOCALAPPDATA 'AIArticleStudio'
$python = Join-Path $target '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) { throw 'Private Python environment was not found.' }

& $python (Join-Path $packageRoot 'phase36_v0436_preflight.py') --app-root $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 preflight failed. No changes were applied.' }

& $python (Join-Path $packageRoot 'patch_v0436.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 Admin User Mode patch failed.' }

& $python (Join-Path $packageRoot 'cleanup_v0436.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 safe cache cleanup failed.' }

& $python (Join-Path $packageRoot 'set_version_v0436.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 version update failed.' }

& $python -m compileall -q -f (Join-Path $target 'src\ai_article_studio')
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 Python compile validation failed.' }

& $python (Join-Path $packageRoot 'validate_v0436.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.6 validation failed.' }

Write-Host ''
Write-Host 'UPDATE SUCCESS' -ForegroundColor Green
Write-Host 'AI Article Studio v0.4.3.6 is installed.'
Write-Host 'Admin action buttons and Admin/User display-mode switching are available.'
