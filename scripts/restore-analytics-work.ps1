#Requires -Version 5.1
<#
.SYNOPSIS
  Restore a backup archive into wyz_analytics_data. Requires -Archive and -ConfirmRestore.
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Archive,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Volume = "wyz_analytics_data"

if (-not (Test-Path $Archive)) { throw "Archive not found: $Archive" }
if (-not $ConfirmRestore) {
  Write-Host "Refusing to overwrite active pilot data without -ConfirmRestore." -ForegroundColor Yellow
  Write-Host "Example:"
  Write-Host "  .\scripts\restore-analytics-work.ps1 -Archive `"$Archive`" -ConfirmRestore"
  exit 1
}

$abs = (Resolve-Path $Archive).Path
$dir = Split-Path $abs -Parent
$name = Split-Path $abs -Leaf

Write-Host "WARNING: This replaces contents of Docker volume $Volume"
Write-Host "Archive: $abs"
Write-Host "Ensure the local-pilot stack is stopped first (compose down WITHOUT -v)."

docker volume inspect $Volume 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  docker volume create $Volume | Out-Null
}

docker run --rm `
  -v "${Volume}:/data" `
  -v "${dir}:/backup:ro" `
  alpine:3.20 `
  sh -c "rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null; tar -xzf /backup/$name -C /data"

if ($LASTEXITCODE -ne 0) { throw "restore failed" }
Write-Host "Restore complete. Start stack: .\scripts\local-cfo-pilot-up.ps1"
Write-Host "Verify datasets/decisions/feedback in the UI."
