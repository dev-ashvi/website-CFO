"""Apply a confirmed/accepted mapping onto a source frame → canonical columns."""

from __future__ import annotations

from datetime import datetime

import polars as pl

from wyz_analytics.schemas.fields import CanonicalSchema, FieldDtype, FieldSpec

_DEFAULT_DATE_FORMATS = (
    "%d-%m-%Y",
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%Y/%m/%d",
    "%d-%m-%y",
    "%d-%b-%Y",
    "%d %b %Y",
)


class TransformError(ValueError):
    pass


def apply_mapping(
    frame: pl.DataFrame,
    source_to_canonical: dict[str, str],
    schema: CanonicalSchema,
    *,
    date_formats: tuple[str, ...] = _DEFAULT_DATE_FORMATS,
) -> pl.DataFrame:
    missing_sources = [src for src in source_to_canonical if src not in frame.columns]
    if missing_sources:
        raise TransformError(f"Mapped source columns not in file: {missing_sources}")

    rename = {src: dest for src, dest in source_to_canonical.items()}
    # Last writer wins if two sources map to one canonical — caller should prevent this.
    selected = frame.select(list(rename.keys())).rename(rename)
    specs = {spec.name: spec for spec in schema.fields}
    coerced = []
    for name in selected.columns:
        spec = specs.get(name)
        if spec is None:
            continue
        coerced.append(_coerce(selected.get_column(name), spec, date_formats).alias(name))
    if not coerced:
        raise TransformError(f"No canonical columns produced for {schema.role}")
    return selected.select(coerced)


def _coerce(series: pl.Series, spec: FieldSpec, date_formats: tuple[str, ...]) -> pl.Series:
    if spec.dtype == FieldDtype.UTF8:
        return series.cast(pl.Utf8, strict=False)
    if spec.dtype == FieldDtype.FLOAT:
        return _coerce_float(series)
    if spec.dtype == FieldDtype.INT:
        return _coerce_float(series).cast(pl.Int64, strict=False)
    if spec.dtype == FieldDtype.BOOL:
        return series.cast(pl.Boolean, strict=False)
    if spec.dtype == FieldDtype.DATE:
        if series.dtype in {pl.Date, pl.Datetime}:
            return series.cast(pl.Date, strict=False)
        text = series.cast(pl.Utf8, strict=False)
        parts = [text.str.strptime(pl.Date, fmt, strict=False) for fmt in date_formats]
        out = parts[0]
        for part in parts[1:]:
            out = out.fill_null(part)
        return out
    return series


def _coerce_float(series: pl.Series) -> pl.Series:
    if series.dtype in {
        pl.Float32,
        pl.Float64,
        pl.Int8,
        pl.Int16,
        pl.Int32,
        pl.Int64,
        pl.UInt8,
        pl.UInt16,
        pl.UInt32,
        pl.UInt64,
    }:
        return series.cast(pl.Float64, strict=False)
    text = series.cast(pl.Utf8, strict=False).str.strip_chars()
    cleaned = text.str.replace_all(r"[₹$€£,\s]", "").str.replace(r"^\((.*)\)$", r"-$1")
    return cleaned.cast(pl.Float64, strict=False)


def parse_literal_date(value: str, date_formats: tuple[str, ...] = _DEFAULT_DATE_FORMATS):
    text = str(value).strip()
    for candidate in (text, text[:10]):
        for fmt in date_formats:
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                continue
    return None
