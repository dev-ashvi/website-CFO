"""Load CSV / XLSX-compatible tabular files without assuming client column names."""

from __future__ import annotations

from pathlib import Path

import polars as pl


class TabularLoadError(ValueError):
    pass


def load_tabular(path: str | Path, *, sheet_name: str | None = None) -> tuple[pl.DataFrame, str | None]:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(str(file_path))
    suffix = file_path.suffix.lower()
    if suffix in {".csv", ".tsv", ".txt"}:
        separator = "\t" if suffix == ".tsv" else ","
        try:
            frame = pl.read_csv(
                file_path,
                separator=separator,
                infer_schema_length=10_000,
                ignore_errors=False,
            )
        except Exception as exc:  # noqa: BLE001 — surface parse errors as contract
            raise TabularLoadError(f"Could not read {file_path.name}: {exc}") from exc
        if frame.width == 0:
            raise TabularLoadError(f"{file_path.name} has no columns")
        return frame, None
    if suffix in {".xlsx", ".xlsm", ".xls"}:
        return _read_excel(file_path, sheet_name), sheet_name
    raise TabularLoadError(f"Unsupported file type: {file_path.suffix}")


def _read_excel(path: Path, sheet_name: str | None) -> pl.DataFrame:
    try:
        import openpyxl
    except ImportError as exc:
        raise TabularLoadError("Reading Excel requires openpyxl") from exc
    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook[sheet_name] if sheet_name else workbook.active
        rows = sheet.iter_rows(values_only=True)
        try:
            header_row = next(rows)
        except StopIteration as exc:
            raise TabularLoadError(f"{path.name} is empty") from exc
        headers = [str(value).strip() if value is not None else f"column_{idx}" for idx, value in enumerate(header_row)]
        data: dict[str, list] = {name: [] for name in headers}
        for row in rows:
            for name, value in zip(headers, row):
                data[name].append(value)
        if not headers:
            raise TabularLoadError(f"{path.name} has no columns")
        return pl.DataFrame(data)
    finally:
        workbook.close()
