export type PipelineStatus =
  | "draft"
  | "running"
  | "waiting_for_human"
  | "completed"
  | "failed"
  | "cancelled";

export type StageStatus =
  | "pending"
  | "running"
  | "waiting_for_human"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "skipped";

export type StageKind = "agent" | "checkpoint";

export type AgentRole =
  | "requirements_analyst"
  | "solution_architect"
  | "coder"
  | "test_engineer"
  | "reviewer"
  | "delivery_manager";

export interface StageArtifact {
  title: string;
  summary: string;
  markdown: string;
  createdAt: string;
}

export interface StageStream {
  content: string;
  updatedAt: string;
  isComplete: boolean;
}

export interface PipelineStage {
  id: string;
  name: string;
  kind: StageKind;
  status: StageStatus;
  agentRole?: AgentRole;
  dependsOn?: string[];
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  artifact?: StageArtifact;
  stream?: StageStream;
  humanDecision?: HumanDecision;
}

export interface HumanDecision {
  action: "approved" | "rejected";
  reason?: string;
  decidedAt: string;
}

export type PipelineEventType =
  | "pipeline_created"
  | "pipeline_started"
  | "stage_started"
  | "stage_completed"
  | "stage_failed"
  | "checkpoint_waiting"
  | "checkpoint_approved"
  | "checkpoint_rejected"
  | "pipeline_completed"
  | "pipeline_cancelled";

export interface PipelineEvent {
  id: string;
  type: PipelineEventType;
  message: string;
  createdAt: string;
  stageId?: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface PipelineRun {
  id: string;
  name: string;
  requirement: string;
  targetRepoPath?: string;
  status: PipelineStatus;
  stages: PipelineStage[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  currentStageId?: string;
  events?: PipelineEvent[];
}

export interface CreatePipelineRequest {
  name?: string;
  requirement: string;
  targetRepoPath?: string;
}

export interface RejectCheckpointRequest {
  reason: string;
}

export interface ApiErrorResponse {
  message: string;
  details?: unknown;
}
