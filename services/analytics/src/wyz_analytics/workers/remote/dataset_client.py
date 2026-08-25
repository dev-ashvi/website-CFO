"""Remote dataset metadata store via outbound HTTPS."""

from __future__ import annotations

from wyz_analytics.workers.datasets import DatasetRecord
from wyz_analytics.workers.remote.http_client import RemoteHttpClient


class RemoteDatasetStore:
    WORKER_PREFIX = "/worker/datasets"

    def __init__(self, client: RemoteHttpClient):
        self.client = client

    def put(self, record: DatasetRecord) -> DatasetRecord:
        payload = self.client.json_request(
            "PUT",
            f"{self.WORKER_PREFIX}/{record.dataset_id}",
            json_body=record.to_record(),
        )
        return DatasetRecord.from_dict(payload)

    def get(self, dataset_id: str) -> DatasetRecord:
        payload = self.client.json_request("GET", f"{self.WORKER_PREFIX}/{dataset_id}")
        return DatasetRecord.from_dict(payload)

    def list(self, *, workspace_id: str | None = None, skip_malformed: bool = True) -> list[DatasetRecord]:
        raise NotImplementedError("Remote dataset listing is not supported.")
