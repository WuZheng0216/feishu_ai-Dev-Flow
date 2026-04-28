import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { describe, it } from "node:test";
import type { AgentProvider, AgentExecutionInput, AgentExecutionCallbacks } from "../src/agents/agentProvider.js";
import {
  createCodeContextService,
  type CodeContextService
} from "../src/domain/codeContextService.js";
import { createDefaultStages } from "../src/domain/defaultPipeline.js";
import { PipelineRunner } from "../src/domain/pipelineRunner.js";
import {
  createWorkspaceChangeService,
  type WorkspaceChangeService
} from "../src/domain/workspaceChangeService.js";
import type { DevFlowNotifier } from "../src/integrations/notifier.js";
import { MemoryPipelineStore } from "../src/store/memoryStore.js";
import type { PipelineRun, PipelineStage, StageArtifact } from "@devflow/shared";

describe("PipelineRunner", () => {
  it("pauses at both human checkpoints and completes after approvals", async () => {
    const { pipeline, runner, store } = createHarness();

    runner.start(pipeline.id);

    let current = await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "design-approval"
    );
    assert.equal(current.stages.find((stage) => stage.id === "requirement-analysis")?.status, "completed");
    assert.equal(current.stages.find((stage) => stage.id === "solution-design")?.status, "completed");

    runner.approve(pipeline.id, "design-approval");
    current = await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "release-approval"
    );
    assert.equal(current.stages.find((stage) => stage.id === "code-generation")?.status, "completed");
    assert.equal(current.stages.find((stage) => stage.id === "code-review")?.status, "completed");

    runner.approve(pipeline.id, "release-approval");
    current = await waitForPipeline(store, pipeline.id, (item) => item.status === "completed");

    assert.equal(current.stages.find((stage) => stage.id === "delivery")?.status, "completed");
    assert.ok(current.events?.some((event) => event.type === "pipeline_completed"));
  });

  it("rejects a checkpoint by resetting the upstream stage for retry", async () => {
    const { pipeline, runner, store } = createHarness();

    runner.start(pipeline.id);
    await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "design-approval"
    );

    runner.reject(pipeline.id, "design-approval", "需要补充回滚策略。");
    const current = await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" &&
      item.currentStageId === "design-approval" &&
      item.stages.find((stage) => stage.id === "solution-design")?.retryCount === 1
    );

    const solutionDesign = current.stages.find((stage) => stage.id === "solution-design");
    assert.equal(solutionDesign?.status, "completed");
    assert.equal(solutionDesign?.retryCount, 1);
    assert.ok(current.events?.some((event) => event.type === "checkpoint_rejected"));
  });

  it("does not allow approving a checkpoint that is not waiting", () => {
    const { pipeline, runner } = createHarness();

    assert.throws(
      () => runner.approve(pipeline.id, "design-approval"),
      /not waiting for human decision/
    );
  });

  it("fails the pipeline when retry limit is exceeded", async () => {
    const { pipeline, runner, store } = createHarness();

    runner.start(pipeline.id);
    await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "design-approval"
    );

    runner.reject(pipeline.id, "design-approval", "第一次驳回。");
    await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" &&
      item.currentStageId === "design-approval" &&
      item.stages.find((stage) => stage.id === "solution-design")?.retryCount === 1
    );

    runner.reject(pipeline.id, "design-approval", "第二次驳回。");
    await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" &&
      item.currentStageId === "design-approval" &&
      item.stages.find((stage) => stage.id === "solution-design")?.retryCount === 2
    );

    const failed = runner.reject(pipeline.id, "design-approval", "第三次驳回。");

    assert.equal(failed.status, "failed");
    assert.equal(failed.currentStageId, "solution-design");
    assert.ok(
      failed.events?.some(
        (event) => event.type === "stage_failed" && event.stageId === "solution-design"
      )
    );
  });

  it("adds a real workspace diff during the code-generation stage", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    await writeFile(
      resolve(targetDirectory, "src/Home.tsx"),
      [
        'export function Home() {',
        '  return <main>Demo baseline</main>;',
        '}',
        ''
      ].join("\n"),
      "utf8"
    );

    const { pipeline, runner, store } = createHarness({
      targetRepoPath,
      workspaceChangeService: createWorkspaceChangeService(projectRoot)
    });

    try {
      runner.start(pipeline.id);
      await waitForPipeline(store, pipeline.id, (item) =>
        item.status === "waiting_for_human" && item.currentStageId === "design-approval"
      );

      runner.approve(pipeline.id, "design-approval");
      const current = await waitForPipeline(store, pipeline.id, (item) =>
        item.status === "waiting_for_human" && item.currentStageId === "release-approval"
      );
      const codeGeneration = current.stages.find((stage) => stage.id === "code-generation");
      const generatedHome = await readFile(resolve(targetDirectory, "src/Home.tsx"), "utf8");

      assert.equal(codeGeneration?.status, "completed");
      assert.match(codeGeneration?.artifact?.markdown ?? "", /真实工作区变更/);
      assert.match(codeGeneration?.artifact?.markdown ?? "", /```diff/);
      assert.match(generatedHome, /比赛亮点/);
      assert.match(generatedHome, /AI Pipeline/);
    } finally {
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it("resolves workspace targets from the project root when API cwd is apps/api", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-cwd-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    const originalCwd = process.cwd();
    process.chdir(resolve(projectRoot, "apps/api"));

    const { pipeline, runner, store } = createHarness({
      targetRepoPath,
      workspaceChangeService: createWorkspaceChangeService()
    });

    try {
      runner.start(pipeline.id);
      await waitForPipeline(store, pipeline.id, (item) =>
        item.status === "waiting_for_human" && item.currentStageId === "design-approval"
      );

      runner.approve(pipeline.id, "design-approval");
      await waitForPipeline(store, pipeline.id, (item) =>
        item.status === "waiting_for_human" && item.currentStageId === "release-approval"
      );

      const generatedHome = await readFile(resolve(targetDirectory, "src/Home.tsx"), "utf8");
      assert.match(generatedHome, /比赛亮点/);
    } finally {
      process.chdir(originalCwd);
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it("collects requested code context for agent stages", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-context-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    await writeFile(resolve(targetDirectory, "package.json"), '{"name":"context-demo"}\n', "utf8");
    await writeFile(
      resolve(targetDirectory, "src/Home.tsx"),
      'export function Home() { return <main>Context demo</main>; }\n',
      "utf8"
    );

    const { pipeline, runner, store } = createHarness({
      targetRepoPath,
      contextPaths: ["src/Home.tsx"],
      codeContextService: createCodeContextService(projectRoot)
    });

    try {
      runner.start(pipeline.id);
      const current = await waitForPipeline(store, pipeline.id, (item) =>
        item.status === "waiting_for_human" && item.currentStageId === "design-approval"
      );
      const requirementAnalysis = current.stages.find((stage) => stage.id === "requirement-analysis");
      const context = requirementAnalysis?.codeContext;

      assert.ok(context);
      assert.ok(context.tree.some((entry) => entry.path === "src" && entry.kind === "directory"));
      assert.ok(context.files.some((file) => file.path === "src/Home.tsx" && file.content.includes("Context demo")));
      assert.ok(context.files.some((file) => file.path === "package.json"));
    } finally {
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });
});

class FastAgentProvider implements AgentProvider {
  readonly name = "fast-test";

  async execute(
    { stage }: AgentExecutionInput,
    callbacks?: AgentExecutionCallbacks
  ): Promise<StageArtifact> {
    const markdown = `# ${stage.name}\n\n测试产物：${stage.id}`;
    await callbacks?.onStream?.({ delta: markdown, content: markdown });

    return {
      title: `${stage.name}产物`,
      summary: `${stage.name}已完成`,
      markdown,
      createdAt: new Date().toISOString()
    };
  }
}

function findProjectRootForTest(): string {
  let current = resolve(process.cwd());

  while (true) {
    if (existsSync(join(current, "tsconfig.base.json")) && existsSync(join(current, "package.json"))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current || parse(current).root === current) {
      throw new Error("Could not find project root for test.");
    }

    current = parent;
  }
}

class NoopNotifier implements DevFlowNotifier {
  async checkpointWaiting(_pipeline: PipelineRun, _stage: PipelineStage): Promise<void> {}

  async pipelineCompleted(_pipeline: PipelineRun): Promise<void> {}
}

function createHarness(options: {
  targetRepoPath?: string;
  contextPaths?: string[];
  workspaceChangeService?: WorkspaceChangeService;
  codeContextService?: CodeContextService;
} = {}): {
  pipeline: PipelineRun;
  runner: PipelineRunner;
  store: MemoryPipelineStore;
} {
  const store = new MemoryPipelineStore();
  const runner = new PipelineRunner(
    store,
    new FastAgentProvider(),
    new NoopNotifier(),
    options.workspaceChangeService,
    options.codeContextService
  );
  const now = new Date().toISOString();
  const pipeline = store.save({
    id: crypto.randomUUID(),
    name: "测试 Pipeline",
    requirement: "请为演示站点增加比赛亮点区域，并补充基础测试。",
    targetRepoPath: options.targetRepoPath ?? "workspace/demo",
    contextPaths: options.contextPaths,
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
  });

  return { pipeline, runner, store };
}

async function waitForPipeline(
  store: MemoryPipelineStore,
  pipelineId: string,
  predicate: (pipeline: PipelineRun) => boolean
): Promise<PipelineRun> {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    const pipeline = store.get(pipelineId);

    if (pipeline && predicate(pipeline)) {
      return pipeline;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const latest = store.get(pipelineId);
  throw new Error(`Timed out waiting for pipeline state. Latest: ${JSON.stringify(latest)}`);
}
