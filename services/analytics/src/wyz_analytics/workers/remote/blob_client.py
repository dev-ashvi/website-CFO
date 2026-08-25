"""Remote blob store via outbound HTTPS. Logical URIs only."""

from __future__ import annotations

import base64
import json
from typing import Any

from wyz_analytics.workers.remote.http_client import RemoteHttpClient
from wyz_analytics.workers.storage import URI_PREFIX


class RemoteBlobStore:
    WORKER_PREFIX = "/worker/blobs"

    def __init__(self, client: RemoteHttpClient):
        self.client = client

    def source_uri(self, workspace_id: str, dataset_id: str, dataset_version: int, filename: str) -> str:
        safe = filename.split("/")[-1]
        return f"{URI_PREFIX}sources/{workspace_id}/{dataset_id}/v{dataset_version}/{safe}"

    def mapping_uri(self, dataset_id: str, mapping_version: str) -> str:
        return f"{URI_PREFIX}mappings/{dataset_id}/{mapping_version}.json"

    def result_uri(self, job_id: str) -> str:
        return f"{URI_PREFIX}results/{job_id}.json"

    def put_bytes(self, uri: str, data: bytes) -> str:
        self.client.json_request(
            "PUT",
            self.WORKER_PREFIX,
            json_body={"uri": uri, "content_base64": base64.b64encode(data).decode("ascii")},
        )
        return uri

    def get_bytes(self, uri: str) -> bytes:
        encoded = RemoteHttpClient.encode_uri(uri)
        _status, headers, payload = self.client.request("GET", f"{self.WORKER_PREFIX}?uri={encoded}", accept="*/*")
        content_type = headers.get("content-type", "")
        if "application/json" in content_type:
            parsed = json.loads(payload.decode("utf-8"))
            raw = parsed.get("content_base64")
            if raw:
                return base64.b64decode(raw)
        return payload

    def put_json(self, uri: str, payload: Any) -> str:
        data = json.dumps(payload, default=str).encode("utf-8")
        return self.put_bytes(uri, data)

    def get_json(self, uri: str) -> Any:
        return json.loads(self.get_bytes(uri).decode("utf-8"))

    def exists(self, uri: str) -> bool:
        encoded = RemoteHttpClient.encode_uri(uri)
        try:
            status, _headers, _payload = self.client.request(
                "HEAD",
                f"{self.WORKER_PREFIX}?uri={encoded}",
                accept="*/*",
            )
            return status == 200
        except Exception:
            try:
                self.get_bytes(uri)
                return True
            except Exception:
                return False
