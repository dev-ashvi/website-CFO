# AI CFO V1 — Controlled semantic migration

## Default path (current)

`EvidenceEnvelope` → LLM emits **controlled semantic classification** → Python validates → `DeterministicCfoAnswerComposer` builds headline, interpretation, evidence, and caveat.

Model JSON:

```json
{
  "driver_stage": "PRODUCT | CHANNEL | MARKETING | REVENUE_QUALITY | MIXED | UNKNOWN",
  "insight_type": "CONTRIBUTION_LEADER | … | INSUFFICIENT_EVIDENCE",
  "evidence_ids": ["…"]
}
```

No user-facing prose from the model. Numbers come only from verified EvidenceEnvelope items.

## Responsibility boundary

| Owner | Owns |
|-------|------|
| **Model** | Relevance, evidence-ID selection, insight/driver classification |
| **Python** | Financial truth, numbers, signal semantics, driver/insight validation, headline, interpretation templates, caveats, formatting, safety |

## Feature switches

| Env | Behavior |
|-----|----------|
| `WYZ_AI_CFO_ANSWER_MODE=semantic` (default) | Controlled InsightType path |
| `WYZ_AI_CFO_ANSWER_MODE=semantic_prose` | Deprecated free-form interpretation (debug) |
| `WYZ_AI_CFO_ANSWER_MODE=legacy_full_answer` | Deprecated full JSON answer + validate/correct/fallback |

## Compatibility rules (summary)

- `TOP_CONTRIBUTOR` alone → `CONTRIBUTION_LEADER` only (not `MARGIN_PRESSURE` / `MARKETING_PRESSURE`)
- Cost concentration alone ≠ weak economics / margin leak
- Unsupported insight/driver → deterministic override (no model retry)
- Invalid evidence IDs discarded; deterministic selection fills gaps

Legacy full-answer code remains for regression. Prefer controlled semantic selection + deterministic composition for production V1.
