"""Machine-readable analytics errors. Never include stack traces or file bytes."""

from __future__ import annotations


MISSING_SOURCE = "MISSING_SOURCE"
INVALID_MAPPING = "INVALID_MAPPING"
VALIDATION_REJECTED = "VALIDATION_REJECTED"
ENGINE_FAILURE = "ENGINE_FAILURE"
RESULT_WRITE_FAILURE = "RESULT_WRITE_FAILURE"
JOB_FAILED = "JOB_FAILED"
INVALID_QUERY = "INVALID_QUERY"
WORKSPACE_MISMATCH = "WORKSPACE_MISMATCH"

_USER_MESSAGES = {
    MISSING_SOURCE: "A required source file could not be loaded for this dataset.",
    INVALID_MAPPING: "Column mappings are incomplete or invalid.",
    VALIDATION_REJECTED: "Data validation rejected this dataset before analysis.",
    ENGINE_FAILURE: "The financial engine could not complete this analysis.",
    RESULT_WRITE_FAILURE: "Analysis finished but the result could not be saved.",
    JOB_FAILED: "The analytics job failed.",
    INVALID_QUERY: "The analytics query is invalid.",
    WORKSPACE_MISMATCH: "This dataset does not belong to the requested workspace.",
}


class AnalyticsError(Exception):
    def __init__(self, error_type: str, message: str | None = None):
        self.error_type = error_type
        self.user_message = message or _USER_MESSAGES.get(error_type, _USER_MESSAGES[JOB_FAILED])
        super().__init__(self.user_message)

    def to_dict(self) -> dict[str, str]:
        return {"type": self.error_type, "message": self.user_message}
