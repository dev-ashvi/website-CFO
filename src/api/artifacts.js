import { httpClient } from "./httpClient.js";

export async function getArtifacts() {
  return httpClient.get("/api/v1/artifacts");
}

export async function getArtifact(id) {
  if (!id) {
    throw new Error("Artifact id is required.");
  }
  return httpClient.get(`/api/v1/artifacts/${encodeURIComponent(id)}`);
}

