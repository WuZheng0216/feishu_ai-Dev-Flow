import type { CreatePipelineRequest, PipelineRun, RejectCheckpointRequest } from "@devflow/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export async function listPipelines(): Promise<PipelineRun[]> {
  return request("/api/pipelines");
}

export async function createPipeline(input: CreatePipelineRequest): Promise<PipelineRun> {
  return request("/api/pipelines", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function startPipeline(id: string): Promise<PipelineRun> {
  return request(`/api/pipelines/${id}/start`, {
    method: "POST"
  });
}

export async function getPipeline(id: string): Promise<PipelineRun> {
  return request(`/api/pipelines/${id}`);
}

export async function approveCheckpoint(id: string, stageId: string): Promise<PipelineRun> {
  return request(`/api/pipelines/${id}/checkpoints/${stageId}/approve`, {
    method: "POST"
  });
}

export async function rejectCheckpoint(
  id: string,
  stageId: string,
  input: RejectCheckpointRequest
): Promise<PipelineRun> {
  return request(`/api/pipelines/${id}/checkpoints/${stageId}/reject`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...init
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? "Request failed");
  }

  return response.json() as Promise<T>;
}
