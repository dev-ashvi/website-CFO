"""Pilot / production security configuration for analytics HTTP."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

VALID_ENVS = frozenset({"development", "pilot", "production"})

DEFAULT_DEV_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)

ALLOWED_UPLOAD_EXTENSIONS = frozenset({".csv", ".tsv", ".xlsx", ".xls"})
BLOCKED_UPLOAD_EXTENSIONS = frozenset(
    {".exe", ".bat", ".cmd", ".ps1", ".sh", ".dll", ".so", ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".js", ".py", ".php"}
)


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def _env_int(name: str, default: int) -> int:
    raw = _env(name)
    if raw is None:
        return default
    return int(raw)


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def parse_origins(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    items = []
    for part in raw.split(","):
        origin = part.strip().rstrip("/")
        if origin:
            items.append(origin)
    return tuple(items)


@dataclass(frozen=True)
class SecurityConfig:
    """Canonical deployment security settings for analytics HTTP."""

    env: str
    workspace_id: str
    allowed_origins: tuple[str, ...]
    pilot_api_token: str | None
    max_upload_mb: int
    max_request_body_mb: int
    max_upload_files: int
    max_concurrent_uploads: int
    max_concurrent_jobs: int
    require_auth: bool
    verbose_errors: bool
    work_dir: Path
    provider_configured: bool
    provider_id: str
    ai_cfo_provider: str
    strategy_mode: str

    @classmethod
    def from_env(cls, *, work_dir: Path | None = None) -> SecurityConfig:
        from wyz_analytics.workers.config import resolve_work_dir

        env = (_env("WYZ_ENV", "development") or "development").strip().lower()
        if env in {"dev", "local"}:
            env = "development"
        if env in {"prod"}:
            env = "production"
        if env not in VALID_ENVS:
            # Keep raw for validator to fail clearly.
            pass

        origins = parse_origins(_env("WYZ_ALLOWED_ORIGINS"))
        if env == "development" and not origins:
            origins = DEFAULT_DEV_ORIGINS

        token = _env("WYZ_PILOT_API_TOKEN")
        # Pilot/production always require auth when token is set; missing token is a fatal validate error.
        require_auth = env in {"pilot", "production"}

        ai_provider = (_env("WYZ_AI_CFO_PROVIDER", "fake") or "fake").strip().lower()
        key_configured = bool(
            _env("WYZ_AI_CFO_API_KEY") or _env("NVIDIA_API_KEY") or _env("OPENAI_API_KEY")
        )

        return cls(
            env=env,
            workspace_id=(_env("WYZ_WORKSPACE_ID", "local") or "local").strip(),
            allowed_origins=origins,
            pilot_api_token=token,
            max_upload_mb=_env_int("WYZ_MAX_UPLOAD_MB", 100),
            max_request_body_mb=_env_int("WYZ_MAX_REQUEST_BODY_MB", 120),
            max_upload_files=_env_int("WYZ_MAX_UPLOAD_FILES", 12),
            max_concurrent_uploads=_env_int("WYZ_MAX_CONCURRENT_UPLOADS", 3),
            max_concurrent_jobs=_env_int("WYZ_MAX_CONCURRENT_JOBS", 2),
            require_auth=require_auth,
            verbose_errors=env == "development" and _env_bool("WYZ_VERBOSE_ERRORS", True),
            work_dir=work_dir if work_dir is not None else resolve_work_dir(),
            provider_configured=key_configured if ai_provider not in {"fake", "mock", "test"} else True,
            provider_id=ai_provider,
            ai_cfo_provider=ai_provider,
            strategy_mode=(_env("WYZ_AI_CFO_STRATEGY_MODE", "v2_partner") or "v2_partner").strip(),
        )

    @property
    def max_upload_bytes(self) -> int:
        return max(1, self.max_upload_mb) * 1024 * 1024

    @property
    def max_request_body_bytes(self) -> int:
        return max(1, self.max_request_body_mb) * 1024 * 1024

    def provider_key_status(self) -> dict[str, bool | str]:
        """Safe status only — never include secret values."""
        return {
            "provider_id": self.provider_id,
            "provider_key_configured": bool(
                _env("WYZ_AI_CFO_API_KEY") or _env("NVIDIA_API_KEY") or _env("OPENAI_API_KEY")
            )
            if self.ai_cfo_provider not in {"fake", "mock", "test"}
            else False,
            "uses_fake_provider": self.ai_cfo_provider in {"fake", "mock", "test"},
        }


@dataclass
class StartupValidationResult:
    ok: bool
    fatal: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_startup(config: SecurityConfig) -> StartupValidationResult:
    """Validate mandatory pilot/production config. Does not call external AI providers."""
    fatal: list[str] = []
    warnings: list[str] = []

    if config.env not in VALID_ENVS:
        fatal.append(f"Invalid WYZ_ENV={config.env!r}; expected one of {sorted(VALID_ENVS)}.")

    try:
        config.work_dir.mkdir(parents=True, exist_ok=True)
        probe = config.work_dir / ".startup_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
    except OSError as exc:
        fatal.append(f"WYZ_ANALYTICS_WORK_DIR is not writable: {exc.__class__.__name__}")

    if config.env in {"pilot", "production"}:
        if not config.allowed_origins:
            fatal.append("WYZ_ALLOWED_ORIGINS is required in pilot/production (comma-separated exact origins).")
        if not config.pilot_api_token:
            fatal.append("WYZ_PILOT_API_TOKEN is required in pilot/production.")
        elif len(config.pilot_api_token.strip()) < 16:
            fatal.append("WYZ_PILOT_API_TOKEN is malformed (minimum 16 characters).")
        if not config.workspace_id or config.workspace_id == "*":
            fatal.append("WYZ_WORKSPACE_ID must be a concrete workspace id in pilot/production.")

    if config.max_upload_mb < 30:
        warnings.append("WYZ_MAX_UPLOAD_MB is below BeautyCo (~30 MB); uploads may fail.")

    if config.ai_cfo_provider not in {"fake", "mock", "test"}:
        if not (
            _env("WYZ_AI_CFO_API_KEY") or _env("NVIDIA_API_KEY") or _env("OPENAI_API_KEY")
        ):
            warnings.append(
                "AI provider key not configured (WYZ_AI_CFO_API_KEY / NVIDIA_API_KEY); "
                "non-AI analytics remain available."
            )

    return StartupValidationResult(ok=not fatal, fatal=fatal, warnings=warnings)


def resolve_provider_api_key() -> tuple[str | None, str]:
    """Deterministic key precedence. Returns (key_or_none, source_label). Never log the key."""
    if _env("WYZ_AI_CFO_API_KEY"):
        return _env("WYZ_AI_CFO_API_KEY"), "WYZ_AI_CFO_API_KEY"
    if _env("NVIDIA_API_KEY"):
        return _env("NVIDIA_API_KEY"), "NVIDIA_API_KEY"
    if _env("OPENAI_API_KEY"):
        return _env("OPENAI_API_KEY"), "OPENAI_API_KEY"
    return None, "none"
