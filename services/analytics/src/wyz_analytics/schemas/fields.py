"""Canonical field metadata for Revenue & Margin ingestion."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FieldSupply(str, Enum):
    """How a canonical field is expected to appear."""

    REQUIRED_SOURCE = "required_source"
    OPTIONAL_SOURCE = "optional_source"
    DERIVABLE = "derivable"
    ENGINE_CALCULATED = "engine_calculated"


class FieldDtype(str, Enum):
    UTF8 = "utf8"
    FLOAT = "float"
    INT = "int"
    DATE = "date"
    BOOL = "bool"


@dataclass(frozen=True)
class FieldSpec:
    name: str
    dtype: FieldDtype
    supply: FieldSupply
    description: str
    aliases: tuple[str, ...] = ()
    used_for: tuple[str, ...] = ()

    @property
    def required_from_client(self) -> bool:
        return self.supply == FieldSupply.REQUIRED_SOURCE


@dataclass(frozen=True)
class CanonicalSchema:
    role: str
    description: str
    fields: tuple[FieldSpec, ...]
    expected_grain: str

    def field(self, name: str) -> FieldSpec:
        for spec in self.fields:
            if spec.name == name:
                return spec
        raise KeyError(name)

    def required_fields(self) -> tuple[str, ...]:
        return tuple(spec.name for spec in self.fields if spec.required_from_client)

    def mappable_fields(self) -> tuple[FieldSpec, ...]:
        return tuple(
            spec
            for spec in self.fields
            if spec.supply in {FieldSupply.REQUIRED_SOURCE, FieldSupply.OPTIONAL_SOURCE, FieldSupply.DERIVABLE}
        )
