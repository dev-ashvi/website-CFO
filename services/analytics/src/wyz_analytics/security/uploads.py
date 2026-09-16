"""Upload filename / type / size validation."""

from __future__ import annotations

from pathlib import Path

from wyz_analytics.security.config import ALLOWED_UPLOAD_EXTENSIONS, BLOCKED_UPLOAD_EXTENSIONS, SecurityConfig
from wyz_analytics.security.errors import PayloadTooLarge, UploadRejected


def sanitize_upload_filename(filename: str | None) -> str:
    """Normalize client filename — basename only, no path traversal."""
    raw = (filename or "").strip().replace("\\", "/")
    name = Path(raw).name
    if not name or name in {".", ".."} or "/" in name or "\\" in name:
        raise UploadRejected("INVALID_FILENAME", "Invalid upload filename.")
    if ".." in name:
        raise UploadRejected("INVALID_FILENAME", "Invalid upload filename.")
    # Collapse weird whitespace
    name = " ".join(name.split())
    if len(name) > 200:
        raise UploadRejected("INVALID_FILENAME", "Upload filename is too long.")
    return name


def validate_upload_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in BLOCKED_UPLOAD_EXTENSIONS or ext == ".zip":
        raise UploadRejected("UNSUPPORTED_FILE_TYPE", f"File type {ext or '(none)'} is not allowed.")
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise UploadRejected(
            "UNSUPPORTED_FILE_TYPE",
            "Only CSV/TSV/Excel uploads are supported for Revenue & Margin ingest.",
        )
    return ext


def validate_uploads(
    files: list[tuple[str, bytes]],
    config: SecurityConfig,
    *,
    content_length: int | None = None,
) -> list[tuple[str, bytes]]:
    if content_length is not None and content_length > config.max_request_body_bytes:
        raise PayloadTooLarge()
    if not files:
        raise UploadRejected("NO_FILES", "Upload at least one file.")
    if len(files) > config.max_upload_files:
        raise UploadRejected("TOO_MANY_FILES", f"At most {config.max_upload_files} files per upload.")

    cleaned: list[tuple[str, bytes]] = []
    total = 0
    for filename, payload in files:
        safe = sanitize_upload_filename(filename)
        validate_upload_extension(safe)
        size = len(payload)
        if size <= 0:
            raise UploadRejected("EMPTY_FILE", f"Empty file rejected: {safe}")
        if size > config.max_upload_bytes:
            raise PayloadTooLarge()
        total += size
        if total > config.max_request_body_bytes:
            raise PayloadTooLarge()
        cleaned.append((safe, payload))
    return cleaned
