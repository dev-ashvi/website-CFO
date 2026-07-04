import { httpClient } from "./httpClient.js";
import { isDemoSession } from "./devMode.js";

const DEMO_ARTIFACTS = [
  {
    id: "demo-mis",
    title: "Monthly MIS (demo)",
    type: "report",
    status: "ready",
    updated_at: new Date().toISOString(),
  },
  {
    id: "demo-runway",
    title: "Cash & runway snapshot (demo)",
    type: "report",
    status: "ready",
    updated_at: new Date().toISOString(),
  },
];

export async function getArtifacts() {
  if (isDemoSession()) return DEMO_ARTIFACTS;
  return httpClient.get("/api/v1/artifacts");
}

export async function getArtifact(id) {
  if (!id) {
    throw new Error("Artifact id is required.");
  }
  if (isDemoSession()) {
    const found = DEMO_ARTIFACTS.find((a) => a.id === id);
    return (
      found || {
        id,
        title: "Demo artifact",
        type: "report",
        status: "ready",
        content: "This is a demo artifact for the live frontend preview.",
      }
    );
  }
  return httpClient.get(`/api/v1/artifacts/${encodeURIComponent(id)}`);
}
