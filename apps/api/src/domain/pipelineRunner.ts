import type { HumanDecision, PipelineEvent, PipelineRun, PipelineStage, StageArtifact } from "@devflow/shared";
import { getAgentPromptProfile } from "../agents/agentPrompts.js";
import type { AgentProvider } from "../agents/agentProvider.js";
import type { DevFlowNotifier } from "../integrations/notifier.js";
import type { MemoryPipelineStore } from "../store/memoryStore.js";

export class PipelineRunner {
  private readonly activeRuns = new Set<string>();

  constructor(
    private readonly store: MemoryPipelineStore,
    private readonly agentProvider: AgentProvider,
    private readonly notifier: DevFlowNotifier
  ) {}

  start(pipelineId: string): PipelineRun {
    const pipeline = this.requirePipeline(pipelineId);

    if (pipeline.status === "cancelled" || pipeline.status === "completed") {
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
    const checkpoint = pipeline.stages.find((stage) => stage.id === stageId);

    if (!checkpoint || checkpoint.kind !== "checkpoint") {
      throw new Error(`Checkpoint ${stageId} not found.`);
    }

    const rollbackStageId = checkpoint.dependsOn?.[0];
    const rollbackIndex = pipeline.stages.findIndex((stage) => stage.id === rollbackStageId);
    const now = new Date().toISOString();

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

      let lastStreamContent = "";
      let lastStreamSaveAt = 0;
      const saveStream = (content: string, isComplete = false) => {
        const now = Date.now();
        lastStreamContent = content;
        if (!isComplete && now - lastStreamSaveAt < 180) {
          return;
        }

        lastStreamSaveAt = now;
        running = this.updateStageStream(running.id, stage.id, content, isComplete);
      };

      const artifact = await this.agentProvider.execute(
        { pipeline: running, stage, previousArtifacts },
        {
          onStream: ({ content }) => saveStream(content)
        }
      );
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
      throw new Error(`Pipeline ${pipelineId} not found.`);
    }

    return pipeline;
  }

  private async safeNotify(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      console.warn("[notify] failed", error);
    }
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
    startedAt: undefined,
    completedAt: undefined,
    retryCount: incrementRetry ? stage.retryCount + 1 : stage.retryCount
  };
}
