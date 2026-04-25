import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PipelineRun } from "@devflow/shared";
import { createDefaultStages } from "../domain/defaultPipeline.js";
import type { PipelineRunner } from "../domain/pipelineRunner.js";
import type { MemoryPipelineStore } from "../store/memoryStore.js";

const createPipelineSchema = z.object({
  name: z.string().min(1).optional(),
  requirement: z.string().min(8),
  targetRepoPath: z.string().min(1).optional()
});

const rejectSchema = z.object({
  reason: z.string().min(2)
});

export async function registerPipelineRoutes(
  app: FastifyInstance,
  store: MemoryPipelineStore,
  runner: PipelineRunner
): Promise<void> {
  app.get("/api/pipelines", {
    schema: {
      tags: ["pipelines"],
      summary: "List pipeline runs"
    }
  }, async () => store.list());

  app.post("/api/pipelines", {
    schema: {
      tags: ["pipelines"],
      summary: "Create a pipeline run"
    }
  }, async (request, reply) => {
    const body = createPipelineSchema.parse(request.body);
    const now = new Date().toISOString();
    const pipeline: PipelineRun = {
      id: crypto.randomUUID(),
      name: body.name ?? "AI DevFlow Pipeline",
      requirement: body.requirement,
      targetRepoPath: body.targetRepoPath,
      status: "draft",
      stages: createDefaultStages(),
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: crypto.randomUUID(),
          type: "pipeline_created",
          message: "Pipeline 已创建，等待启动。",
          createdAt: now
        }
      ]
    };

    reply.code(201);
    return store.save(pipeline);
  });

  app.get("/api/pipelines/:id", {
    schema: {
      tags: ["pipelines"],
      summary: "Get pipeline details"
    }
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const pipeline = store.get(id);

    if (!pipeline) {
      reply.code(404);
      return { message: "Pipeline not found." };
    }

    return pipeline;
  });

  app.post("/api/pipelines/:id/start", {
    schema: {
      tags: ["pipelines"],
      summary: "Start or resume a pipeline"
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    return runner.start(id);
  });

  app.post("/api/pipelines/:id/cancel", {
    schema: {
      tags: ["pipelines"],
      summary: "Cancel a pipeline"
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    return runner.cancel(id);
  });

  app.post("/api/pipelines/:id/checkpoints/:stageId/approve", {
    schema: {
      tags: ["checkpoints"],
      summary: "Approve a human checkpoint"
    }
  }, async (request) => {
    const { id, stageId } = request.params as { id: string; stageId: string };
    return runner.approve(id, stageId);
  });

  app.post("/api/pipelines/:id/checkpoints/:stageId/reject", {
    schema: {
      tags: ["checkpoints"],
      summary: "Reject a human checkpoint and retry previous stage"
    }
  }, async (request) => {
    const { id, stageId } = request.params as { id: string; stageId: string };
    const body = rejectSchema.parse(request.body);
    return runner.reject(id, stageId, body.reason);
  });
}
