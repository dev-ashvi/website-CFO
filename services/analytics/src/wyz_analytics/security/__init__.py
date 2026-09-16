"""Security helpers for pilot / production analytics HTTP."""

from wyz_analytics.security.access import (
    require_dataset,
    require_decision,
    require_job_in_workspace,
    strip_client_workspace,
    trusted_workspace_id,
)
from wyz_analytics.security.auth import authorize_pilot_request, is_public_route
from wyz_analytics.security.config import SecurityConfig, validate_startup
from wyz_analytics.security.cors import cors_headers, origin_allowed, request_origin
from wyz_analytics.security.errors import (
    PayloadTooLarge,
    UploadRejected,
    safe_error_body,
    sanitize_analytics_error,
    sanitize_provider_failure,
    sanitize_server_error,
)
from wyz_analytics.security.uploads import validate_uploads

__all__ = [
    "SecurityConfig",
    "validate_startup",
    "authorize_pilot_request",
    "is_public_route",
    "cors_headers",
    "origin_allowed",
    "request_origin",
    "require_dataset",
    "require_decision",
    "require_job_in_workspace",
    "strip_client_workspace",
    "trusted_workspace_id",
    "PayloadTooLarge",
    "UploadRejected",
    "safe_error_body",
    "sanitize_analytics_error",
    "sanitize_provider_failure",
    "sanitize_server_error",
    "validate_uploads",
]
