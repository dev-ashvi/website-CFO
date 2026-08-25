from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from wyz_analytics.adapters.beautyco import load_beautyco_sources
from wyz_analytics.engine.pipeline import run_revenue_margin_engine

ROOT = Path(__file__).resolve().parent
GOLDEN_JSON = ROOT / "golden" / "beautyco_expected.json"


def beautyco_data_dir() -> Path | None:
    candidates: list[Path] = []
    env = os.environ.get("WYZ_ANALYTICS_GOLDEN_DIR")
    if env:
        candidates.append(Path(env))
    candidates.extend(
        [
            ROOT / "data" / "beautyco",
            Path.home() / "Downloads",
        ]
    )
    for path in candidates:
        if (path / "01_ORDER_LINES.csv").exists() and (path / "02_SKU_MASTER_COGS.csv").exists():
            return path
    return None


@pytest.fixture(scope="session")
def beautyco_paths():
    data_dir = beautyco_data_dir()
    if data_dir is None:
        pytest.skip(
            "BeautyCo CSVs not found. Set WYZ_ANALYTICS_GOLDEN_DIR or place "
            "01_ORDER_LINES.csv (and siblings) in tests/data/beautyco or ~/Downloads."
        )
    return [
        data_dir / "01_ORDER_LINES.csv",
        data_dir / "02_SKU_MASTER_COGS.csv",
        data_dir / "03_CHANNEL_SETTLEMENTS.csv",
        data_dir / "04_MARKETING_SPEND.csv",
    ]


@pytest.fixture(scope="session")
def expected() -> dict:
    return json.loads(GOLDEN_JSON.read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def beautyco_result():
    data_dir = beautyco_data_dir()
    if data_dir is None:
        pytest.skip(
            "BeautyCo CSVs not found. Set WYZ_ANALYTICS_GOLDEN_DIR or place "
            "01_ORDER_LINES.csv (and siblings) in tests/data/beautyco or ~/Downloads."
        )
    sources = load_beautyco_sources(data_dir)
    return run_revenue_margin_engine(sources)
