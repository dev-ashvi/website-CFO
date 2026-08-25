"""Optional OpenAI-compatible JSON mapper. Not imported by the default test suite."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from wyz_analytics.mapping.ai_contract import (
    SchemaMappingProposal,
    SchemaMappingRequest,
    SchemaMappingResponse,
)
from wyz_analytics.mapping.models import MappingOrigin

_SYSTEM = (
    "You map messy commerce/finance CSV columns onto a canonical schema. "
    "Return JSON only with keys mappings, unmapped_source_columns, unresolved_required_fields. "
    "Each mapping needs source_column, canonical_field, model_confidence (0-1), reason_code. "
    "Only map unresolved fields. Do not invent financial totals. "
    "If two columns could match, leave the field unresolved rather than guessing."
)


class OpenAICompatibleSchemaMappingModel:
    """Thin HTTP JSON mapper. Instantiate only from live/eval entrypoints."""

    origin = MappingOrigin.AI_PROPOSED

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ):
        self.api_key = api_key or os.environ.get("WYZ_MAPPING_API_KEY") or os.environ.get("OPENAI_API_KEY")
        self.model = model or os.environ.get("WYZ_MAPPING_MODEL") or "gpt-4o-mini"
        self.base_url = (base_url or os.environ.get("WYZ_MAPPING_BASE_URL") or "https://api.openai.com/v1").rstrip("/")

    def propose(self, request: SchemaMappingRequest) -> SchemaMappingResponse:
        if not self.api_key:
            raise RuntimeError("No mapping API key configured; use FakeSchemaMappingModel in tests.")
        body = json.dumps(
            {
                "model": self.model,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": json.dumps(request.to_dict())},
                ],
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Mapping model request failed: {exc}") from exc
        content = payload["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        mappings = []
        for item in parsed.get("mappings") or []:
            if not item.get("source_column") or not item.get("canonical_field"):
                continue
            mappings.append(
                SchemaMappingProposal(
                    source_column=str(item["source_column"]),
                    canonical_field=str(item["canonical_field"]),
                    model_confidence=float(item.get("model_confidence") or 0.0),
                    reason_code=str(item.get("reason_code") or "model"),
                )
            )
        return SchemaMappingResponse(
            mappings=mappings,
            unmapped_source_columns=list(parsed.get("unmapped_source_columns") or []),
            unresolved_required_fields=list(parsed.get("unresolved_required_fields") or []),
        )
