"""Tabular file ingestion for WYZ analytics.

Import from concrete submodules (``models``, ``loader``, ``pipeline``, …).
This package intentionally avoids eager re-exports so model imports do not
pull in orchestration modules such as ``ingest.pipeline``.
"""
