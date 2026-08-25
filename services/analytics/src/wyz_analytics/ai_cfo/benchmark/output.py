"""Safe benchmark JSON checkpoint / result output."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class OutputWriteResult:
    ok: bool
    path: str | None = None
    error: dict[str, Any] | None = None


def resolve_output_path(path: str | Path, *, base_dir: Path | None = None) -> Path:
    """
    Resolve --out to an absolute path.

    Relative paths are resolved against ``base_dir`` when provided, otherwise cwd.
    """
    output_path = Path(path)
    if not output_path.is_absolute():
        root = base_dir if base_dir is not None else Path.cwd()
        output_path = (root / output_path).resolve()
    else:
        output_path = output_path.resolve()
    return output_path


def write_benchmark_output(
    path: str | Path | None,
    payload: dict[str, Any],
    *,
    base_dir: Path | None = None,
) -> OutputWriteResult:
    """
    Create parent directories as needed and write benchmark JSON.

    Never raises for I/O failures; returns ``OutputWriteResult`` instead.
    """
    if not path:
        return OutputWriteResult(ok=True, path=None)

    raw = str(path)
    try:
        output_path = resolve_output_path(path, base_dir=base_dir)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
        return OutputWriteResult(ok=True, path=str(output_path))
    except OSError as exc:
        return OutputWriteResult(
            ok=False,
            path=raw,
            error={
                "code": "output_write_failed",
                "message": str(exc),
                "path": raw,
            },
        )


def record_output_write_result(payload: dict[str, Any], write_result: OutputWriteResult) -> None:
    """Attach successful output path or accumulate output-write failures on payload."""
    if write_result.ok:
        if write_result.path:
            payload["output_path"] = write_result.path
        return
    errors = payload.setdefault("output_write_errors", [])
    if write_result.error and write_result.error not in errors:
        errors.append(write_result.error)
