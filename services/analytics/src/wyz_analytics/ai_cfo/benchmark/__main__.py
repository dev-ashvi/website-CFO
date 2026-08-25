"""CLI: python -m wyz_analytics.ai_cfo.benchmark [--live] [--models a,b] [--limit N] [--smoke].

Recommended evaluation sequence from ``services/analytics``::

  # 1) Guarded GPT-OSS baseline (full Q1–Q11)
  python -m wyz_analytics.ai_cfo.benchmark --live \\
    --models "openai/gpt-oss-20b" \\
    --out ".benchmark-results/benchmark-gpt-oss-20b-guarded.json"

  # 2) Smoke all NIM free candidates
  python -m wyz_analytics.ai_cfo.benchmark --live --candidate-set nim-free --smoke

  # 3) Q1 on promising candidates
  python -m wyz_analytics.ai_cfo.benchmark --live \\
    --models "minimaxai/minimax-m3,meta/muse-glimmer-30b" --limit 1

  # 4) Full Q1–Q11 on survivors only
  python -m wyz_analytics.ai_cfo.benchmark --live \\
    --models "minimaxai/minimax-m3" \\
    --out ".benchmark-results/benchmark-minimax-m3-guarded.json"

Relative ``--out`` paths are resolved from the current working directory.
Parent directories are created automatically before checkpoint/final writes.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _ensure_paths() -> None:
    here = Path(__file__).resolve()
    src = here.parents[2]
    analytics_root = here.parents[3]
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))
    if str(analytics_root) not in sys.path:
        sys.path.insert(0, str(analytics_root))


def _print(text: str) -> None:
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        print(text.encode("ascii", errors="replace").decode("ascii"), flush=True)


def main(argv: list[str] | None = None) -> int:
    _ensure_paths()
    from wyz_analytics.ai_cfo.benchmark.cases import DEFAULT_MODELS
    from wyz_analytics.ai_cfo.benchmark.candidates import resolve_candidate_models
    from wyz_analytics.ai_cfo.benchmark.output import record_output_write_result, write_benchmark_output
    from wyz_analytics.ai_cfo.benchmark.progress import make_progress_logger
    from wyz_analytics.ai_cfo.benchmark.report import format_report
    from wyz_analytics.ai_cfo.benchmark.runner import run_benchmark
    from wyz_analytics.ai_cfo.benchmark.smoke import run_provider_smoke
    from wyz_analytics.ai_cfo.openai_compatible import resolve_http_timeout_sec

    parser = argparse.ArgumentParser(description="WYZ BeautyCo AI CFO model benchmark")
    parser.add_argument("--live", action="store_true", help="Call OpenAI-compatible provider (requires API key)")
    parser.add_argument(
        "--models",
        default=",".join(DEFAULT_MODELS),
        help="Comma-separated model ids (default: gpt-oss-20b, llama-3.3-70b)",
    )
    parser.add_argument(
        "--candidate-set",
        default=None,
        help="Named candidate set (e.g. nim-free) — resolves --models when --models is default",
    )
    parser.add_argument("--base-url", default=None, help="Override WYZ_AI_CFO_BASE_URL")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N benchmark questions")
    parser.add_argument("--question", default=None, help="Run a single question id (e.g. Q1)")
    parser.add_argument("--smoke", action="store_true", help="Provider connectivity smoke test only (no CFO questions)")
    parser.add_argument("--verbose", action="store_true", help="Extra provider/tool-loop diagnostics")
    parser.add_argument("--json", action="store_true", help="Also print machine-readable JSON after the report")
    parser.add_argument("--out", default=None, help="Write/checkpoint JSON result to this path")
    parser.add_argument(
        "--http-timeout",
        type=float,
        default=None,
        help="Per-request HTTP timeout seconds (default WYZ_AI_CFO_HTTP_TIMEOUT_SEC or 90)",
    )
    parser.add_argument(
        "--question-timeout",
        type=float,
        default=None,
        help="Per-question wall-clock timeout seconds (default WYZ_AI_CFO_QUESTION_TIMEOUT_SEC or 300+)",
    )
    args = parser.parse_args(argv)

    default_models_str = ",".join(DEFAULT_MODELS)
    explicit_models = [item.strip() for item in args.models.split(",") if item.strip()]
    if args.candidate_set and args.models.strip() == default_models_str:
        models = resolve_candidate_models(candidate_set=args.candidate_set, models=None)
    else:
        models = explicit_models
    api_key = (
        os.environ.get("WYZ_AI_CFO_API_KEY")
        or os.environ.get("NVIDIA_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
    )
    base_url = args.base_url or os.environ.get("WYZ_AI_CFO_BASE_URL")
    progress = make_progress_logger(verbose=bool(args.verbose), enabled=True)

    if args.live and not api_key:
        _print(
            "Live benchmark requires WYZ_AI_CFO_API_KEY (or NVIDIA_API_KEY).\n"
            "Example (PowerShell):\n"
            '  $env:WYZ_AI_CFO_PROVIDER = "openai_compatible"\n'
            '  $env:WYZ_AI_CFO_BASE_URL = "https://integrate.api.nvidia.com/v1"\n'
            "  $env:WYZ_AI_CFO_API_KEY = $env:NVIDIA_API_KEY\n"
            "  npm run eval:beautyco-ai-cfo -- --live --limit 1"
        )
        return 2

    if args.smoke:
        if not args.live:
            _print("--smoke requires --live")
            return 2
        smoke_results = []
        for model in models:
            _print(f"Smoke testing {model} …")
            smoke_results.append(
                run_provider_smoke(
                    model=model,
                    base_url=base_url,
                    api_key=api_key,
                    timeout_sec=args.http_timeout or resolve_http_timeout_sec(),
                    on_progress=progress,
                )
            )
        ok = all(item.get("ok") for item in smoke_results)
        smoke_payload = {"smoke": smoke_results}
        if args.out:
            write_result = write_benchmark_output(args.out, smoke_payload)
            record_output_write_result(smoke_payload, write_result)
            if write_result.ok:
                _print(f"Wrote JSON: {write_result.path}")
            else:
                _print(
                    "Smoke output write failed (not a provider connectivity failure):\n"
                    f"  {write_result.error.get('path')}: {write_result.error.get('message')}"
                )
        if args.json:
            _print(json.dumps(smoke_payload, indent=2, default=str))
        if args.out and smoke_payload.get("output_write_errors"):
            return 4
        return 0 if ok else 3

    try:
        result = run_benchmark(
            models=models,
            live=bool(args.live),
            base_url=base_url,
            api_key=api_key,
            limit=args.limit,
            question=args.question,
            question_timeout_sec=args.question_timeout,
            http_timeout_sec=args.http_timeout,
            on_progress=progress,
            out_path=args.out,
        )
    except KeyboardInterrupt:
        _print("Benchmark cancelled (Ctrl+C).")
        return 130
    except ValueError as exc:
        _print(str(exc))
        return 2

    _print("")
    _print(format_report(result))
    if args.out:
        errors = result.get("output_write_errors") or []
        if errors:
            _print("Benchmark output write failed (not a model/provider/reasoning failure):")
            for err in errors:
                _print(f"  - {err.get('path')}: {err.get('message')}")
        elif result.get("output_path"):
            _print(f"Wrote JSON: {result['output_path']}")
    if args.json:
        _print(json.dumps(result, indent=2, default=str))

    if result.get("output_write_errors"):
        return 4
    if result.get("cancelled"):
        return 130
    if args.live and not any(
        item.get("scored") for model in result.get("models") or [] for item in model.get("cases") or []
    ):
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
