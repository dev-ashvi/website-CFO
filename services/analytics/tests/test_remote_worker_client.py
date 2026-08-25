from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from wyz_analytics.workers.auth import auth_headers
from wyz_analytics.config import ENGINE_VERSION
from wyz_analytics.workers.jobs import KIND_INGEST, AnalysisJob
from wyz_analytics.workers.remote import RemoteBlobStore, RemoteHttpClient, RemoteJobStore
from wyz_analytics.workers.service import AnalyticsWorkspace
from wyz_analytics.workers.storage import URI_PREFIX
from wyz_analytics.workers.worker_api import claim_job, get_blob, put_blob, require_worker


class _WorkerApiHandler(BaseHTTPRequestHandler):
    workspace: AnalyticsWorkspace
    token: str

    def _auth_ok(self) -> bool:
        err = require_worker({k: v for k, v in self.headers.items()})
        return err is None

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def _json(self, status: int, payload: dict | None) -> None:
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def log_message(self, *_args) -> None:
        return

    def do_POST(self) -> None:  # noqa: N802
        if not self._auth_ok():
            return self._json(401, {"message": "Worker authentication required."})
        if self.path.endswith("/worker/jobs/claim"):
            status, body = claim_job(self.workspace, self._read_json())
            return self._json(status, body)
        self._json(404, {"message": "Not found"})

    def do_PUT(self) -> None:  # noqa: N802
        if not self._auth_ok():
            return self._json(401, {"message": "Worker authentication required."})
        if self.path.endswith("/worker/blobs"):
            status, body = put_blob(self.workspace, self._read_json())
            return self._json(status, body)
        self._json(404, {"message": "Not found"})

    def do_GET(self) -> None:  # noqa: N802
        if not self._auth_ok():
            return self._json(401, {"message": "Worker authentication required."})
        if "/worker/blobs?" in self.path:
            uri = self.path.split("uri=", 1)[1]
            from urllib.parse import unquote

            uri = unquote(uri)
            status, headers, data = get_blob(self.workspace, uri)
            self.send_response(status)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self._json(404, {"message": "Not found"})


@pytest.fixture()
def remote_api_server(tmp_path, monkeypatch):
    monkeypatch.setenv("WYZ_ANALYTICS_WORKER_TOKEN", "test-worker-token")
    workspace = AnalyticsWorkspace(root=tmp_path, run_loop=False, worker_id="remote-test")
    _WorkerApiHandler.workspace = workspace
    _WorkerApiHandler.token = "test-worker-token"
    server = ThreadingHTTPServer(("127.0.0.1", 0), _WorkerApiHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address
    base_url = f"http://{host}:{port}/api/v1/analytics"
    yield workspace, base_url
    server.shutdown()


def test_remote_job_client_claims_job(remote_api_server):
    workspace, base_url = remote_api_server
    job = AnalysisJob(
        job_id="job_remote",
        workspace_id="local",
        dataset_id="ds_remote",
        dataset_version=1,
        mapping_version="m1",
        engine_version=ENGINE_VERSION,
        kind=KIND_INGEST,
        message="queued",
    )
    workspace.jobs.put(job)
    client = RemoteHttpClient(base_url, worker_token="test-worker-token")
    store = RemoteJobStore(client, worker_id="remote-test")
    claimed = store.claim_next("remote-test")
    assert claimed is not None
    assert claimed.job_id == "job_remote"
    assert claimed.stage == "CLAIMED"


def test_remote_blob_store_preserves_logical_uri(remote_api_server):
    _workspace, base_url = remote_api_server
    client = RemoteHttpClient(base_url, worker_token="test-worker-token")
    blobs = RemoteBlobStore(client)
    uri = blobs.source_uri("ws1", "ds1", 2, "orders.csv")
    assert uri.startswith(URI_PREFIX)
    assert "orders.csv" in uri
    blobs.put_bytes(uri, b"order_id\n1\n")
    assert blobs.get_bytes(uri) == b"order_id\n1\n"
    assert blobs.exists(uri) is True


def test_remote_client_sends_auth_header(remote_api_server):
    _workspace, base_url = remote_api_server
    client = RemoteHttpClient(base_url, worker_token="test-worker-token")
    headers = auth_headers("test-worker-token")
    assert headers["Authorization"] == "Bearer test-worker-token"
    store = RemoteJobStore(client, worker_id="remote-test")
    assert store.claim_next("remote-test") is None
