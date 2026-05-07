import { resolve } from "node:path";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { createAgentProvider } from "./agents/agentProvider.js";
import type { ApiConfig } from "./config.js";
import { createCodeContextService } from "./domain/codeContextService.js";
import { PipelineRunner } from "./domain/pipelineRunner.js";
import { createWorkspaceChangeService } from "./domain/workspaceChangeService.js";
import { findProjectRoot } from "./domain/workspacePaths.js";
import { createNotifier } from "./integrations/notifier.js";
import { registerPipelineRoutes } from "./routes/pipelines.js";
import { MemoryPipelineStore } from "./store/memoryStore.js";

export async function buildServer(config: ApiConfig) {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  await app.register(multipart, {
    limits: {
      files: 5,
      fileSize: 5 * 1024 * 1024,
      fields: 24
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: "DevFlow Engine API",
        description: "AI-driven requirement delivery pipeline API.",
        version: "0.1.0"
      },
      tags: [
        { name: "pipelines", description: "Pipeline lifecycle operations" },
        { name: "checkpoints", description: "Human-in-the-loop decisions" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.get("/", async () => ({
    name: "DevFlow Engine API",
    docs: "/docs",
    provider: config.llmProvider
  }));

  const store = new MemoryPipelineStore(resolve(findProjectRoot(process.cwd()), ".devflow", "pipelines.json"));
  const runner = new PipelineRunner(
    store,
    createAgentProvider(config),
    createNotifier(config),
    createWorkspaceChangeService(),
    createCodeContextService()
  );
  await registerPipelineRoutes(app, store, runner);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode ?? 500).send({
      message: error.message,
      details: "validation" in error ? error.validation : undefined
    });
  });

  return app;
}
