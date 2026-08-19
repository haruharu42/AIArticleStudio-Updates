param(
    [string]$ManifestPath = "latest.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ManifestPath)) {
    throw "Manifest not found: $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$uri = [Uri]$manifest.package_url
$packageName = [IO.Path]::GetFileName($uri.AbsolutePath)
$packagePath = Join-Path "updates" $packageName

if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "Package not found: $packagePath"
}

$actualHash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToUpperInvariant()
$expectedHash = ([string]$manifest.sha256).ToUpperInvariant()
if ($actualHash -ne $expectedHash) {
    throw "SHA256 mismatch. Expected $expectedHash but got $actualHash"
}

$root = Join-Path $env:RUNNER_TEMP ("aiarticle-release-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $root -Force | Out-Null
try {
    Expand-Archive -LiteralPath $packagePath -DestinationPath $root -Force

    $updateScript = Get-ChildItem -LiteralPath $root -Recurse -File -Filter "Update.ps1" | Select-Object -First 1
    if (-not $updateScript) {
        throw "Update.ps1 is missing from package."
    }

    $parseFailures = @()
    Get-ChildItem -LiteralPath $root -Recurse -File -Filter "*.ps1" | ForEach-Object {
        $tokens = $null
        $errors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        if ($errors -and $errors.Count -gt 0) {
            foreach ($err in $errors) {
                $parseFailures += ("{0}: {1}" -f $_.FullName, $err.Message)
            }
        }
    }

    if ($parseFailures.Count -gt 0) {
        throw ("PowerShell 5.1 parse validation failed:`n" + ($parseFailures -join "`n"))
    }

    Write-Host "WINDOWS POWERSHELL 5.1 VALIDATION OK"
    Write-Host ("Package: " + $packageName)
    Write-Host ("SHA256 : " + $actualHash)
}
finally {
    if (Test-Path -LiteralPath $root) {
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
}
