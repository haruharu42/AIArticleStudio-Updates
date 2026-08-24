$ErrorActionPreference = 'Stop'
$scriptFile = $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($scriptFile)) { throw 'Run this file with -File .\Update.ps1' }
$packageRoot = Split-Path -Parent $scriptFile
$target = Join-Path $env:LOCALAPPDATA 'AIArticleStudio'
$python = Join-Path $target '.venv\Scripts\python.exe'
$authUi = Join-Path $target 'src\ai_article_studio\ui\auth_ui.py'
$payloadUi = Join-Path $packageRoot 'payload\ui\auth_ui.py'
if (-not (Test-Path $python)) { throw 'Private Python environment was not found.' }
if (-not (Test-Path $authUi)) { throw 'Installed auth_ui.py was not found.' }
if (-not (Test-Path $payloadUi)) { throw 'Packaged auth_ui.py was not found.' }

$beforeHash = (Get-FileHash -LiteralPath $authUi -Algorithm SHA256).Hash.ToUpperInvariant()
$payloadHash = (Get-FileHash -LiteralPath $payloadUi -Algorithm SHA256).Hash.ToUpperInvariant()

& $python (Join-Path $packageRoot 'phase36_v0437_preflight.py') --app-root $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 preflight failed. No changes were applied.' }

& $python (Join-Path $packageRoot 'patch_v0437.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 Admin UI payload repair failed.' }

& $python (Join-Path $packageRoot 'cleanup_v0437.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 safe cache cleanup failed.' }

& $python (Join-Path $packageRoot 'set_version_v0437.py') $target
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 version update failed.' }

& $python -m compileall -q -f (Join-Path $target 'src\ai_article_studio')
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 Python compile validation failed.' }

& $python (Join-Path $packageRoot 'validate_v0437.py') $target $packageRoot
if ($LASTEXITCODE -ne 0) { throw 'v0.4.3.7 validation failed.' }

$afterHash = (Get-FileHash -LiteralPath $authUi -Algorithm SHA256).Hash.ToUpperInvariant()
if ($afterHash -ne $payloadHash) { throw 'Installed auth_ui.py does not match the verified package payload.' }

Write-Host ''
Write-Host 'UPDATE SUCCESS' -ForegroundColor Green
Write-Host 'AI Article Studio v0.4.3.7 is installed.'
Write-Host "auth_ui.py before : $beforeHash"
Write-Host "auth_ui.py after  : $afterHash"
Write-Host "payload SHA256    : $payloadHash"
Write-Host 'Close every AI Article Studio window, then start the application again.' -ForegroundColor Yellow
