import type { HumanDecision, PipelineEvent, PipelineRun, PipelineStage, StageArtifact } from "@devflow/shared";
import { getAgentPromptProfile } from "../agents/agentPrompts.js";
import type { AgentProvider } from "../agents/agentProvider.js";
import type { DevFlowNotifier } from "../integrations/notifier.js";
import type { MemoryPipelineStore } from "../store/memoryStore.js";
import type { CodeContextService } from "./codeContextService.js";
import { NoopCodeContextService } from "./codeContextService.js";
import type { WorkspaceChangeResult, WorkspaceChangeService } from "./workspaceChangeService.js";
import { NoopWorkspaceChangeService } from "./workspaceChangeService.js";

export class PipelineRunner {
  private readonly activeRuns = new Set<string>();

  constructor(
    private readonly store: MemoryPipelineStore,
    private readonly agentProvider: AgentProvider,
    private readonly notifier: DevFlowNotifier,
    private readonly workspaceChangeService: WorkspaceChangeService = new NoopWorkspaceChangeService(),
    private readonly codeContextService: CodeContextService = new NoopCodeContextService()
  ) {}

  start(pipelineId: string): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);

    if (["cancelled", "completed", "failed", "waiting_for_human"].includes(pipeline.status)) {
      return pipeline;
    }

    const startedAt = new Date().toISOString();
    const started = this.store.save(
      appendEvent(
        {
          ...pipeline,
          status: "running",
          startedAt: pipeline.startedAt ?? startedAt
        },
        {
          type: "pipeline_started",
          message: pipeline.startedAt ? "Pipeline 已继续运行。" : "Pipeline 已启动。",
          createdAt: startedAt
        }
      )
    );

    if (!this.activeRuns.has(pipelineId)) {
      this.activeRuns.add(pipelineId);
      void this.runUntilBlocked(pipelineId).finally(() => this.activeRuns.delete(pipelineId));
    }

    return started;
  }

  cancel(pipelineId: string): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);
    const now = new Date().toISOString();
    return this.store.save(
      appendEvent(
        {
          ...pipeline,
          status: "cancelled",
          completedAt: now
        },
        {
          type: "pipeline_cancelled",
          message: "Pipeline 已取消。",
          createdAt: now
        }
      )
    );
  }

  approve(pipelineId: string, stageId: string): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);
    this.requireWaitingCheckpoint(pipeline, stageId);

    const now = new Date().toISOString();
    const decision: HumanDecision = { action: "approved", decidedAt: now };

    const stages = pipeline.stages.map((stage) =>
      stage.id === stageId && stage.kind === "checkpoint"
        ? {
            ...stage,
            status: "approved" as const,
            completedAt: now,
            humanDecision: decision
          }
        : stage
    );

    const updated = this.store.save(
      appendEvent(
        {
          ...pipeline,
          stages,
          status: "running",
          currentStageId: stageId
        },
        {
          type: "checkpoint_approved",
          message: "人工审批已通过，Pipeline 将继续执行。",
          createdAt: now,
          stageId
        }
      )
    );

    return this.start(updated.id);
  }

  reject(pipelineId: string, stageId: string, reason: string): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);
    const checkpoint = this.requireWaitingCheckpoint(pipeline, stageId);

    const rollbackStageId = checkpoint.dependsOn?.[0];
    const rollbackIndex = pipeline.stages.findIndex((stage) => stage.id === rollbackStageId);
    const now = new Date().toISOString();

    if (rollbackIndex < 0) {
      throw new PipelineStateError(`Checkpoint ${stageId} does not define a retry target.`);
    }

    const rollbackStage = pipeline.stages[rollbackIndex];
    if (rollbackStage.retryCount >= rollbackStage.maxRetries) {
      const decision: HumanDecision = { action: "rejected", reason, decidedAt: now };
      const rejectedStages = updateStage(pipeline.stages, stageId, {
        status: "rejected",
        completedAt: now,
        humanDecision: decision
      });

      return this.store.save(
        appendEvent(
          appendEvent(
            {
              ...pipeline,
              stages: rejectedStages,
              status: "failed",
              currentStageId: rollbackStage.id,
              completedAt: now
            },
            {
              type: "checkpoint_rejected",
              message: `人工审批已驳回，但 ${rollbackStage.name} 已达到最大重试次数。`,
              createdAt: now,
              stageId,
              details: {
                reason,
                retryCount: rollbackStage.retryCount,
                maxRetries: rollbackStage.maxRetries
              }
            }
          ),
          {
            type: "stage_failed",
            message: `阶段失败：${rollbackStage.name} 已达到最大重试次数。`,
            createdAt: now,
            stageId: rollbackStage.id,
            details: {
              retryCount: rollbackStage.retryCount,
              maxRetries: rollbackStage.maxRetries
            }
          }
        )
      );
    }

    const stages = pipeline.stages.map((stage, index) => {
      if (rollbackIndex >= 0 && index >= rollbackIndex) {
        return resetStageForRetry(stage, index === rollbackIndex);
      }

      if (stage.id === stageId) {
        return {
          ...stage,
          status: "rejected" as const,
          completedAt: now,
          humanDecision: { action: "rejected" as const, reason, decidedAt: now }
        };
      }

      return stage;
    });

    const updated = this.store.save(
      appendEvent(
        {
          ...pipeline,
          stages,
          status: "running",
          currentStageId: rollbackStageId
        },
        {
          type: "checkpoint_rejected",
          message: `人工审批已驳回，回退到 ${rollbackStageId ?? "上一阶段"} 重做。`,
          createdAt: now,
          stageId,
          details: {
            reason
          }
        }
      )
    );

    return this.start(updated.id);
  }

  private async runUntilBlocked(pipelineId: string): Promise<void> {
    let pipeline = this.requirePipeline(pipelineId);

    while (pipeline.status === "running") {
      const nextStage = findNextExecutableStage(pipeline);

      if (!nextStage) {
        const allDone = pipeline.stages.every((stage) =>
          ["completed", "approved", "skipped"].includes(stage.status)
        );

        const now = new Date().toISOString();
        const completed = this.store.save(
          allDone
            ? appendEvent(
                {
                  ...pipeline,
                  status: "completed",
                  completedAt: now
                },
                {
                  type: "pipeline_completed",
                  message: "Pipeline 已完成全部阶段。",
                  createdAt: now
                }
              )
            : {
                ...pipeline,
                status: pipeline.status,
                completedAt: pipeline.completedAt
              }
        );

        if (completed.status === "completed") {
          await this.safeNotify(() => this.notifier.pipelineCompleted(completed));
        }

        return;
      }

      if (nextStage.kind === "checkpoint") {
        const now = new Date().toISOString();
        pipeline = this.store.save({
          ...pipeline,
          status: "waiting_for_human",
          currentStageId: nextStage.id,
          stages: updateStage(pipeline.stages, nextStage.id, {
            status: "waiting_for_human",
            startedAt: nextStage.startedAt ?? now
          }),
          events: appendEvent(pipeline, {
            type: "checkpoint_waiting",
            message: `等待人工审批：${nextStage.name}。`,
            createdAt: now,
            stageId: nextStage.id
          }).events
        });
        await this.safeNotify(() => this.notifier.checkpointWaiting(pipeline, nextStage));
        return;
      }

      pipeline = await this.executeAgentStage(pipeline, nextStage);
    }
  }

  private async executeAgentStage(pipeline: PipelineRun, stage: PipelineStage): Promise<PipelineRun> {
    const startedAt = new Date().toISOString();
    let running = this.store.save(
      appendEvent(
        {
          ...pipeline,
          currentStageId: stage.id,
          stages: updateStage(pipeline.stages, stage.id, {
            status: "running",
            startedAt,
            artifact: undefined,
            stream: {
              content: "",
              updatedAt: startedAt,
              isComplete: false
            }
          })
        },
        {
          type: "stage_started",
          message: `开始执行阶段：${stage.name}。`,
          createdAt: startedAt,
          stageId: stage.id,
          details: {
            kind: stage.kind,
            agentRole: stage.agentRole ?? null,
            promptProfile: stage.agentRole ? getAgentPromptProfile(stage.agentRole).title : null,
            provider: this.agentProvider.name
          }
        }
      )
    );

    try {
      const previousArtifacts = running.stages
        .filter((item) => item.artifact && item.id !== stage.id)
        .map((item) => item.artifact as StageArtifact);
      const codeContext = await this.codeContextService.collect({
        pipeline: running,
        stage,
        previousArtifacts
      });

      if (codeContext) {
        running = this.store.save({
          ...running,
          stages: updateStage(running.stages, stage.id, {
            codeContext
          })
        });
      }

      let lastStreamContent = "";
      let lastStreamSaveAt = 0;
      const saveStream = (content: string, isComplete = false) => {
        const now = Date.now();
        lastStreamContent = content;
        if (!isComplete && now - lastStreamSaveAt < 80) {
          return;
        }

        lastStreamSaveAt = now;
        running = this.updateStageStream(running.id, stage.id, content, isComplete);
      };

      let artifact = await this.agentProvider.execute(
        { pipeline: running, stage, previousArtifacts, codeContext },
        {
          onStream: ({ content }) => saveStream(content)
        }
      );

      if (stage.id === "code-generation") {
        const workspaceChange = await this.workspaceChangeService.applyCodeGeneration(running);
        if (workspaceChange) {
          artifact = appendWorkspaceChangeArtifact(artifact, workspaceChange);
          saveStream(artifact.markdown, true);
        }
      }

      const completedAt = new Date().toISOString();

      running = this.requirePipeline(running.id);
      running = this.store.save(
        appendEvent(
          {
            ...running,
            stages: updateStage(running.stages, stage.id, {
              status: "completed",
              completedAt,
              artifact,
              stream: {
                content: lastStreamContent || artifact.markdown,
                updatedAt: completedAt,
                isComplete: true
              }
            })
          },
          {
            type: "stage_completed",
            message: `阶段完成：${stage.name}。`,
            createdAt: completedAt,
            stageId: stage.id,
            details: {
              artifactTitle: artifact.title,
              durationMs: Date.parse(completedAt) - Date.parse(startedAt)
            }
          }
        )
      );

      return running;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : "Unknown error";
      running = this.requirePipeline(running.id);
      return this.store.save(
        appendEvent(
          {
            ...running,
            status: "failed",
            stages: updateStage(running.stages, stage.id, {
              status: "failed",
              completedAt,
              artifact: {
                title: "Agent 执行失败",
                summary: message,
                markdown: "Agent 执行过程中发生错误。",
                createdAt: completedAt
              },
              stream: running.stages.find((item) => item.id === stage.id)?.stream
                ? {
                    ...(running.stages.find((item) => item.id === stage.id)?.stream as NonNullable<PipelineStage["stream"]>),
                    updatedAt: completedAt,
                    isComplete: true
                  }
                : undefined
            })
          },
          {
            type: "stage_failed",
            message: `阶段失败：${stage.name}。${message}`,
            createdAt: completedAt,
            stageId: stage.id
          }
        )
      );
    }
  }

  private updateStageStream(
    pipelineId: string,
    stageId: string,
    content: string,
    isComplete: boolean
  ): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);
    return this.store.save({
      ...pipeline,
      stages: updateStage(pipeline.stages, stageId, {
        stream: {
          content,
          updatedAt: new Date().toISOString(),
          isComplete
        }
      })
    });
  }

  private requirePipeline(pipelineId: string): PipelineRun {
    const pipeline = this.store.get(pipelineId);

    if (!pipeline) {
      throw new PipelineStateError(`Pipeline ${pipelineId} not found.`, 404);
    }

    return pipeline;
  }

  private requireWaitingCheckpoint(pipeline: PipelineRun, stageId: string): PipelineStage {
    const stage = pipeline.stages.find((item) => item.id === stageId);

    if (!stage || stage.kind !== "checkpoint") {
      throw new PipelineStateError(`Checkpoint ${stageId} not found.`, 404);
    }

    if (
      pipeline.status !== "waiting_for_human" ||
      pipeline.currentStageId !== stageId ||
      stage.status !== "waiting_for_human"
    ) {
      throw new PipelineStateError(`Checkpoint ${stageId} is not waiting for human decision.`);
    }

    return stage;
  }

  private async safeNotify(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      console.warn("[notify] failed", error);
    }
  }
}

class PipelineStateError extends Error {
  constructor(message: string, readonly statusCode = 409) {
    super(message);
  }
}

type PipelineEventInput = Omit<PipelineEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

function appendEvent(pipeline: PipelineRun, event: PipelineEventInput): PipelineRun {
  const createdAt = event.createdAt ?? new Date().toISOString();
  const nextEvent: PipelineEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt
  };

  return {
    ...pipeline,
    events: [...(pipeline.events ?? []), nextEvent]
  };
}

function findNextExecutableStage(pipeline: PipelineRun): PipelineStage | undefined {
  return pipeline.stages.find((stage) => {
    if (stage.status !== "pending") {
      return false;
    }

    return (stage.dependsOn ?? []).every((dependencyId) => {
      const dependency = pipeline.stages.find((item) => item.id === dependencyId);
      return dependency && ["completed", "approved"].includes(dependency.status);
    });
  });
}

function updateStage(
  stages: PipelineStage[],
  stageId: string,
  patch: Partial<PipelineStage>
): PipelineStage[] {
  return stages.map((stage) => (stage.id === stageId ? { ...stage, ...patch } : stage));
}

function resetStageForRetry(stage: PipelineStage, incrementRetry: boolean): PipelineStage {
  return {
    ...stage,
    status: "pending",
    artifact: undefined,
    stream: undefined,
    humanDecision: undefined,
    codeContext: undefined,
    startedAt: undefined,
    completedAt: undefined,
    retryCount: incrementRetry ? stage.retryCount + 1 : stage.retryCount
  };
}

function appendWorkspaceChangeArtifact(
  artifact: StageArtifact,
  workspaceChange: WorkspaceChangeResult
): StageArtifact {
  const changedFileList =
    workspaceChange.changedFiles.length > 0
      ? workspaceChange.changedFiles.map((file) => `- ${file}`).join("\n")
      : "- 无新增文件变更";
  const diffSection = workspaceChange.diff
    ? ["```diff", workspaceChange.diff, "```"].join("\n")
    : "本次运行没有产生新的 diff，目标工作区内容已经匹配生成结果。";

  return {
    ...artifact,
    summary: `${artifact.summary} ${workspaceChange.summary}`,
    markdown: [
      artifact.markdown,
      "",
      "## 真实工作区变更",
      "",
      workspaceChange.summary,
      "",
      "### 修改文件",
      changedFileList,
      "",
      "### Diff",
      diffSection
    ].join("\n")
  };
}
