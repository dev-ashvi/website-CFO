#Requires -Version 5.1
<#
.SYNOPSIS
  Build SPA + start local CFO pilot stack on 127.0.0.1:8080 only.
#>
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Analytics = Join-Path $Root "services\analytics"
$EnvFile = Join-Path $Analytics ".env.local-pilot"
$Example = Join-Path $Analytics ".env.local-pilot.example"
$FrontendDist = Join-Path $Analytics "frontend-dist"

if (-not (Test-Path $EnvFile)) {
  Copy-Item $Example $EnvFile
  Write-Host "Created $EnvFile - edit secrets (WYZ_PILOT_USERS, tokens, API key) then re-run." -ForegroundColor Yellow
  exit 1
}

Write-Host "==> Building SPA (production dist)"
Push-Location $Root
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

$Dist = Join-Path $Root "dist"
if (-not (Test-Path $Dist)) { throw "dist/ missing after build" }
New-Item -ItemType Directory -Force -Path $FrontendDist | Out-Null
robocopy $Dist $FrontendDist /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
# robocopy exit codes 0-7 are success-ish
if ($LASTEXITCODE -ge 8) { throw "robocopy failed: $LASTEXITCODE" }

$sha = "local-pilot"
try { $sha = (git -C $Root rev-parse --short HEAD 2>$null) } catch {}

Write-Host "==> Starting compose (release=$sha)"
Push-Location $Analytics
$env:WYZ_RELEASE_SHA = $sha
$env:WYZ_FRONTEND_DIST = "./frontend-dist"
docker compose -f docker-compose.yml -f docker-compose.local-pilot.yml --env-file .env.local-pilot up -d --build
if ($LASTEXITCODE -ne 0) { Pop-Location; exit $LASTEXITCODE }
Pop-Location

Write-Host "==> Waiting for http://127.0.0.1:8080/api/v1/analytics/health"
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8080/api/v1/analytics/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
}
if (-not $ok) { throw "Health check failed on 127.0.0.1:8080" }

Write-Host ""
Write-Host "Local pilot API: http://127.0.0.1:8080/api/v1/analytics/health (API-only; no SPA on :8080)"
Write-Host "Production UI:   https://financewyz.ai  (VITE_ANALYTICS_API_BASE_URL=https://pilot.financewyz.ai)"
Write-Host "Verify host ports: docker compose ... ps  (only 127.0.0.1:8080 should be published)"
Write-Host "DANGER: docker compose down -v destroys wyz_analytics_data"
