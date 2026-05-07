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

export type StageSubTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type AgentRole =
  | "requirements_analyst"
  | "solution_architect"
  | "coder"
  | "test_engineer"
  | "reviewer"
  | "delivery_manager";

export type AgentSkill =
  | "requirement_structuring"
  | "code_context_reading"
  | "solution_decomposition"
  | "parallel_task_planning"
  | "diff_planning"
  | "workspace_editing"
  | "test_strategy"
  | "risk_review"
  | "preview_refinement"
  | "delivery_summary";

export interface AgentSkillProfile {
  id: AgentSkill;
  name: string;
  description: string;
}

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

export interface CodeContextTreeEntry {
  path: string;
  kind: "file" | "directory";
  sizeBytes?: number;
}

export interface CodeContextFile {
  path: string;
  content: string;
  sizeBytes: number;
  truncated: boolean;
}

export interface CodeContextSkippedItem {
  path: string;
  reason: string;
}

export interface CodeContextSnapshot {
  targetRepoPath: string;
  collectedAt: string;
  tree: CodeContextTreeEntry[];
  files: CodeContextFile[];
  skipped: CodeContextSkippedItem[];
  budget: {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
    usedBytes: number;
  };
}

export interface RequirementAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  summary: string;
  truncated: boolean;
  skippedReason?: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  kind: StageKind;
  status: StageStatus;
  agentRole?: AgentRole;
  skills?: AgentSkill[];
  dependsOn?: string[];
  retryCount: number;
  maxRetries: number;
  startedAt?: string;
  completedAt?: string;
  artifact?: StageArtifact;
  stream?: StageStream;
  codeContext?: CodeContextSnapshot;
  subTasks?: StageSubTask[];
  humanDecision?: HumanDecision;
}

export interface StageSubTask {
  id: string;
  title: string;
  agentRole: AgentRole;
  status: StageSubTaskStatus;
  skills?: AgentSkill[];
  scope: string[];
  dependsOn?: string[];
  parallelGroup?: string;
  startedAt?: string;
  completedAt?: string;
  artifact?: StageArtifact;
  error?: string;
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
  | "subtask_started"
  | "subtask_completed"
  | "subtask_failed"
  | "checkpoint_waiting"
  | "checkpoint_approved"
  | "checkpoint_rejected"
  | "preview_refined"
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
  contextPaths?: string[];
  requirementAttachments?: RequirementAttachment[];
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
  contextPaths?: string[];
}

export interface RejectCheckpointRequest {
  reason: string;
}

export interface PreviewElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SelectedPreviewElement {
  devflowId: string;
  tagName: string;
  text: string;
  className?: string;
  file?: string;
  selector?: string;
  bounds?: PreviewElementBounds;
}

export interface RefinePipelineRequest {
  stageId?: string;
  instruction: string;
  selectedElement: SelectedPreviewElement;
}

export interface ApiErrorResponse {
  message: string;
  details?: unknown;
}
