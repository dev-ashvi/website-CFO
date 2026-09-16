# Local CFO Pilot Test Report (P6L)

**Date:** 2026-09-16 (local)  
**Entrypoint tested:** `http://127.0.0.1:8080`  
**Method:** `scripts/local-cfo-pilot-smoke.py` + backup/restore script checks + Docker port inspection  
**Rule:** PASS only if exercised; no Cloudflare configuration attempted.

## Results

| Check | Result | Notes |
|-------|--------|-------|
| startup | **PASS** | Compose up; containers healthy |
| health | **PASS** | `GET /api/v1/analytics/health` → 200 via Caddy → analytics-api |
| readiness | **PASS** | `GET /api/v1/analytics/ready` via BFF after pilot login; `provider=openai_compatible`, `key_configured=False` |
| pilot authentication | **PASS** | `POST /api/v1/pilot-auth/login` → `wyz-pilot.*`, `is_demo=false` |
| demo token rejection | **PASS** | Bearer `wyz-demo-*` → 401 (`WYZ_BFF_REJECT_DEMO=true`) |
| unauthenticated API | **PASS** | No bearer → 401 |
| SPA production build | **PASS** | Caddy serves built `index.html` + `/assets/*` (not Vite) |
| host exposure | **PASS** | Only `caddy` publishes `127.0.0.1:8080`; api/worker/bff internal only; no `:8788` host publish |
| dataset upload | **PASS** | BeautyCo CSVs from `%USERPROFILE%\Downloads` |
| analysis | **PASS** | Job `COMPLETED`; result fetchable |
| hard refresh | **PASS** | Re-GET dataset + result after analysis |
| dataset restore (library list) | **PASS** | Dataset remains listed in library |
| AI CFO question | **NOT TESTED** | No `WYZ_AI_CFO_API_KEY` / `NVIDIA_API_KEY` in `.env.local-pilot`; API returns `AI_PROVIDER_UNAVAILABLE` (503) |
| diagnostic question | **NOT TESTED** | Same — requires live provider key |
| scenario | **PASS** | Deterministic what-if path succeeded without live AI key |
| follow-up / reconsider | **NOT TESTED** | Requires live provider key |
| track decision | **PASS** | Strategic decision created |
| review decision | **PASS** | Exercised via `POST .../strategic-decisions/{id}/status` with `RESOLVED` (AI `/review` not available without key) |
| feedback | **PASS** | `POST .../ai-feedback` accepted |
| container restart + persistence | **PASS** | Force-recreate api/worker/bff **without** `-v`; dataset + result + decisions still present on named volume `wyz_analytics_data` |
| telemetry present | **PASS** | Structured JSON events in api logs (`http_request_completed`, decision events, ai-related markers) |
| telemetry no secrets | **PASS** | Spot-check: no pilot passwords / token env dumps / `nvapi-` in recent logs |
| backup script | **PASS** | Created timestamped `.tgz` under `backups/wyz-analytics-work/` |
| restore safety | **PASS** | Refuses without `-ConfirmRestore`; refuses missing archive |

## AI configuration verified (env only)

Inside running `analytics-api`:

- `WYZ_AI_CFO_PROVIDER=openai_compatible`
- `WYZ_AI_CFO_MODEL=openai/gpt-oss-20b`
- `WYZ_AI_CFO_STRATEGY_MODE=v2_partner`
- Provider key: **not configured** → live AI connectivity **NOT TESTED**

## Limitations

1. Live NVIDIA / OpenAI-compatible calls were not exercised (no API key in local env).
2. AI-backed strategic `/review` path was not exercised; status update path was.
3. Cloudflare Access / Tunnel **not configured** (intentional stop point).
4. Full browser UI click-through was not automated; API + SPA asset serving were.

## Artifacts

- `services/analytics/.p6l-smoke-report.json`
- `services/analytics/.p6l-smoke-ids.json`
- Backup example: `backups/wyz-analytics-work/wyz-analytics-work-*.tgz` (gitignored)

---

## LIVE AI CFO VALIDATION

**Date:** 2026-09-16  
**Path:** `http://127.0.0.1:8080` → Caddy → BFF pilot session → analytics-api (`openai_compatible` / `openai/gpt-oss-20b` / `v2_partner`)  
**Dataset:** `ds_a06176e5f8a9` (BeautyCo, analysis COMPLETED)  
**Engine baseline:** net_revenue ≈ ₹14.14 Cr; CM2 ≈ ₹2.35 Cr; marketing_spend ≈ ₹2.87 Cr; worst CM2 channel = D2C Website  
**Provider config in containers:** `key_configured=True` via `NVIDIA_API_KEY` (value never printed/logged in this validation)  
**Artifacts:** `services/analytics/.p6l-live-ai-report.json`, `.p6l-live-ai-diagnose.json`

| # | Test | Result | Intent | Tools invoked | answer_source | Provider/model | Scenario/reconsider | Validation/fallback | Semantic correctness | Notes |
|---|------|--------|--------|---------------|---------------|----------------|---------------------|---------------------|----------------------|-------|
| 1 | Normal financial question (“How is my business doing?”) | **PASS** | overview / explicit_user_text | none listed in `tool_calls` (evidence from verified signals) | `model_semantic` | provider_calls=1; model env `openai/gpt-oss-20b`; latency ≈5.8s | n/a | no clamp/fallback observed | **PASS** — evidence-backed contributor framing | D2C CM1 signal cited; not generic empty advice |
| 2 | Deterministic factual (“What is my revenue?”) | **PASS** | factual revenue | override path (deterministic facts) | `model_semantic_with_deterministic_override` | provider_calls=1; latency ≈13s | n/a | deterministic override applied | **PASS** — net_revenue **141371321.67** matches engine | Evidence `summary:net_revenue`; formatted ₹14.14 Cr |
| 3 | Diagnostic (“What is hurting my profitability?”) | **PASS** | diagnostic | signal evidence (CM1/CM2) | `model_semantic` | provider_calls=1; latency ≈22s | n/a | none observed | **PASS with note** | Mixed margin-stage framing + verified signals; can under-emphasize CM2 drag (D2C) vs top contributors |
| 4 | Drill-down follow-up (“Which channel…?”) | **PASS** | follow-up / channel | deterministic override + channel signals | `model_semantic_with_deterministic_override` | provider_calls=1; latency ≈8.3s | conversation context retained | none observed | **PASS** — D2C Website referenced with engine-aligned revenue | Context survived prior diagnostic turn |
| 5 | Scenario (−15% marketing) | **PASS** | scenario | `get_current_financial_view` | `deterministic_scenario` | provider_calls=0 (correct) | scenario path recorded; spec MARKETING_SPEND −15% | n/a | **PASS** — arithmetic from scenario engine | CM2 ₹2.35 Cr → ₹2.78 Cr; evidence provenance SCENARIO_CALCULATED |
| 6 | Scenario follow-up / reconsider (−10%) | **FAIL** | intended scenario follow-up | none (refused) | `deterministic_scenario_refusal` | provider_calls=0 | **reconsider/scenario follow-up NOT applied** (`refusal_code=UNPARSED`) | refusal | **FAIL** — anaphoric “instead…only 10%” not parsed | Control PASS when lever named explicitly: marketing −10% → CM2 ₹2.64 Cr |
| 7 | Strategic recommendation (“…what would you recommend?”) | **FAIL** | intended strategic | semantic evidence only | `deterministic_semantic` | model `openai/gpt-oss-20b`; tokens observed on re-ask (e.g. in/out) | no strategic_recommendation object | fell through to semantic | **FAIL** — contributor highlight, not action recommendation | Headline about Q-commerce CM2 contributor; `strategic=false` |
| 8 | Track decision | **PASS** | decision create | n/a | n/a | n/a | decision_id `sdr_8e3689c386e1` | n/a | **PASS** | HTTP 201 |
| 9 | Review tracked decision | **PASS** | decision review | evidence from current_financial_view | AI `/review` succeeded | live review path | decision telemetry emitted | n/a | **PASS** | “investigate verified drivers…”; CM2 evidence matches engine ₹2.35 Cr |
| 10 | Feedback Useful | **PASS** | feedback | n/a | n/a | n/a | n/a | n/a | **PASS** | HTTP 201; feedback list persistence confirmed |

### Telemetry / privacy (live)

| Check | Result |
|-------|--------|
| Provider latency recorded | **PASS** (`provider_latency_ms` / end-to-end on AI turns; scenario turns near-instant) |
| Token usage recorded when returned | **PASS** on inspected turns (`input_tokens` / `output_tokens` present in answer telemetry for model turns); not always copied to every summary field |
| Decision telemetry | **PASS** (`strategic_decision_*` / decision events in api logs) |
| Feedback persisted | **PASS** |
| API key in logs | **PASS** (absent) |
| Raw financial row dumps in telemetry | **PASS** (no heavy `order_line_id` dumps) |

### Failures diagnosed (no broad fix applied)

1. **Scenario anaphora (test 6)**  
   - Symptom: `What if instead I reduce it by only 10%?` → `UNPARSED` refusal despite prior −15% marketing scenario in conversation.  
   - Control: `What if marketing spend decreases by 10% instead?` → **PASS** (`deterministic_scenario`, −10%).  
   - Cause: `_FOLLOWUP_PCT` / `_FOLLOWUP_DIRECTION` in `scenario/parse.py` only match narrow “what about / how about …” shapes; “what if instead I reduce it …” is not inherited from `previous_scenario`.  
   - **Smallest proposed correction:** extend follow-up regexes (or add an `instead` + percent + reduce/increase branch) to reuse prior lever/direction from `previous_scenario` when the lever is omitted.

2. **Strategic routing (test 7)**  
   - Symptom: recommendation ask returns semantic contributor answer (`deterministic_semantic`), not strategic partner recommendation.  
   - **Smallest proposed correction:** inspect intent routing for recommendation phrasing after semantic/scenario turns under `v2_partner` and ensure “what would you recommend?” enters the strategic path (no engine/math changes).

### Live AI overall

**P6L CFO PILOT READY (live AI) = NO** — blocked by scenario follow-up parse failure and missing strategic recommendation path on the recommendation prompt. Infrastructure + factual/scenario(explicit)/decision/feedback paths are strong.

---

## P6L.1 — Conversational Routing Regression

**Date:** 2026-09-16  
**Scope:** scenario follow-up anaphora + strategic recommendation routing only  
**Entrypoint:** `http://127.0.0.1:8080` (BFF) with live NVIDIA/`openai_compatible` / `openai/gpt-oss-20b` / `v2_partner`  
**Artifact:** `services/analytics/.p6l1-live-report.json`

### Root causes

1. **Scenario follow-up:** `_FOLLOWUP_*` patterns did not match anaphoric phrases (`instead I reduce it by only 10%`, `only 5%`, `Make that 12%`). Additionally, the live SPA echoes `conversation.scenario_spec` without `previous_turns`, while `_previous_scenario_spec` / `ask_ai_cfo` only consumed `previous_turns` — so prior lever context was dropped on the wire.
2. **Strategic routing:** `classify_capability` / decide patterns lacked recommendation phrases such as `what would you recommend`, `would you recommend`, `which option would you choose`, `given this, what should/would…`.

### Files changed

- `services/analytics/src/wyz_analytics/ai_cfo/scenario/parse.py`
- `services/analytics/src/wyz_analytics/ai_cfo/guards/capability.py`
- `services/analytics/src/wyz_analytics/ai_cfo/strategy/intent.py`
- `services/analytics/src/wyz_analytics/ai_cfo/guards/orchestrator.py`
- `services/analytics/src/wyz_analytics/ai_cfo/conversation.py` (`previous_turns_from_client_payload`)
- `services/analytics/src/wyz_analytics/workers/service.py`
- `services/analytics/tests/test_p6l1_conversational_routing.py` (new)
- `scripts/local-cfo-pilot-p6l1-live.py` (live harness)

### Regression tests

`pytest tests/test_p6l1_conversational_routing.py tests/test_ai_cfo_scenario.py` → **PASS**

Covered: inherit −10%/−5%/12%; revenue override → `UNSUPPORTED_REVENUE`; no-prior / ambiguous-prior refusals; strategic capability phrases; negative control calc question remains scenario; after-diagnostic / after-scenario strategic path with fake model; conversation-shell prior promotion.

### Live sequence results

| Step | Result | Notes |
|------|--------|-------|
| 1 Diagnostic | **PASS** | `model_semantic_with_deterministic_override`; model `openai/gpt-oss-20b`; evidence cm2 |
| 2 Scenario −15% | **PASS** | `deterministic_scenario`; MARKETING_SPEND −15%; CM2 ₹2.35→₹2.78 Cr |
| 3 Anaphora −10% | **PASS** | `deterministic_scenario` + `DETERMINISTIC_FOLLOWUP`; `scenario_reconsider=true`; MARKETING_SPEND −10%; CM2 ₹2.35→₹2.64 Cr; provider_calls=0 |
| 4 Strategic recommend | **PASS** | `model_strategic`; action `INVESTIGATE`; strength `MODERATE`; confidence `MEDIUM`; evidence cm2/cm1/net_revenue; latency ~7s |
| 5 Track decision | **PASS** | HTTP 201 |
| 6 Review decision | **PASS** | HTTP 200; strategic review path (`deterministic_strategic_fallback` on this run, still evidence-grounded) |

### Telemetry / privacy

- No API key in logs  
- No raw order-line dumps  
- Scenario reconsider flags recorded (`scenario_reconsider`, `scenario_parse_source=DETERMINISTIC_FOLLOWUP`)  
- Strategic path recorded (`model_strategic`, selected action / strength / confidence)

### Regressions

None observed in `test_ai_cfo_scenario.py` follow-up suite.

### Overall after P6L.1

**CFO PILOT READY = YES** (local live AI blockers from P6L validation cleared; Cloudflare still not configured).
