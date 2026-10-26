# Oracle Cloud — WYZ analytics internal CFO pilot (P4)

## Audit: current website hosting

| Fact | Result |
|------|--------|
| SPA production host | **Vercel static** (`vite build` + `vercel.json` SPA rewrite) |
| In-repo analytics BFF | **None** |
| Serverless APIs | Only `api/runway-insight.js` (runway, unrelated) |
| Vite pilot-token inject | **Dev-only** (`vite.config.js` proxy) |
| User JWT validation in analytics | **None** (`wyz_token` in localStorage; demo tokens possible) |

**STOP for “reuse existing BFF”:** there is no production path that can inject `WYZ_PILOT_API_TOKEN` without exposing it to the browser.

## Final topology (chosen)

```
Internet
  HTTPS :443
    → Caddy (TLS, SPA static, /api/v1/analytics/health → api)
         /api/v1/analytics/* → BFF :8080
              validates browser Bearer (session presence; rejects demo / pilot-token-as-Bearer)
              injects X-WYZ-Pilot-Token
              → analytics-api :8788  (Docker network ONLY — no public :8788)
                   ↔ analytics-worker
                   ↔ /data/wyz-analytics-work  (host bind mount)
              → outbound HTTPS to NVIDIA / OpenAI-compatible
```

Same-origin: serve the Vite `dist/` from Caddy on `WYZ_PILOT_DOMAIN` so the SPA calls `/api/v1/analytics` without `VITE_ANALYTICS_API_BASE_URL`.

Vercel can remain for marketing; the **CFO pilot app** for P4 should be the Oracle-hosted SPA (or a dedicated subdomain pointed at this stack).

## Suggested VM profile

| Item | Guidance |
|------|----------|
| Shape | Prefer **4 OCPU / 8–12 GB RAM** if Always Free / low-cost allows; else best available |
| Arch | Prefer **amd64** until ARM image is validated on the target shape |
| OS | Oracle Linux 8/9 or Ubuntu 22.04/24.04 |
| Disk | **50+ GB** block volume for OS + `/data/wyz-analytics-work` |
| Min RAM | ~4 GB may limp for tiny CSVs; **8 GB+ recommended** for BeautyCo-scale Polars spikes |
| Storage growth | Order CSVs + Parquet facts + results; start **clean** (do not copy the ~2 GB local duplicate BeautyCo store) |

## ARM vs amd64

**This developer machine (Docker Desktop):** `docker buildx build --platform linux/arm64` failed at `RUN` with `exec /bin/sh: exec format error` — no arm64 emulator/`binfmt` node registered.

**Recommendation for P4:** provision an **amd64** Oracle shape unless you first validate arm64 build+run on a Linux host with qemu binfmt (see commands below). Polars/pyarrow wheels exist for aarch64, but **untested** here.

## Prerequisites (manual Oracle console)

1. Create VM + attach block volume (optional) for `/data`.
2. Security List / NSG inbound: **22, 80, 443 only**. Never 8788.
3. DNS A/AAAA: `WYZ_PILOT_DOMAIN` → VM public IP.
4. SSH key auth; disable password login if possible.

## Bootstrap

```bash
# on VM as root
curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/bootstrap-oracle-pilot.sh | bash
# or copy scripts/bootstrap-oracle-pilot.sh and run
```

Creates `/opt/wyz`, `/data/wyz-analytics-work`, Docker, firewall baseline.

Mount extra block volume (example):

```bash
# after formatting/mounting once:
echo 'UUID=<volume-uuid> /data xfs defaults,nofail 0 2' >> /etc/fstab
mkdir -p /data/wyz-analytics-work
mount -a
```

## Secrets

```bash
cp services/analytics/.env.pilot.example /opt/wyz/.env.pilot
chmod 600 /opt/wyz/.env.pilot
# edit real values: domain, origins, pilot token, AI key
```

Never commit `/opt/wyz/.env.pilot`.

## Frontend build (same-origin)

```bash
# on build machine or VM
npm ci
npm run build
rsync -a --delete dist/ /opt/wyz/frontend-dist/
```

Do **not** set `VITE_ANALYTICS_API_BASE_URL` for this topology (relative `/api/v1/analytics`).

## Deploy

```bash
# repo checked out under /opt/wyz
chmod +x scripts/deploy-pilot.sh scripts/bootstrap-oracle-pilot.sh
export WYZ_APP_DIR=/opt/wyz
./scripts/deploy-pilot.sh
```

Compose command used:

```bash
docker compose \
  -f services/analytics/docker-compose.yml \
  -f services/analytics/docker-compose.pilot.yml \
  --env-file /opt/wyz/.env.pilot \
  up -d --build
```

Image tags: `wyz-analytics:<git-sha>` via `WYZ_RELEASE_SHA`.

## TLS

Caddy obtains certificates via ACME for `WYZ_PILOT_DOMAIN`.  
HTTP→HTTPS is handled by Caddy. Set `WYZ_ACME_EMAIL`.

## Network design

| Port | Exposure |
|------|----------|
| 443/80 | Public (Caddy) |
| 8080 BFF | Docker network only |
| 8788 API | Docker network only (`ports: !reset []` in pilot override) |
| Worker | No publish |

## BFF / pilot token

- Browser sends `Authorization: Bearer <wyz_token>` (existing SPA behavior).
- BFF rejects missing Bearer, demo tokens (`wyz-demo-*`), and Bearer equal to the pilot secret.
- BFF injects `X-WYZ-Pilot-Token` toward analytics.
- **Proof:** View built assets / Network tab — no `WYZ_PILOT_API_TOKEN` / `X-WYZ-Pilot-Token` from the browser. Only `Authorization: Bearer <session>`.

Full JWT signature verification requires the external auth backend secret (not in this repo) — deferred; session presence + demo rejection is the pilot gate.

## Health

| URL | Audience |
|-----|----------|
| `GET /api/v1/analytics/health` | Public via Caddy (includes `release`) |
| `GET /api/v1/analytics/ready` | Through BFF (auth required) / internal Docker |
| `GET /bff/health` | Internal BFF liveness |

## Logs / disk

- Docker `json-file` rotation: 50m × 5 (API/worker), 20m × 3 (BFF/Caddy).
- Disk checks: `df -h`, `du -sh /data/wyz-analytics-work` (warn ~80% full; do not fail `/ready`).

## Rollback

```bash
cd /opt/wyz
git checkout <known-good-sha>
WYZ_RELEASE_SHA=<known-good-sha> ./scripts/deploy-pilot.sh
# same /data/wyz-analytics-work — no volume delete
```

Never: `docker compose down -v`.

## Reboot acceptance

1. Create dataset, track decision, submit feedback.
2. `sudo reboot`
3. Confirm Docker + compose restart, mount present, dataset/result/decision/feedback intact.

## Provider smoke

```bash
docker compose ... exec analytics-api \
  python -c "from wyz_analytics.ai_cfo.providers import resolve_ai_cfo_model; m=resolve_ai_cfo_model(); print(type(m).__name__)"
# live: one strategic ask via UI with real key in .env.pilot — do not log the key
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| ACME fail | DNS A record, ports 80/443 open in NSG + host firewall |
| 401 from BFF | Logged-in session Bearer missing; demo token rejected |
| 401 from analytics | BFF missing `WYZ_PILOT_API_TOKEN` or token mismatch |
| Upload 413 | Align `WYZ_PROXY_MAX_BODY` / `WYZ_MAX_UPLOAD_MB` (100+) |
| ARM import errors | Switch to amd64 shape |

## P5 (not started)

Backup/restore rehearsal, ops runbook, disk-pressure automation, provider outage drills.
