import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PipelineRun, RequirementAttachment } from "@devflow/shared";
import { createDefaultStages } from "../domain/defaultPipeline.js";
import type { PipelineRunner } from "../domain/pipelineRunner.js";
import {
  parseRequirementAttachments,
  type UploadedRequirementAttachment
} from "../domain/requirementAttachmentService.js";
import type { MemoryPipelineStore } from "../store/memoryStore.js";

const createPipelineSchema = z.object({
  name: z.string().min(1).optional(),
  requirement: z.string().min(8),
  targetRepoPath: z.string().min(1).optional(),
  contextPaths: z.array(z.string().min(1)).max(12).optional()
});

type ParsedCreatePipelineRequest = z.infer<typeof createPipelineSchema> & {
  requirementAttachments?: RequirementAttachment[];
};

const rejectSchema = z.object({
  reason: z.string().min(2)
});

const selectedPreviewElementSchema = z.object({
  devflowId: z.string().min(1),
  tagName: z.string().min(1),
  text: z.string(),
  className: z.string().optional(),
  file: z.string().optional(),
  selector: z.string().optional(),
  bounds: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    })
    .optional()
});

const refineSchema = z.object({
  stageId: z.string().min(1).optional(),
  instruction: z.string().min(2),
  selectedElement: selectedPreviewElementSchema
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
    const body = await parseCreatePipelineRequest(request);
    const now = new Date().toISOString();
    const pipeline: PipelineRun = {
      id: crypto.randomUUID(),
      name: body.name ?? "AI DevFlow Pipeline",
      requirement: body.requirement,
      targetRepoPath: body.targetRepoPath,
      contextPaths: body.contextPaths,
      requirementAttachments: body.requirementAttachments,
      status: "draft",
      stages: createDefaultStages(),
      createdAt: now,
      updatedAt: now,
      events: [
        {
          id: crypto.randomUUID(),
          type: "pipeline_created",
          message: "Pipeline 已创建，等待启动。",
          createdAt: now,
          details: {
            attachments: body.requirementAttachments?.length ?? 0
          }
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

  app.post("/api/pipelines/:id/refine", {
    schema: {
      tags: ["pipelines"],
      summary: "Apply a preview feedback refinement"
    }
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = refineSchema.parse(request.body);
    return runner.refine(id, body);
  });
}

async function parseCreatePipelineRequest(request: FastifyRequest): Promise<ParsedCreatePipelineRequest> {
  if (!request.isMultipart()) {
    return {
      ...createPipelineSchema.parse(request.body),
      requirementAttachments: []
    };
  }

  const fields: Record<string, string> = {};
  const files: UploadedRequirementAttachment[] = [];

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();

      if (part.fieldname === "attachments" && part.filename && buffer.length > 0) {
        files.push({
          fileName: sanitizeFileName(part.filename),
          mimeType: part.mimetype,
          buffer
        });
      }

      continue;
    }

    fields[part.fieldname] = stringifyFieldValue(part.value);
  }

  const parsed = createPipelineSchema.parse({
    name: emptyToUndefined(fields.name),
    requirement: fields.requirement,
    targetRepoPath: emptyToUndefined(fields.targetRepoPath),
    contextPaths: parseContextPathsField(fields.contextPaths)
  });

  return {
    ...parsed,
    requirementAttachments: await parseRequirementAttachments(files)
  };
}

function parseContextPathsField(value: string | undefined): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = safeParseJson(trimmed);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  }

  return trimmed
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyFieldValue(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/\\/g, "/").split("/").pop()?.trim() || "attachment";
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
