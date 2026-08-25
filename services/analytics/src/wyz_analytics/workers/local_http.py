"""Local HTTP adapter for Revenue & Margin analytics.

Non-production SPA adapter plus machine-authenticated worker API.

The Vite dev server proxies `/api/v1/analytics` here.

For Kubernetes testing, disable the embedded claim loop and run the polling
worker container in remote mode against this API.
"""

from __future__ import annotations

import cgi
import json
import logging
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from wyz_analytics.workers.config import WorkerConfig
from wyz_analytics.workers.errors import AnalyticsError, WORKSPACE_MISMATCH
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

_CONFIG = WorkerConfig.from_env()
_WORKSPACE = AnalyticsWorkspace(
    root=_CONFIG.work_dir,
    run_loop=_CONFIG.embedded_worker,
    worker_id=_CONFIG.worker_id,
)


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

    def _dispatch(self, handler) -> None:
        try:
            handler()
        except KeyError:
            self._respond_json(404, {"message": "Not found"})
        except ValueError as exc:
            self._respond_json(409, {"message": str(exc)})
        except AnalyticsError as exc:
            status = 403 if exc.error_type == WORKSPACE_MISMATCH else 400
            self._respond_json(status, exc.to_dict())
        except Exception as exc:
            self._respond_exception(exc)

    def _do_OPTIONS(self) -> None:
        self._send(204, b"", extra={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*"})

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
            self._respond_json(200, {"ok": True, "service": "wyz-analytics-local-worker"})
            return
        if path == "/catalogs/fields":
            self._respond_json(200, {"canonical_fields": canonical_fields_catalog()})
            return
        if path == "/datasets":
            query = parse_qs(urlparse(self.path).query)
            # Local/demo isolation: default to workspace_id=local (never list all tenants).
            workspace_id = (query.get("workspace_id") or ["local"])[0] or "local"
            payload = _WORKSPACE.list_dataset_library(workspace_id=str(workspace_id))
            self._respond_json(200, payload)
            return
        if path.startswith("/datasets/") and path.endswith("/result"):
            dataset_id = path.split("/")[2]
            record = _WORKSPACE.get_dataset(dataset_id)
            result = _WORKSPACE.get_result(dataset_id)
            if result is None:
                self._respond_json(
                    409,
                    {"message": "Analysis result is not available yet.", "status": record.status},
                )
                return
            self._respond_json(200, result)
            return
        if "/strategic-decisions/" in path and path.startswith("/datasets/"):
            parts = [p for p in path.split("/") if p]
            # datasets/{id}/strategic-decisions/{decision_id}
            if len(parts) >= 4 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                self._respond_json(200, _WORKSPACE.get_strategic_decision(dataset_id, decision_id))
                return
        if path.endswith("/strategic-decisions") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            query = parse_qs(urlparse(self.path).query)
            status = (query.get("status") or [None])[0]
            self._respond_json(
                200,
                _WORKSPACE.list_strategic_decisions(dataset_id, {"status": status} if status else {}),
            )
            return
        if path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            self._respond_json(200, _WORKSPACE.get_dataset(dataset_id).public_dict())
            return
        if path.startswith("/jobs/"):
            job_id = path.split("/")[2]
            self._respond_json(200, _WORKSPACE.get_job(job_id).to_dict())
            return
        self._respond_json(404, {"message": "Not found"})

    def _do_POST(self) -> None:
        if self._handle_worker():
            return
        path = self._path()
        if path == "/datasets":
            body = self._json_body()
            record = _WORKSPACE.create_dataset(
                name=str(body.get("name") or "Revenue & Margin dataset"),
                workspace_id=str(body.get("workspace_id") or "local"),
            )
            self._respond_json(201, record.public_dict())
            return
        if path.endswith("/files") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            files = self._read_uploads()
            _WORKSPACE.save_uploads(dataset_id, files)
            record = _WORKSPACE.begin_ingest(dataset_id)
            self._respond_json(202, record.public_dict())
            return
        if path.endswith("/mappings/confirm") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            body = self._json_body()
            items = body.get("items") or body.get("confirmations") or []
            record = _WORKSPACE.confirm_mappings(dataset_id, items)
            self._respond_json(200, record.public_dict())
            return
        if path.endswith("/jobs") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            job = _WORKSPACE.start_analysis(dataset_id)
            self._respond_json(202, job.to_dict())
            return
        if path.endswith("/query") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            result = _WORKSPACE.query_facts(dataset_id, self._json_body())
            self._respond_json(200, result)
            return
        if path.endswith("/cost-breakdown") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            result = _WORKSPACE.cost_breakdown(dataset_id, self._json_body())
            self._respond_json(200, result)
            return
        if path.endswith("/signals") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            result = _WORKSPACE.cfo_signals(dataset_id, self._json_body())
            self._respond_json(200, result)
            return
        if path.endswith("/ai-cfo/ask") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            result = _WORKSPACE.ask_ai_cfo(dataset_id, self._json_body())
            self._respond_json(200, result)
            return
        if path.endswith("/strategic-decisions") and path.startswith("/datasets/"):
            dataset_id = path.split("/")[2]
            result = _WORKSPACE.track_strategic_decision(dataset_id, self._json_body())
            self._respond_json(201, result)
            return
        if "/strategic-decisions/" in path and path.startswith("/datasets/"):
            parts = [p for p in path.split("/") if p]
            # datasets/{id}/strategic-decisions/{decision_id}/evaluate|review
            if len(parts) >= 5 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                action = parts[4]
                body = self._json_body()
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
        self._respond_json(404, {"message": "Not found"})

    def _do_PUT(self) -> None:
        if self._handle_worker():
            return
        self._respond_json(405, {"message": "Method not allowed"})

    def _do_PATCH(self) -> None:
        if self._handle_worker():
            return
        path = self._path()
        if "/strategic-decisions/" in path and path.startswith("/datasets/") and path.endswith("/status"):
            parts = [p for p in path.split("/") if p]
            if len(parts) >= 5 and parts[2] == "strategic-decisions":
                dataset_id = parts[1]
                decision_id = parts[3]
                self._respond_json(
                    200,
                    _WORKSPACE.update_strategic_decision_status(dataset_id, decision_id, self._json_body()),
                )
                return
        self._respond_json(404, {"message": "Not found"})

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
            self._respond_json(404, {"message": "Not found"})
            return True
        except Exception as exc:
            self._respond_exception(exc)
            return True

    def _dispatch_worker(self, path: str) -> bool:
        parts = [part for part in path.split("/") if part]
        if len(parts) >= 3 and parts[0] == "worker" and parts[1] == "jobs" and parts[2] == "claim":
            if self.command != "POST":
                self._respond_json(405, {"message": "Method not allowed"})
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
        self._respond_json(404, {"message": "Not found"})
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

    def _respond_json(self, status: int, payload, extra: dict | None = None) -> None:
        body = self._encode_json(payload)
        self._send(status, body, extra=extra)

    def _respond_exception(self, exc: Exception) -> None:
        traceback.print_exc()
        logger.exception("analytics HTTP handler error")
        self._respond_json(
            500,
            {
                "message": "Analytics worker error.",
                "error": exc.__class__.__name__,
                "detail": str(exc),
            },
        )

    def _send(self, status: int, body: bytes, extra: dict | None = None) -> None:
        self.send_response(status)
        headers = dict(extra or {})
        content_type = headers.pop("Content-Type", headers.pop("content-type", "application/json"))
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        for key, value in headers.items():
            self.send_header(key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)


def main() -> None:
    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"WYZ analytics local worker listening on http://{HOST}:{PORT}{PREFIX}", flush=True)
    print(f"WYZ analytics work_dir={_CONFIG.work_dir.resolve()}", flush=True)
    if _CONFIG.embedded_worker:
        print("Embedded claim loop enabled (local process worker).", flush=True)
    else:
        print("Embedded claim loop disabled. External/Kubernetes workers should poll remotely.", flush=True)
    print("Non-production development adapter. Do not expose publicly.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.", flush=True)


if __name__ == "__main__":
    main()
