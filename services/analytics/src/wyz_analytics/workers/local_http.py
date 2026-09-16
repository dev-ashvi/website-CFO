"""Local HTTP adapter for Revenue & Margin analytics.

SPA adapter plus machine-authenticated worker API.

Pilot/production: CORS allowlist + WYZ_PILOT_API_TOKEN (injected by same-origin
proxy — never ship the token in browser/Vite public env).
"""

from __future__ import annotations

import cgi
import json
import logging
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from wyz_analytics.observability.context import get_request_id, set_dataset_id, set_request_id
from wyz_analytics.observability.emit import emit_event
from wyz_analytics.observability.events import new_request_id
from wyz_analytics.security import (
    PayloadTooLarge,
    SecurityConfig,
    UploadRejected,
    authorize_pilot_request,
    cors_headers,
    is_public_route,
    origin_allowed,
    request_origin,
    require_dataset,
    require_decision,
    require_job_in_workspace,
    safe_error_body,
    sanitize_analytics_error,
    sanitize_provider_failure,
    sanitize_server_error,
    strip_client_workspace,
    trusted_workspace_id,
    validate_startup,
    validate_uploads,
)
from wyz_analytics.security.limits import limit_jobs, limit_uploads
from wyz_analytics.security.errors import looks_like_provider_error
from wyz_analytics.workers.config import WorkerConfig
from wyz_analytics.workers.errors import AnalyticsError, WORKSPACE_MISMATCH
from wyz_analytics.workers.logging_config import configure_logging
from wyz_analytics.workers.service import AnalyticsWorkspace, canonical_fields_catalog
from wyz_analytics.workers.worker_api import (
    claim_job,
    complete_job,
    fail_job,
    get_blob,
    get_dataset_record,
    get_job,
    head_blob,
    heartbeat_job,
    put_blob,
    put_dataset_record,
    recover_jobs,
    require_worker,
    requeue_abandoned_jobs,
    save_job,
)

logger = logging.getLogger("wyz_analytics.workers.local_http")

HOST = os.environ.get("WYZ_ANALYTICS_HOST", "127.0.0.1")
PORT = int(os.environ.get("WYZ_ANALYTICS_PORT", "8788"))
PREFIX = "/api/v1/analytics"

configure_logging()
_CONFIG = WorkerConfig.from_env()
_SECURITY = SecurityConfig.from_env(work_dir=_CONFIG.work_dir)
_STARTUP = validate_startup(_SECURITY)
if _STARTUP.warnings:
    for warning in _STARTUP.warnings:
        logger.warning("startup_warning: %s", warning)
if not _STARTUP.ok:
    for err in _STARTUP.fatal:
        logger.error("startup_fatal: %s", err)
    raise SystemExit("Fatal analytics security/config validation failed:\n- " + "\n- ".join(_STARTUP.fatal))

logger.info(
    "security_boot env=%s workspace_id=%s require_auth=%s origins=%s provider_key_configured=%s",
    _SECURITY.env,
    _SECURITY.workspace_id,
    _SECURITY.require_auth or bool(_SECURITY.pilot_api_token),
    len(_SECURITY.allowed_origins),
    _SECURITY.provider_key_status().get("provider_key_configured"),
)

_WORKSPACE = AnalyticsWorkspace(
    root=_CONFIG.work_dir,
    run_loop=_CONFIG.embedded_worker,
    worker_id=_CONFIG.worker_id,
)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[analytics-worker] " + (fmt % args) + "\n")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._dispatch(self._do_OPTIONS)

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch(self._do_HEAD)

    def do_GET(self) -> None:  # noqa: N802
        self._dispatch(self._do_GET)

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch(self._do_POST)

    def do_PUT(self) -> None:  # noqa: N802
        self._dispatch(self._do_PUT)

    def do_PATCH(self) -> None:  # noqa: N802
        self._dispatch(self._do_PATCH)

    def _headers_map(self) -> dict[str, str]:
        return {key: value for key, value in self.headers.items()}

    def _cors_extra(self, *, preflight: bool = False) -> dict[str, str]:
        return cors_headers(request_origin(self._headers_map()), _SECURITY, preflight=preflight)

    def _enforce_pilot_auth(self, path: str) -> bool:
        """Return True if request was rejected (response already sent)."""
        if is_public_route(path) or path.startswith("/worker/"):
            return False
        err = authorize_pilot_request(self._headers_map(), _SECURITY)
        if err:
            status, body = err
            rid = (
                self.headers.get("X-Request-Id")
                or self.headers.get("x-request-id")
                or get_request_id()
            )
            if isinstance(body, dict):
                body = dict(body)
                if rid and "request_id" not in body:
                    body["request_id"] = rid
            self._respond_json(status, body, request_id=rid)
            return True
        return False

    def _dispatch(self, handler) -> None:
        started = time.perf_counter()
        request_id = (
            self.headers.get("X-Request-Id")
            or self.headers.get("x-request-id")
            or new_request_id()
        )
        set_request_id(request_id)
        route = self._path()
        method = self.command
        status_code = 500
        error_class = None
        dataset_id = None
        try:
            # Reject disallowed browser Origins early (except public health).
            origin = request_origin(self._headers_map())
            if (
                origin
                and not origin_allowed(origin, _SECURITY)
                and not is_public_route(route)
                and method != "OPTIONS"
            ):
                status_code = 403
                self._respond_json(
                    403,
                    safe_error_body(
                        code="ORIGIN_FORBIDDEN",
                        message="Origin is not allowed for this analytics API.",
                        request_id=request_id,
                    ),
                    request_id=request_id,
                )
                return

            parts = [p for p in route.split("/") if p]
            if len(parts) >= 2 and parts[0] == "datasets":
                dataset_id = parts[1]
                set_dataset_id(dataset_id)

            if method != "OPTIONS" and self._enforce_pilot_auth(route):
                status_code = getattr(self, "_last_status", 401)
                return

            handler()
            status_code = getattr(self, "_last_status", 200)
        except PayloadTooLarge as exc:
            status_code = 413
            error_class = "PayloadTooLarge"
            emit_event(
                "upload_rejected",
                component="http",
                category="security",
                severity="WARNING",
                request_id=request_id,
                dataset_id=dataset_id,
                attributes={"reason": "payload_too_large"},
            )
            self._respond_json(
                413,
                safe_error_body(code="PAYLOAD_TOO_LARGE", message=str(exc), request_id=request_id),
                request_id=request_id,
            )
        except UploadRejected as exc:
            status_code = 400
            error_class = exc.code
            emit_event(
                "upload_rejected",
                component="http",
                category="security",
                severity="WARNING",
                request_id=request_id,
                dataset_id=dataset_id,
                attributes={"reason": exc.code},
            )
            self._respond_json(
                400,
                safe_error_body(code=exc.code, message=exc.message, request_id=request_id),
                request_id=request_id,
            )
        except KeyError:
            status_code = 404
            self._respond_json(
                404,
                safe_error_body(code="NOT_FOUND", message="Not found", request_id=request_id),
                request_id=request_id,
            )
        except ValueError as exc:
            status_code = 409
            msg = str(exc)
            if _SECURITY.verbose_errors:
                self._respond_json(
                    409,
                    safe_error_body(code="CONFLICT", message=msg[:300], request_id=request_id),
                    request_id=request_id,
                )
            else:
                self._respond_json(
                    409,
                    safe_error_body(
                        code="CONFLICT",
                        message="Request could not be completed.",
                        request_id=request_id,
                    ),
                    request_id=request_id,
                )
        except AnalyticsError as exc:
            status_code = 403 if exc.error_type == WORKSPACE_MISMATCH else 400
            error_class = exc.error_type
            self._respond_json(status_code, sanitize_analytics_error(exc, request_id=request_id), request_id=request_id)
        except Exception as exc:
            status_code = 503 if looks_like_provider_error(exc) else 500
            error_class = exc.__class__.__name__
            self._respond_exception(exc, request_id=request_id, status_code=status_code)
        finally:
            duration_ms = int((time.perf_counter() - started) * 1000)
            try:
                emit_event(
                    "http_request_completed" if status_code < 500 else "http_request_failed",
                    component="http",
                    category="http",
                    severity="ERROR" if status_code >= 500 else "INFO",
                    request_id=request_id,
                    dataset_id=dataset_id,
                    duration_ms=duration_ms,
                    attributes={
                        "route": route,
                        "method": method,
                        "status_code": status_code,
                        "error_class": error_class,
                    },
                )
            except Exception:
                logger.exception("failed to emit http observability event")
            set_request_id(None)
            set_dataset_id(None)

    def _do_OPTIONS(self) -> None:
        origin = request_origin(self._headers_map())
        if origin and not origin_allowed(origin, _SECURITY):
            self._respond_json(
                403,
                safe_error_body(code="ORIGIN_FORBIDDEN", message="Origin is not allowed for this analytics API."),
            )
            return
        self._send(204, b"", extra=self._cors_extra(preflight=True))

    def _do_HEAD(self) -> None:
        if self._handle_worker():
            return
        self.send_response(404)
        self.end_headers()

    def _do_GET(self) -> None:
        if self._handle_worker():
            return
        path = self._path()
        if path == "/health":
            self._respond_json(
                200,
                {
                    "ok": True,
                    "service": "wyz-analytics",
                    "env": _SECURITY.env,
                    "release": os.environ.get("WYZ_RELEASE_SHA") or "unknown",
                },
            )
            return
        if path == "/ready":
            payload = _WORKSPACE.readiness()
            payload["env"] = _SECURITY.env
            payload["workspace_id"] = trusted_workspace_id(_SECURITY)
            payload["release"] = os.environ.get("WYZ_RELEASE_SHA") or "unknown"
            # Safe provider flags only — never secrets/paths.
            payload.update(_SECURITY.provider_key_status())
            self._respond_json(200 if payload.get("ready") else 503, payload)
            return
        if path == "/catalogs/fields":
            self._respond_json(200, {"canonical_fields": canonical_fields_catalog()})
            return
        if path == "/datasets":
            # Ignore client workspace_id query — trusted deployment workspace only.
            payload = _WORKSPACE.list_dataset_library(workspace_id=trusted_workspace_id(_SECURITY))
            self._respond_json(200, payload)
            return
        if path.startswith("/datasets/") and path.endswith("/result"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            result = _WORKSPACE.get_result(dataset_id)
            if result is None:
                record = _WORKSPACE.get_dataset(dataset_id)
                self._respond_json(
                    409,
                    safe_error_body(
                        code="RESULT_NOT_READY",
                        message="Analysis result is not available yet.",
                    )
                    | {"status": record.status},
                )
                return
            self._respond_json(200, result)
            return
        if "/strategic-decisions/" in path and path.startswith("/datasets/"):
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 4 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                self._respond_json(200, require_decision(_WORKSPACE, dataset_id, decision_id, _SECURITY))
                return
        if path.endswith("/strategic-decisions") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            query = parse_qs(urlparse(self.path).query)
            status = (query.get("status") or [None])[0]
            self._respond_json(
                200,
                _WORKSPACE.list_strategic_decisions(dataset_id, {"status": status} if status else {}),
            )
            return
        if path.endswith("/ai-feedback") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            self._respond_json(200, _WORKSPACE.list_ai_feedback(dataset_id))
            return
        if path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            record = require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            self._respond_json(200, record.public_dict())
            return
        if path.startswith("/jobs/"):
            job_id = path.split("/")[2]
            job = require_job_in_workspace(_WORKSPACE, job_id, _SECURITY)
            self._respond_json(200, job.to_dict())
            return
        self._respond_json(404, safe_error_body(code="NOT_FOUND", message="Not found"))

    def _do_POST(self) -> None:
        if self._handle_worker():
            return
        path = self._path()
        if path == "/datasets":
            body = strip_client_workspace(self._json_body())
            record = _WORKSPACE.create_dataset(
                name=str(body.get("name") or "Revenue & Margin dataset"),
                workspace_id=trusted_workspace_id(_SECURITY),
            )
            self._respond_json(201, record.public_dict())
            return
        if path.endswith("/files") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            length = int(self.headers.get("Content-Length") or 0)
            if length > _SECURITY.max_request_body_bytes:
                raise PayloadTooLarge()
            with limit_uploads(trusted_workspace_id(_SECURITY), _SECURITY.max_concurrent_uploads):
                files = validate_uploads(self._read_uploads(), _SECURITY, content_length=length)
                _WORKSPACE.save_uploads(dataset_id, files)
                record = _WORKSPACE.begin_ingest(dataset_id)
            self._respond_json(202, record.public_dict())
            return
        if path.endswith("/mappings/confirm") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            body = self._json_body()
            items = body.get("items") or body.get("confirmations") or []
            record = _WORKSPACE.confirm_mappings(dataset_id, items)
            self._respond_json(200, record.public_dict())
            return
        if path.endswith("/jobs") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            with limit_jobs(trusted_workspace_id(_SECURITY), _SECURITY.max_concurrent_jobs):
                job = _WORKSPACE.start_analysis(dataset_id)
            self._respond_json(202, job.to_dict())
            return
        if path.endswith("/query") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            body = strip_client_workspace(self._json_body())
            result = _WORKSPACE.query_facts(dataset_id, body)
            self._respond_json(200, result)
            return
        if path.endswith("/cost-breakdown") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            result = _WORKSPACE.cost_breakdown(dataset_id, strip_client_workspace(self._json_body()))
            self._respond_json(200, result)
            return
        if path.endswith("/signals") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            result = _WORKSPACE.cfo_signals(dataset_id, strip_client_workspace(self._json_body()))
            self._respond_json(200, result)
            return
        if path == "/client-errors":
            body = self._constrained_client_error_body()
            emit_event(
                "client_error_reported",
                component="frontend",
                category="client_error",
                severity="WARNING",
                dataset_id=body.get("dataset_id"),
                request_id=body.get("request_id"),
                attributes={
                    "error_code": body.get("error_code") or "client_error",
                    "surface": body.get("surface") or "unknown",
                },
            )
            self._respond_json(202, {"ok": True})
            return
        if path.endswith("/ai-cfo/ask") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            body = strip_client_workspace(self._json_body())
            if isinstance(body, dict) and not body.get("request_id"):
                body["request_id"] = self.headers.get("X-Request-Id") or self.headers.get("x-request-id")
            try:
                result = _WORKSPACE.ask_ai_cfo(dataset_id, body)
            except Exception as exc:
                if looks_like_provider_error(exc):
                    logger.warning("ai_provider_failure class=%s", exc.__class__.__name__)
                    rid = self.headers.get("X-Request-Id") or self.headers.get("x-request-id")
                    self._respond_json(503, sanitize_provider_failure(request_id=rid), request_id=rid)
                    return
                raise
            self._respond_json(200, result)
            return
        if path.endswith("/ai-feedback") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            result = _WORKSPACE.submit_ai_feedback(dataset_id, self._json_body())
            self._respond_json(201, result)
            return
        if path.endswith("/strategic-decisions") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            require_dataset(_WORKSPACE, dataset_id, _SECURITY)
            result = _WORKSPACE.track_strategic_decision(dataset_id, strip_client_workspace(self._json_body()))
            self._respond_json(201, result)
            return
        if "/strategic-decisions/" in path and path.startswith("/datasets/"):
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 5 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                action = parts[4]
                require_decision(_WORKSPACE, dataset_id, decision_id, _SECURITY)
                body = strip_client_workspace(self._json_body())
                if action == "evaluate":
                    self._respond_json(
                        200, _WORKSPACE.evaluate_strategic_decision(dataset_id, decision_id, body)
                    )
                    return
                if action == "review":
                    self._respond_json(
                        200, _WORKSPACE.review_strategic_decision(dataset_id, decision_id, body)
                    )
                    return
                if action == "status":
                    self._respond_json(
                        200,
                        _WORKSPACE.update_strategic_decision_status(dataset_id, decision_id, body),
                    )
                    return
        self._respond_json(404, safe_error_body(code="NOT_FOUND", message="Not found"))

    def _do_PUT(self) -> None:
        if self._handle_worker():
            return
        self._respond_json(405, safe_error_body(code="METHOD_NOT_ALLOWED", message="Method not allowed"))

    def _do_PATCH(self) -> None:
        if self._handle_worker():
            return
        path = self._path()
        if "/strategic-decisions/" in path and path.startswith("/datasets/") and path.endswith("/status"):
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 5 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                require_decision(_WORKSPACE, dataset_id, decision_id, _SECURITY)
                self._respond_json(
                    200,
                    _WORKSPACE.update_strategic_decision_status(
                        dataset_id, decision_id, strip_client_workspace(self._json_body())
                    ),
                )
                return
        self._respond_json(404, safe_error_body(code="NOT_FOUND", message="Not found"))

    def _constrained_client_error_body(self) -> dict:
        raw = self._json_body() if self.command == "POST" else {}
        if not isinstance(raw, dict):
            raise UploadRejected("INVALID_CLIENT_ERROR", "Invalid client-error payload.")
        allowed_codes = {
            "client_error",
            "restore_failed",
            "upload_failed",
            "ai_cfo_failed",
            "network_error",
            "unknown",
        }
        allowed_surfaces = {
            "unknown",
            "revenue_margin",
            "ai_cfo",
            "dataset_library",
            "workspace_restore",
            "upload",
        }
        error_code = str(raw.get("error_code") or "client_error").strip().lower()[:80]
        surface = str(raw.get("surface") or "unknown").strip().lower()[:80]
        if error_code not in allowed_codes:
            error_code = "client_error"
        if surface not in allowed_surfaces:
            surface = "unknown"
        dataset_id = str(raw.get("dataset_id") or "").strip()[:64] or None
        request_id = str(raw.get("request_id") or "").strip()[:64] or None
        # Reject arbitrary nested dumps.
        if any(k not in {"error_code", "surface", "dataset_id", "request_id"} for k in raw.keys()):
            pass  # extra keys ignored
        return {
            "error_code": error_code,
            "surface": surface,
            "dataset_id": dataset_id,
            "request_id": request_id,
        }

    def _handle_worker(self) -> bool:
        path = self._path()
        if not path.startswith("/worker/"):
            return False
        auth_err = require_worker({key: value for key, value in self.headers.items()})
        if auth_err:
            status, body = auth_err
            self._respond_json(status, body)
            return True
        try:
            return self._dispatch_worker(path)
        except KeyError:
            self._respond_json(404, safe_error_body(code="NOT_FOUND", message="Not found"))
            return True
        except Exception as exc:
            self._respond_exception(exc)
            return True

    def _dispatch_worker(self, path: str) -> bool:
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and parts[2] == "claim":
            if self.command != "POST":
                self._respond_json(405, safe_error_body(code="METHOD_NOT_ALLOWED", message="Method not allowed"))
                return True
            status, body = claim_job(_WORKSPACE, self._json_body())
            if body is None:
                self._send(status, b"")
            else:
                self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and parts[2] == "recover":
            status, body = recover_jobs(_WORKSPACE, self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and parts[2] == "requeue-abandoned":
            status, body = requeue_abandoned_jobs(_WORKSPACE, self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 4 and parts[0] == "worker" and parts[1] == "jobs" and parts[3] == "complete":
            status, body = complete_job(_WORKSPACE, parts[2], self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 4 and parts[0] == "worker" and parts[1] == "jobs" and parts[3] == "fail":
            status, body = fail_job(_WORKSPACE, parts[2], self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 4 and parts[0] == "worker" and parts[1] == "jobs" and parts[3] == "heartbeat":
            status, body = heartbeat_job(_WORKSPACE, parts[2], self._json_body())
            if body is None:
                self._send(status, b"")
            else:
                self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and self.command == "GET":
            status, body = get_job(_WORKSPACE, parts[2])
            self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and self.command == "PUT":
            status, body = save_job(_WORKSPACE, parts[2], self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "datasets" and self.command == "GET":
            status, body = get_dataset_record(_WORKSPACE, parts[2])
            self._respond_json(status, body)
            return True
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "datasets" and self.command == "PUT":
            status, body = put_dataset_record(_WORKSPACE, parts[2], self._json_body())
            self._respond_json(status, body)
            return True
        if len(parts) >= 2 and parts[0] == "worker" and parts[1] == "blobs":
            query = parse_qs(urlparse(self.path).query)
            uri = (query.get("uri") or [""])[0]
            if self.command == "HEAD":
                status, headers, body = head_blob(_WORKSPACE, uri)
                self._send(status, body, extra=headers)
                return True
            if self.command == "GET":
                status, headers, body = get_blob(_WORKSPACE, uri)
                self._send(status, body, extra=headers)
                return True
            if self.command == "PUT":
                status, body = put_blob(_WORKSPACE, self._json_body())
                self._respond_json(status, body)
                return True
        self._respond_json(404, safe_error_body(code="NOT_FOUND", message="Not found"))
        return True

    def _path(self) -> str:
        parsed = urlparse(self.path)
        path = parsed.path
        if path.startswith(PREFIX):
            path = path[len(PREFIX) :] or "/"
        if not path.startswith("/"):
            path = "/" + path
        return path

    def _json_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > _SECURITY.max_request_body_bytes:
            raise PayloadTooLarge()
        raw = self.rfile.read(length) if length else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _read_uploads(self) -> list[tuple[str, bytes]]:
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            raise ValueError("Expected multipart file upload.")
        env = {
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": ctype,
            "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
        }
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=env, keep_blank_values=True)
        files: list[tuple[str, bytes]] = []
        items = form["files"] if "files" in form else form["file"] if "file" in form else None
        if items is None:
            for key in form.keys():
                field = form[key]
                candidates = field if isinstance(field, list) else [field]
                for part in candidates:
                    if getattr(part, "filename", None) and part.file:
                        files.append((part.filename, part.file.read()))
            return files
        candidates = items if isinstance(items, list) else [items]
        for part in candidates:
            if getattr(part, "filename", None) and part.file:
                files.append((part.filename, part.file.read()))
        return files

    def _encode_json(self, payload) -> bytes:
        return json.dumps(payload, default=str).encode("utf-8")

    def _respond_json(self, status: int, payload, extra: dict | None = None, request_id: str | None = None) -> None:
        self._last_status = status
        body = self._encode_json(payload)
        headers = dict(extra or {})
        rid = request_id or self.headers.get("X-Request-Id") or self.headers.get("x-request-id")
        if rid:
            headers["X-Request-Id"] = rid
        if isinstance(payload, dict) and rid and "request_id" not in payload:
            try:
                enriched = dict(payload)
                enriched["request_id"] = rid
                body = self._encode_json(enriched)
            except Exception:
                pass
        self._send(status, body, extra=headers)

    def _respond_exception(self, exc: Exception, request_id: str | None = None, status_code: int = 500) -> None:
        traceback.print_exc()
        logger.exception("analytics HTTP handler error class=%s", exc.__class__.__name__)
        if looks_like_provider_error(exc) or status_code == 503:
            payload = sanitize_provider_failure(request_id=request_id)
            self._respond_json(503, payload, request_id=request_id)
            return
        payload = sanitize_server_error(
            request_id=request_id,
            verbose=_SECURITY.verbose_errors,
            detail=str(exc),
        )
        self._respond_json(500, payload, request_id=request_id)

    def _send(self, status: int, body: bytes, extra: dict | None = None) -> None:
        self.send_response(status)
        headers = dict(SECURITY_HEADERS)
        headers.update(self._cors_extra(preflight=False))
        headers.update(extra or {})
        content_type = headers.pop("Content-Type", headers.pop("content-type", "application/json"))
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)


def main() -> None:
    import signal

    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((HOST, PORT), Handler)

    def _shutdown(signum, _frame) -> None:
        print(f"\nReceived signal {signum}; shutting down analytics HTTP…", flush=True)
        threading = __import__("threading")
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    print(f"WYZ analytics local worker listening on http://{HOST}:{PORT}{PREFIX}", flush=True)
    print(f"WYZ analytics work_dir={_CONFIG.work_dir.resolve()}", flush=True)
    print(f"WYZ_ENV={_SECURITY.env} workspace_id={_SECURITY.workspace_id}", flush=True)
    if _CONFIG.embedded_worker:
        print("Embedded claim loop enabled (local process worker).", flush=True)
    else:
        print("Embedded claim loop disabled. External/Kubernetes workers should poll remotely.", flush=True)
    print("Internal pilot adapter — do not expose publicly without reverse proxy.", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        print("Stopped.", flush=True)


if __name__ == "__main__":
    main()
