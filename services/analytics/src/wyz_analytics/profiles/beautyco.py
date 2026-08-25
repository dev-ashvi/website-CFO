"""Known BeautyCo mapping configuration (memory-contract example).

Does not replace adapters.beautyco. Used to prove canonical ingest parity.
"""

from __future__ import annotations

from wyz_analytics.adapters.beautyco import (
    BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL,
    MARKETING_RENAME,
    ORDER_LINE_RENAME,
    SETTLEMENT_RENAME,
    SKU_RENAME,
)
from wyz_analytics.mapping.models import (
    ColumnMapping,
    FileMappingResult,
    MappingConfiguration,
    MappingOrigin,
    MappingStatus,
    MethodologySelections,
)
from wyz_analytics.schemas.roles import FileRole


def _confirmed(rename: dict[str, str], role: FileRole, source_file: str) -> FileMappingResult:
    mappings = [
        ColumnMapping(
            source_column=src,
            canonical_field=dest,
            origin=MappingOrigin.USER_CONFIRMED,
            status=MappingStatus.CONFIRMED,
            model_confidence=1.0,
            validation_confidence=1.0,
            final_confidence=1.0,
            evidence=("beautyco_reference_adapter",),
        )
        for src, dest in rename.items()
    ]
    return FileMappingResult(
        source_file=source_file,
        file_role=role.value,
        confidence=1.0,
        mappings=mappings,
        unmapped_source_columns=[],
        missing_required_fields=[],
    )


def beautyco_mapping_configuration() -> MappingConfiguration:
    return MappingConfiguration(
        tenant_id="beautyco",
        workspace_id="fy26-golden",
        source_type="commerce_finance",
        mapping_version="beautyco-v1",
        file_mappings=[
            _confirmed(ORDER_LINE_RENAME, FileRole.ORDER_LINES, "01_ORDER_LINES.csv"),
            _confirmed(SKU_RENAME, FileRole.SKU_MASTER, "02_SKU_MASTER_COGS.csv"),
            _confirmed(SETTLEMENT_RENAME, FileRole.CHANNEL_SETTLEMENTS, "03_CHANNEL_SETTLEMENTS.csv"),
            _confirmed(MARKETING_RENAME, FileRole.MARKETING_SPEND, "04_MARKETING_SPEND.csv"),
        ],
        methodology=MethodologySelections(
            platform_to_channel=dict(BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL),
        ),
        notes="Reference mapping equivalent to adapters.beautyco; adapter remains the golden loader.",
    )


def beautyco_methodology() -> MethodologySelections:
    return MethodologySelections(platform_to_channel=dict(BEAUTYCO_MARKETING_PLATFORM_TO_CHANNEL))
