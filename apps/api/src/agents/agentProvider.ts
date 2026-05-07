import type {
  AgentRole,
  AgentSkill,
  CodeContextSnapshot,
  PipelineRun,
  PipelineStage,
  StageArtifact
} from "@devflow/shared";
import type { ApiConfig } from "../config.js";
import {
  getAgentPromptProfile,
  getAgentSkillProfile,
  getDefaultSkillsForRole
} from "./agentPrompts.js";

export interface AgentExecutionInput {
  pipeline: PipelineRun;
  stage: PipelineStage;
  previousArtifacts: StageArtifact[];
  codeContext?: CodeContextSnapshot;
}

export interface AgentStreamUpdate {
  delta: string;
  content: string;
}

export interface AgentExecutionCallbacks {
  onStream?(update: AgentStreamUpdate): void | Promise<void>;
}

export interface AgentProvider {
  readonly name: string;
  execute(input: AgentExecutionInput, callbacks?: AgentExecutionCallbacks): Promise<StageArtifact>;
}

export function createAgentProvider(config: ApiConfig): AgentProvider {
  if (config.llmProvider === "doubao") {
    return new DoubaoAgentProvider(config);
  }

  return new MockAgentProvider();
}

export class MockAgentProvider implements AgentProvider {
  readonly name = "mock";

  async execute(
    { pipeline, stage, previousArtifacts, codeContext }: AgentExecutionInput,
    callbacks?: AgentExecutionCallbacks
  ): Promise<StageArtifact> {
    await new Promise((resolve) => setTimeout(resolve, 450));

    const role = stage.agentRole ?? "delivery_manager";
    const title = getAgentPromptProfile(role).title;
    const skills = resolveStageSkills(stage);
    const previous = previousArtifacts.map((item) => `- ${item.title}: ${item.summary}`).join("\n");
    const artifact = {
      title,
      summary: buildSummary(role, pipeline.requirement),
      markdown: [
        `## ${title}`,
        "",
        `**需求：** ${pipeline.requirement}`,
        "",
        "### 输入上下文",
        previous || "- 当前为第一个 Agent 阶段。",
        "",
        "### 代码库上下文",
        formatCodeContextSummary(codeContext),
        "",
        "### 需求附件",
        formatRequirementAttachmentsSummary(pipeline),
        "",
        "### 启用 Skill",
        formatSkillProfileList(skills),
        "",
        "### Agent 产物",
        buildMarkdown(role, pipeline),
        "",
        "> 当前使用 Mock Agent。后续可切换为 OpenAI 或第二模型提供商。"
      ].join("\n"),
      createdAt: new Date().toISOString()
    };

    await emitMockStream(artifact.markdown, callbacks);

    return artifact;
  }
}

interface DoubaoChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface DoubaoChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

class DoubaoAgentProvider implements AgentProvider {
  readonly name = "doubao";

  constructor(private readonly config: ApiConfig) {
    if (!config.doubao.apiKey) {
      throw new Error("LLM_PROVIDER=doubao requires DOUBAO_API_KEY or ARK_API_KEY.");
    }

    if (!config.doubao.model) {
      throw new Error("LLM_PROVIDER=doubao requires DOUBAO_ENDPOINT_ID or ARK_ENDPOINT_ID.");
    }
  }

  async execute(input: AgentExecutionInput, callbacks?: AgentExecutionCallbacks): Promise<StageArtifact> {
    const role = input.stage.agentRole ?? "delivery_manager";
    const title = getAgentPromptProfile(role).title;
    const content = await this.requestChatCompletion(input, title, callbacks);

    if (!content) {
      throw new Error("Doubao response did not include message content.");
    }

    return parseArtifact(content, title);
  }

  private async requestChatCompletion(
    { pipeline, stage, previousArtifacts, codeContext }: AgentExecutionInput,
    title: string,
    callbacks?: AgentExecutionCallbacks
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.doubao.timeoutMs);

    try {
      const response = await fetch(`${this.config.doubao.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.doubao.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.config.doubao.model,
          stream: true,
          temperature: this.config.doubao.temperature,
          max_tokens: this.config.doubao.maxTokens,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(stage)
            },
            {
              role: "user",
              content: buildAgentPrompt(pipeline, stage, previousArtifacts, title, codeContext)
            }
          ]
        })
      });

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        throw new Error(payload.error?.message ?? `Doubao request failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        const payload = (await response.json().catch(() => ({}))) as DoubaoChatCompletionResponse;
        return payload.choices?.[0]?.message?.content?.trim() ?? "";
      }

      return readStreamingContent(response.body, callbacks);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Doubao request timed out after ${this.config.doubao.timeoutMs}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readErrorPayload(response: Response): Promise<DoubaoChatCompletionResponse> {
  const text = await response.text().catch(() => "");

  try {
    return JSON.parse(text) as DoubaoChatCompletionResponse;
  } catch {
    return {
      error: {
        message: text
      }
    };
  }
}

async function readStreamingContent(
  body: ReadableStream<Uint8Array>,
  callbacks?: AgentExecutionCallbacks
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let lineBreakIndex = buffer.indexOf("\n");
      while (lineBreakIndex >= 0) {
        const line = buffer.slice(0, lineBreakIndex).trim();
        buffer = buffer.slice(lineBreakIndex + 1);

        const delta = parseStreamingDelta(line);
        if (delta) {
          content += delta;
          await callbacks?.onStream?.({ delta, content });
        }

        lineBreakIndex = buffer.indexOf("\n");
      }
    }

    const tail = decoder.decode();
    if (tail) {
      buffer += tail;
    }

    const delta = parseStreamingDelta(buffer.trim());
    if (delta) {
      content += delta;
      await callbacks?.onStream?.({ delta, content });
    }

    return content.trim();
  } finally {
    reader.releaseLock();
  }
}

function parseStreamingDelta(line: string): string {
  if (!line.startsWith("data:")) {
    return "";
  }

  const data = line.slice("data:".length).trim();

  if (!data || data === "[DONE]") {
    return "";
  }

  try {
    const parsed = JSON.parse(data) as DoubaoChatCompletionChunk;
    const choices = parsed.choices ?? [];
    return choices.map((choice) => choice.delta?.content ?? choice.message?.content ?? "").join("");
  } catch {
    return "";
  }
}

async function emitMockStream(markdown: string, callbacks?: AgentExecutionCallbacks): Promise<void> {
  if (!callbacks?.onStream) {
    return;
  }

  let content = "";
  const chunks = markdown.match(/[\s\S]{1,48}/g) ?? [];

  for (const chunk of chunks) {
    content += chunk;
    await callbacks.onStream({ delta: chunk, content });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function buildAgentPrompt(
  pipeline: PipelineRun,
  stage: PipelineStage,
  previousArtifacts: StageArtifact[],
  title: string,
  codeContext?: CodeContextSnapshot
): string {
  const previous = previousArtifacts
    .map((artifact, index) =>
      [
        `### 上游产物 ${index + 1}: ${artifact.title}`,
        `摘要：${artifact.summary}`,
        artifact.markdown
      ].join("\n")
    )
    .join("\n\n");

  return [
    `当前阶段：${stage.name} (${stage.id})`,
    `建议标题：${title}`,
    `目标仓库：${pipeline.targetRepoPath || "workspace/demo"}`,
    "",
    "原始需求：",
    pipeline.requirement,
    "",
    "上游上下文：",
    previous || "当前为第一个 Agent 阶段。",
    "",
    "代码库上下文：",
    formatCodeContextForPrompt(codeContext),
    "",
    "需求附件上下文：",
    formatRequirementAttachmentsForPrompt(pipeline),
    "",
    "本阶段启用 Skill：",
    formatSkillProfileList(resolveStageSkills(stage)),
    "",
    "输出要求：",
    ...getOutputRequirements(stage),
    "",
    "本角色必须覆盖：",
    ...getStageOutputChecklist(stage).map((item) => `- ${item}`)
  ].join("\n");
}

function getOutputRequirements(stage: PipelineStage): string[] {
  if (!stage.id.startsWith("code-generation")) {
    return [
      "- 直接输出 Markdown，不要输出 JSON。",
      "- 第一行使用一级标题。",
      "- 正文包含可执行建议、风险、验证方式。",
      "- 不要实际声称已经修改文件，除非输入上下文明确包含真实 diff 或执行结果。",
      "- 如果代码库上下文不足，请明确列出缺失路径，不要臆测文件内容。"
    ];
  }

  const scopeFiles = getCodeGenerationScopeFiles(stage);
  return [
    "- 只输出可写入文件块，不要输出代码变更计划、表格、风险说明、测试计划或额外解释。",
    "- 每个文件块必须是完整文件内容，必须闭合代码围栏；不要输出半截文件。",
    scopeFiles.length
      ? `- 当前子任务只允许输出这些 scope 文件：${scopeFiles.map((file) => `\`${file}\``).join("、")}。`
      : "- 只输出当前子任务 scope 需要的文件。",
    "- 文件块格式：",
    "  ### FILE: src/Home.tsx",
    "  ```tsx",
    "  // full file content",
    "  ```",
    "- 只输出当前阶段 scope 需要的文件；不要输出 `node_modules`、构建产物、绝对路径或目标仓库外路径。",
    "- 代码必须基于现有技术栈和已读取上下文，可运行、可编译、可测试。",
    "- 如果需求数据量很大，优先生成可运行 MVP：提取代表性数据和摘要说明，不要为了全量数据导致文件被截断。"
  ];
}

function getCodeGenerationScopeFiles(stage: PipelineStage): string[] {
  if (stage.id.endsWith("/data-model")) {
    return ["src/types.ts", "src/data/*.ts", "src/constants.ts"];
  }

  if (stage.id.endsWith("/ui-structure")) {
    return ["src/Home.tsx"];
  }

  if (stage.id.endsWith("/visual-style")) {
    return ["src/styles.css"];
  }

  if (stage.id.endsWith("/test-coverage")) {
    return ["src/Home.test.tsx"];
  }

  return [
    "src/types.ts",
    "src/data/*.ts",
    "src/Home.tsx",
    "src/styles.css",
    "src/Home.test.tsx"
  ];
}

function formatCodeContextSummary(codeContext?: CodeContextSnapshot): string {
  if (!codeContext) {
    return "- 未收集代码库上下文。";
  }

  return [
    `- 目标仓库：${codeContext.targetRepoPath}`,
    `- 目录项：${codeContext.tree.length}`,
    `- 已读取文件：${codeContext.files.map((file) => file.path).join(", ") || "无"}`,
    `- 跳过项：${codeContext.skipped.length}`,
    `- 上下文预算：${codeContext.budget.usedBytes}/${codeContext.budget.maxTotalBytes} bytes`
  ].join("\n");
}

function formatCodeContextForPrompt(codeContext?: CodeContextSnapshot): string {
  if (!codeContext) {
    return "未收集代码库上下文。";
  }

  const tree = codeContext.tree
    .slice(0, 80)
    .map((entry) => `- ${entry.kind === "directory" ? "dir" : "file"} ${entry.path}`)
    .join("\n");
  const files = codeContext.files
    .map((file) =>
      [
        `--- BEGIN FILE ${file.path} (${file.sizeBytes} bytes${file.truncated ? ", truncated" : ""}) ---`,
        file.content,
        `--- END FILE ${file.path} ---`
      ].join("\n")
    )
    .join("\n\n");
  const skipped = codeContext.skipped
    .map((item) => `- ${item.path}: ${item.reason}`)
    .join("\n");

  return [
    `目标仓库：${codeContext.targetRepoPath}`,
    `收集时间：${codeContext.collectedAt}`,
    `预算：${codeContext.budget.usedBytes}/${codeContext.budget.maxTotalBytes} bytes`,
    "",
    "目录树摘要：",
    tree || "无目录树信息。",
    "",
    "已读取文件内容：",
    files || "未读取任何文件内容。",
    "",
    "跳过或缺失项：",
    skipped || "无。"
  ].join("\n");
}

function formatRequirementAttachmentsSummary(pipeline: PipelineRun): string {
  const attachments = pipeline.requirementAttachments ?? [];

  if (attachments.length === 0) {
    return "- 未上传需求附件。";
  }

  return attachments
    .map((attachment) => {
      const status = attachment.skippedReason ? `解析跳过：${attachment.skippedReason}` : attachment.summary;
      return `- ${attachment.fileName} (${attachment.mimeType}, ${attachment.sizeBytes} bytes): ${status}`;
    })
    .join("\n");
}

function formatRequirementAttachmentsForPrompt(pipeline: PipelineRun): string {
  const attachments = pipeline.requirementAttachments ?? [];

  if (attachments.length === 0) {
    return "未上传需求附件。";
  }

  return attachments
    .map((attachment) =>
      [
        `--- BEGIN ATTACHMENT ${attachment.fileName} (${attachment.mimeType}, ${attachment.sizeBytes} bytes${attachment.truncated ? ", truncated" : ""}) ---`,
        attachment.skippedReason ? `解析状态：${attachment.skippedReason}` : attachment.extractedText,
        `--- END ATTACHMENT ${attachment.fileName} ---`
      ].join("\n")
    )
    .join("\n\n");
}

function buildSystemPrompt(stage: PipelineStage): string {
  const role = stage.agentRole ?? "delivery_manager";
  const profile = getAgentPromptProfile(role);
  const skills = resolveStageSkills(stage);

  return [
    profile.systemPrompt,
    "",
    "启用 Skill：",
    formatSkillProfileList(skills),
    "",
    "通用约束：",
    "- 使用中文输出。",
    stage.id.startsWith("code-generation")
      ? "- 只输出 FILE 文件块，不要输出代码变更计划、表格或解释性段落。"
      : "- 直接输出 Markdown，不要输出 JSON。",
    stage.id.startsWith("code-generation")
      ? "- 代码生成阶段允许且必须输出 FILE 文件块中的 Markdown 代码围栏。"
      : "- 不要输出 Markdown 代码围栏。",
    stage.id.startsWith("code-generation")
      ? "- 第一行必须是 `### FILE: path`。"
      : "- 第一行使用一级标题。",
    "- 明确区分事实、推断、假设和待确认事项。",
    "- 只按启用 Skill 所描述的职责组织输出，不要声称调用了未提供的外部工具。",
    "- 如果没有真实文件 diff、命令输出或执行日志，不要声称已经完成代码修改或测试通过。"
  ].join("\n");
}

function resolveStageSkills(stage: PipelineStage): AgentSkill[] {
  const role = stage.agentRole ?? "delivery_manager";
  return stage.skills?.length ? stage.skills : getDefaultSkillsForRole(role);
}

function formatSkillProfileList(skills: AgentSkill[]): string {
  if (skills.length === 0) {
    return "- 未配置专用 Skill。";
  }

  return skills
    .map((skill) => {
      const profile = getAgentSkillProfile(skill);
      return `- ${profile.name} (\`${profile.id}\`): ${profile.description}`;
    })
    .join("\n");
}

function getStageChecklist(stage: PipelineStage): string[] {
  const role = stage.agentRole ?? "delivery_manager";
  return getAgentPromptProfile(role).outputChecklist;
}

function getStageOutputChecklist(stage: PipelineStage): string[] {
  if (!stage.id.startsWith("code-generation")) {
    return getStageChecklist(stage);
  }

  if (stage.id.endsWith("/data-model")) {
    return [
      "输出 `src/types.ts` 和必要的 `src/data/*.ts` 完整文件内容。",
      "结构化数据必须能被 `src/Home.tsx` 直接导入使用，字段名与类型一致。",
      "如果原始数据很长，可以输出代表性数据和明确的数据位，不要让文件块截断。"
    ];
  }

  if (stage.id.endsWith("/ui-structure")) {
    return [
      "输出 `src/Home.tsx` 的完整文件内容。",
      "组件必须导入并调用 `useDevflowPreviewBridge()`。",
      "主要可交互/可评审区域必须带 `data-devflow-id` 和 `data-devflow-file`。"
    ];
  }

  if (stage.id.endsWith("/visual-style")) {
    return [
      "输出 `src/styles.css` 的完整文件内容。",
      "样式必须适配桌面和移动端。",
      "必须包含 `.devflowSelectMode` 与 `.devflowSelectableHover`，保证预览选中交互可见。"
    ];
  }

  if (stage.id.endsWith("/test-coverage")) {
    return [
      "输出 `src/Home.test.tsx` 的完整文件内容。",
      "测试必须验证页面核心标题、关键内容和至少一个交互/状态文本。",
      "不要输出测试计划，只输出测试文件。"
    ];
  }

  return [
    "输出目标仓库可直接写入的完整文件内容。",
    "不要输出计划、表格或解释。"
  ];
}

function parseArtifact(content: string, fallbackTitle: string): StageArtifact {
  const jsonText = stripJsonFence(content);

  try {
    const parsed = JSON.parse(jsonText) as Partial<StageArtifact>;

    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : fallbackTitle,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : "豆包已生成阶段产物。",
      markdown:
        typeof parsed.markdown === "string" && parsed.markdown.trim()
          ? parsed.markdown.trim()
          : content,
      createdAt: new Date().toISOString()
    };
  } catch {
    const markdown = content.trim();
    const inferredTitle = inferTitle(markdown, fallbackTitle);

    return {
      title: inferredTitle,
      summary: inferSummary(markdown),
      markdown,
      createdAt: new Date().toISOString()
    };
  }
}

function inferTitle(markdown: string, fallbackTitle: string): string {
  const firstHeading = markdown.split(/\r?\n/).find((line) => line.trim().startsWith("#"));
  return firstHeading?.replace(/^#+\s*/, "").trim() || fallbackTitle;
}

function inferSummary(markdown: string): string {
  const firstContentLine = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith("---"));

  if (!firstContentLine) {
    return "豆包已生成阶段产物。";
  }

  return firstContentLine.length > 80 ? `${firstContentLine.slice(0, 80)}...` : firstContentLine;
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function buildSummary(role: AgentRole, requirement: string): string {
  const compactRequirement = requirement.length > 48 ? `${requirement.slice(0, 48)}...` : requirement;
  const summaries: Record<AgentRole, string> = {
    requirements_analyst: `已将需求拆解为目标、约束和验收标准：${compactRequirement}`,
    solution_architect: "已生成实现方案、影响范围和接口/文件变更计划。",
    coder: "已生成可执行的代码修改计划和 diff 摘要。",
    test_engineer: "已生成测试用例建议，并模拟完成基础回归。",
    reviewer: "已完成正确性、安全性、可维护性维度评审。",
    delivery_manager: "已汇总最终变更、验证结果和交付说明。"
  };

  return summaries[role];
}

function compactRequirement(requirement: string): string {
  const normalized = requirement.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMarkdown(role: AgentRole, pipeline: PipelineRun): string {
  switch (role) {
    case "requirements_analyst":
      return [
        "- 目标：将自然语言需求转成可实现、可验证的研发任务。",
        "- 用户价值：降低需求传递损耗，让后续 Agent 获得稳定输入。",
        "- 验收标准：功能可演示、状态可观测、关键节点可人工审批。"
      ].join("\n");
    case "solution_architect":
      return [
        "- 架构：前端控制台 + API 服务 + Pipeline 状态机 + Agent Provider。",
        "- 影响范围：`apps/web`、`apps/api`、`packages/shared`、`workspace/demo`。",
        "- 风险控制：方案审批检查点阻止未经确认的代码生成。"
      ].join("\n");
    case "coder":
      return [
        "- 计划修改：根据需求生成目标页面、样式和基础测试。",
        "- Diff 摘要：以下 FILE 块可由 workspace 写入器直接落地。",
        `- 目标仓库：${pipeline.targetRepoPath || "workspace/demo"}。`,
        "",
        "### FILE: src/Home.tsx",
        "```tsx",
        'import React from "react";',
        "",
        "export function Home() {",
        "  return (",
        '    <main className="generatedPage">',
        '      <p className="eyebrow">AI Generated Page</p>',
        `      <h1>${escapeHtml(compactRequirement(pipeline.requirement))}</h1>`,
        "      <p>这是 Mock Agent 根据需求生成的通用页面。切换到真实 LLM 后会生成更完整的业务页面。</p>",
        "    </main>",
        "  );",
        "}",
        "```",
        "",
        "### FILE: src/styles.css",
        "```css",
        ".generatedPage {",
        "  width: min(960px, calc(100% - 32px));",
        "  margin: 0 auto;",
        "  padding: 64px 0;",
        '  font-family: "Segoe UI", sans-serif;',
        "}",
        ".eyebrow {",
        "  color: #197663;",
        "  font-weight: 800;",
        "}",
        "```"
      ].join("\n");
    case "test_engineer":
      return [
        "- 单元测试：覆盖状态流转、Approve、Reject 回退。",
        "- 集成测试：覆盖创建 Pipeline 到最终交付主路径。",
        "- 当前结果：Mock 环境下通过。"
      ].join("\n");
    case "reviewer":
      return [
        "- 正确性：阶段依赖和检查点流转符合预期。",
        "- 安全性：真实 LLM 写文件前仍需引入沙箱和 diff 审批。",
        "- 可维护性：Agent Provider 已解耦，后续可接多个模型。"
      ].join("\n");
    case "delivery_manager":
      return [
        "- 交付内容：Pipeline 运行记录、阶段产物、测试摘要、评审摘要。",
        "- 建议 MR 描述：说明需求、方案、关键 diff、验证方式。",
        "- 下一步：接入 Git 分支和 MR 创建。"
      ].join("\n");
    default:
      return "- 暂无该角色的 Mock 产物模板。";
  }
}
