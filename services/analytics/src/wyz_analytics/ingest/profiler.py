"""Deterministic tabular profiler. No LLM."""

from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any

import polars as pl

from wyz_analytics.ingest.loader import load_tabular
from wyz_analytics.ingest.models import ColumnProfile, FileProfile
from wyz_analytics.mapping.names import normalize_name

SAMPLE_N = 8
_AMOUNT_TOKENS = (
    "amount",
    "revenue",
    "sales",
    "spend",
    "cost",
    "fee",
    "cogs",
    "mrp",
    "price",
    "refund",
    "discount",
    "settlement",
    "commission",
)
_ID_TOKENS = ("id", "sku", "order", "campaign", "customer", "cust")
_DATE_FORMATS = (
    "%d-%m-%Y",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%y",
    "%d-%b-%Y",
    "%d %b %Y",
)


def profile_file(path: str | Path, *, sheet_name: str | None = None) -> FileProfile:
    file_path = Path(path)
    frame, resolved_sheet = load_tabular(file_path, sheet_name=sheet_name)
    return profile_frame(frame, path=file_path, sheet_name=resolved_sheet or sheet_name)


def profile_frame(frame: pl.DataFrame, *, path: str | Path, sheet_name: str | None = None) -> FileProfile:
    file_path = Path(path)
    columns = [_profile_column(frame, name) for name in frame.columns]
    return FileProfile(
        filename=file_path.name,
        path=str(file_path),
        sheet_name=sheet_name,
        row_count=frame.height,
        column_count=frame.width,
        columns=columns,
    )


def _profile_column(frame: pl.DataFrame, name: str) -> ColumnProfile:
    series = frame.get_column(name)
    n = max(frame.height, 1)
    n_unique = int(series.n_unique())
    nulls = int(series.null_count())
    inferred = _inferred_type(series)
    samples = _sample_values(series)
    numeric_min = numeric_max = numeric_mean = None
    date_min = date_max = None
    if inferred in {"float", "int"}:
        numeric = series.cast(pl.Float64, strict=False).drop_nulls()
        if numeric.len():
            numeric_min = float(numeric.min())
            numeric_max = float(numeric.max())
            numeric_mean = float(numeric.mean())
    date_min, date_max = _date_range(series)
    unique_pct = n_unique / n
    token = normalize_name(name)
    likely_id = unique_pct >= 0.9 and any(part in token.split("_") or token.endswith(part) or token.startswith(part) for part in _ID_TOKENS)
    if token.endswith("_id") or token in {"sku", "sku_id", "order_id"}:
        likely_id = True
    likely_amount = inferred in {"float", "int"} and any(part in token for part in _AMOUNT_TOKENS)
    if numeric_max is not None and numeric_max >= 1000 and inferred in {"float", "int"}:
        likely_amount = likely_amount or True
        if unique_pct > 0.95 and n_unique == n:
            likely_id = likely_id or token.endswith("_id")
    return ColumnProfile(
        name=name,
        inferred_type=inferred,
        null_pct=round(nulls / n, 6),
        unique_pct=round(unique_pct, 6),
        n_unique=n_unique,
        sample_values=samples,
        numeric_min=numeric_min,
        numeric_max=numeric_max,
        numeric_mean=numeric_mean,
        date_min=date_min,
        date_max=date_max,
        likely_identifier=bool(likely_id),
        likely_amount=bool(likely_amount and not (token.endswith("_id"))),
    )


def _inferred_type(series: pl.Series) -> str:
    dtype = series.dtype
    if dtype == pl.Boolean:
        return "bool"
    if dtype in {pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64}:
        return "int"
    if dtype in {pl.Float32, pl.Float64}:
        return "float"
    if dtype in {pl.Date, pl.Datetime}:
        return "date"
    parsed = series.cast(pl.Utf8, strict=False).drop_nulls().head(40)
    if parsed.len() and all(_looks_like_date(value) for value in parsed.to_list()):
        return "date"
    numeric = series.cast(pl.Float64, strict=False)
    if series.drop_nulls().len() and numeric.drop_nulls().len() == series.drop_nulls().len():
        return "float"
    if parsed.len() and all(_looks_like_number(value) for value in parsed.to_list()):
        return "float"
    return "utf8"


def _looks_like_number(value: Any) -> bool:
    text = str(value).strip()
    if not text:
        return False
    for char in "₹$€£, ":
        text = text.replace(char, "")
    if text.startswith("(") and text.endswith(")"):
        text = "-" + text[1:-1]
    try:
        float(text)
        return True
    except ValueError:
        return False


def _looks_like_date(value: Any) -> bool:
    return _parse_date(value) is not None


def _date_range(series: pl.Series) -> tuple[str | None, str | None]:
    values = []
    for value in series.drop_nulls().head(500).to_list():
        parsed = _parse_date(value)
        if parsed is not None:
            values.append(parsed)
    if not values:
        return None, None
    return min(values).isoformat(), max(values).isoformat()


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for candidate in (text, text[:10]):
        for fmt in _DATE_FORMATS:
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None


def _sample_values(series: pl.Series) -> list[Any]:
    values = []
    seen = set()
    for value in series.drop_nulls().head(200).to_list():
        key = str(value)
        if key in seen:
            continue
        seen.add(key)
        if isinstance(value, datetime):
            values.append(value.isoformat())
        elif isinstance(value, date):
            values.append(value.isoformat())
        else:
            values.append(value)
        if len(values) >= SAMPLE_N:
            break
    return values
