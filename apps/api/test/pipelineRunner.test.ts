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
import { parseRequirementAttachments } from "../src/domain/requirementAttachmentService.js";
import type { DevFlowNotifier } from "../src/integrations/notifier.js";
import { MemoryPipelineStore } from "../src/store/memoryStore.js";
import type { PipelineRun, PipelineStage, StageArtifact } from "@devflow/shared";

describe("PipelineRunner", () => {
  it("persists pipeline runs when a storage file is configured", async () => {
    const projectRoot = findProjectRootForTest();
    const storageDirectory = resolve(projectRoot, `workspace/.tmp-devflow-store-${crypto.randomUUID()}`);
    const storageFile = resolve(storageDirectory, "pipelines.json");
    const now = new Date().toISOString();

    try {
      const store = new MemoryPipelineStore(storageFile);
      store.save({
        id: "persisted-pipeline",
        name: "Persisted pipeline",
        requirement: "Verify local persistence.",
        status: "draft",
        stages: [],
        createdAt: now,
        updatedAt: now
      });

      const restored = new MemoryPipelineStore(storageFile);
      assert.equal(restored.get("persisted-pipeline")?.name, "Persisted pipeline");
      assert.equal(restored.list().length, 1);
    } finally {
      await rm(storageDirectory, { recursive: true, force: true });
    }
  });

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

  it("applies preview refinement feedback to the workspace", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-refine-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    await writeFile(
      resolve(targetDirectory, "src/styles.css"),
      [
        ".highlightGrid {",
        "  gap: 16px;",
        "}",
        ""
      ].join("\n"),
      "utf8"
    );

    const { pipeline, runner } = createHarness({
      targetRepoPath,
      workspaceChangeService: createWorkspaceChangeService(projectRoot)
    });

    try {
      const refined = await runner.refine(pipeline.id, {
        stageId: "release-approval",
        instruction: "把这个区域做得更紧凑，标题更醒目，但不要改变整体配色。",
        selectedElement: {
          devflowId: "highlights-section",
          tagName: "section",
          text: "比赛亮点",
          file: "src/Home.tsx"
        }
      });
      const styles = await readFile(resolve(targetDirectory, "src/styles.css"), "utf8");

      assert.ok(refined.events?.some((event) => event.type === "preview_refined"));
      assert.match(styles, /devflow-refinement:start/);
      assert.match(styles, /highlightCard/);
      assert.match(styles, /font-weight: 850/);
    } finally {
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it("hides a selected preview element when the feedback asks to delete it", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-delete-refine-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    await writeFile(resolve(targetDirectory, "src/styles.css"), ".notice { display: block; }\n", "utf8");

    const { pipeline, runner } = createHarness({
      targetRepoPath,
      workspaceChangeService: createWorkspaceChangeService(projectRoot)
    });

    try {
      await runner.refine(pipeline.id, {
        instruction: "这个区域没有必要，请删除",
        selectedElement: {
          devflowId: "attachment-notice",
          tagName: "div",
          text: "附件提示",
          file: "src/Home.tsx"
        }
      });
      const styles = await readFile(resolve(targetDirectory, "src/styles.css"), "utf8");

      assert.match(styles, /\[data-devflow-id="attachment-notice"\]/);
      assert.match(styles, /display: none !important/);
    } finally {
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it("runs complex stage subtasks in parallel", async () => {
    const agentProvider = new DelayedAgentProvider(70);
    const { pipeline, runner, store } = createHarness({ agentProvider });

    runner.start(pipeline.id);
    await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "design-approval"
    );

    runner.approve(pipeline.id, "design-approval");
    const current = await waitForPipeline(store, pipeline.id, (item) =>
      item.status === "waiting_for_human" && item.currentStageId === "release-approval"
    );
    const codeGeneration = current.stages.find((stage) => stage.id === "code-generation");

    assert.ok(agentProvider.maxConcurrent >= 2);
    assert.equal(codeGeneration?.subTasks?.length, 4);
    assert.equal(codeGeneration?.subTasks?.every((subTask) => subTask.status === "completed"), true);
    assert.ok(codeGeneration?.skills?.includes("workspace_editing"));
    assert.ok(codeGeneration?.subTasks?.some((subTask) => subTask.id === "data-model"));
    assert.ok(codeGeneration?.subTasks?.some((subTask) => subTask.skills?.includes("preview_refinement")));
    assert.match(codeGeneration?.artifact?.markdown ?? "", /并行子任务汇总/);
    assert.match(codeGeneration?.artifact?.markdown ?? "", /Skills/);
  });

  it("extracts uploaded requirement text attachments", async () => {
    const attachments = await parseRequirementAttachments([
      {
        fileName: "requirement.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# 附件需求\n\n请增加一个附件驱动的需求分析入口。", "utf8")
      }
    ]);

    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.fileName, "requirement.md");
    assert.match(attachments[0]?.extractedText ?? "", /附件需求/);
    assert.equal(attachments[0]?.truncated, false);
    assert.equal(attachments[0]?.skippedReason, undefined);
  });

  it("marks page-marker-only attachments as not usable", async () => {
    const attachments = await parseRequirementAttachments([
      {
        fileName: "blank-export.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("--- page 1 of 12 ---\n\n--- page 2 of 12 ---", "utf8")
      }
    ]);

    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.extractedText, "");
    assert.match(attachments[0]?.skippedReason ?? "", /为空|可用文本/);
  });

  it("writes files from agent generated FILE blocks", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-generated-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    const workspaceChangeService = createWorkspaceChangeService(projectRoot);

    try {
      await workspaceChangeService.applyCodeGeneration({
        id: crypto.randomUUID(),
        name: "通用生成测试",
        requirement: "请生成任意业务页面。",
        targetRepoPath,
        status: "draft",
        stages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, {
        title: "代码生成",
        summary: "生成两个文件。",
        markdown: [
          "# 代码生成",
          "",
          "### FILE: src/Home.tsx",
          "```tsx",
          'export function Home() { return <main>Generated Business Page</main>; }',
          "```",
          "",
          "### FILE: src/styles.css",
          "```css",
          "main { padding: 32px; }",
          "```"
        ].join("\n"),
        createdAt: new Date().toISOString()
      });

      const generatedHome = await readFile(resolve(targetDirectory, "src/Home.tsx"), "utf8");

      assert.match(generatedHome, /Generated Business Page/);
      assert.equal(await readFile(resolve(targetDirectory, "src/styles.css"), "utf8"), "main { padding: 32px; }\n");
    } finally {
      await rm(targetDirectory, { recursive: true, force: true });
    }
  });

  it("writes a safe preview fallback when agent FILE blocks are incomplete", async () => {
    const projectRoot = findProjectRootForTest();
    const targetRepoPath = `workspace/.tmp-devflow-fallback-${crypto.randomUUID()}`;
    const targetDirectory = resolve(projectRoot, targetRepoPath);
    await mkdir(resolve(targetDirectory, "src"), { recursive: true });
    const workspaceChangeService = createWorkspaceChangeService(projectRoot);

    try {
      const result = await workspaceChangeService.applyCodeGeneration({
        id: crypto.randomUUID(),
        name: "Fallback generation test",
        requirement: "请生成一个客户案例展示网页。",
        targetRepoPath,
        status: "draft",
        stages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, {
        title: "代码生成",
        summary: "模型输出被截断。",
        markdown: [
          "# 代码变更计划",
          "### FILE: src/Home.tsx",
          "```tsx",
          "export function Home() {",
          "  return <main>Unclosed file"
        ].join("\n"),
        createdAt: new Date().toISOString()
      });

      const generatedHome = await readFile(resolve(targetDirectory, "src/Home.tsx"), "utf8");

      assert.ok(result);
      assert.match(result.summary, /安全预览|保留/);
      assert.match(generatedHome, /客户案例展示网页/);
      assert.ok(!generatedHome.includes("Unclosed file"));
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
    const markdown = buildFastAgentMarkdown(stage);
    await callbacks?.onStream?.({ delta: markdown, content: markdown });

    return {
      title: `${stage.name}产物`,
      summary: `${stage.name}已完成`,
      markdown,
      createdAt: new Date().toISOString()
    };
  }
}

function buildFastAgentMarkdown(stage: PipelineStage): string {
  if (stage.id.includes("code-generation/data-model")) {
    return [
      `# ${stage.name}`,
      "",
      "### FILE: src/types.ts",
      "```ts",
      "export interface DemoItem { title: string; }",
      "```",
      "",
      "### FILE: src/data/demo.ts",
      "```ts",
      "export const demoItems = [{ title: \"AI Pipeline\" }];",
      "```"
    ].join("\n");
  }

  if (stage.id.includes("code-generation/ui-structure")) {
    return [
      `# ${stage.name}`,
      "",
      "### FILE: src/Home.tsx",
      "```tsx",
      'import React from "react";',
      "",
      "export function Home() {",
      '  return <main><h1>比赛亮点</h1><p>AI Pipeline</p></main>;',
      "}",
      "```"
    ].join("\n");
  }

  if (stage.id.includes("code-generation/visual-style")) {
    return [
      `# ${stage.name}`,
      "",
      "### FILE: src/styles.css",
      "```css",
      "body { margin: 0; font-family: sans-serif; }",
      "main { padding: 32px; }",
      "```"
    ].join("\n");
  }

  if (stage.id.includes("code-generation/test-coverage")) {
    return [
      `# ${stage.name}`,
      "",
      "### FILE: src/Home.test.tsx",
      "```tsx",
      'import assert from "node:assert/strict";',
      'import { describe, it } from "node:test";',
      'import React from "react";',
      'import { renderToStaticMarkup } from "react-dom/server";',
      'import { Home } from "./Home";',
      "",
      'describe("Home", () => {',
      '  it("renders generated content", () => {',
      "    const html = renderToStaticMarkup(<Home />);",
      "    assert.match(html, /比赛亮点/);",
      "  });",
      "});",
      "```"
    ].join("\n");
  }

  return `# ${stage.name}\n\n测试产物：${stage.id}`;
}

class DelayedAgentProvider implements AgentProvider {
  readonly name = "delayed-test";
  active = 0;
  maxConcurrent = 0;

  constructor(private readonly delayMs: number) {}

  async execute({ stage }: AgentExecutionInput): Promise<StageArtifact> {
    this.active += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.active);

    try {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
      return {
        title: `${stage.name}产物`,
        summary: `${stage.name}已完成`,
        markdown: `# ${stage.name}\n\n并行测试产物：${stage.id}`,
        createdAt: new Date().toISOString()
      };
    } finally {
      this.active -= 1;
    }
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
  agentProvider?: AgentProvider;
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
    options.agentProvider ?? new FastAgentProvider(),
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
