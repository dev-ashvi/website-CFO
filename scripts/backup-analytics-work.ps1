#Requires -Version 5.1
<#
.SYNOPSIS
  Backup Docker named volume wyz_analytics_data to a timestamped .tgz on the host.
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackupDir = Join-Path $Root "backups\wyz-analytics-work"
$Volume = "wyz_analytics_data"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutFile = Join-Path $BackupDir "wyz-analytics-work-$stamp.tgz"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

Write-Host "Backing up volume $Volume -> $OutFile"
docker run --rm `
  -v "${Volume}:/data:ro" `
  -v "${BackupDir}:/backup" `
  alpine:3.20 `
  tar -czf "/backup/wyz-analytics-work-$stamp.tgz" -C /data .

if ($LASTEXITCODE -ne 0) { throw "backup failed" }
Write-Host "OK: $OutFile"
Write-Host "Restore: .\scripts\restore-analytics-work.ps1 -Archive `"$OutFile`""
