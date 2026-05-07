# DevFlow Engine 初赛项目报告

## 一、项目概述

DevFlow Engine 是一个面向软件研发场景的 AI Agent Pipeline 引擎。项目目标不是做一个单点式 AI 聊天助手，而是把真实研发中的“需求输入 -> 方案设计 -> 人工审批 -> 代码生成 -> 测试 -> 代码评审 -> 最终确认 -> 交付总结”组织成可观测、可审批、可回退、可扩展的自动化流程。

项目当前采用 Monorepo 结构，包含后端 API、前端控制台、共享类型包和可被 AI 修改的目标 Demo 仓库：

- `apps/api`：REST API、Pipeline 状态机、Agent 编排、LLM Provider、Swagger 文档。
- `apps/web`：React 控制台，用于输入需求、上传附件、观察阶段流转、人工审批、预览反馈。
- `packages/shared`：前后端共享 DTO、状态枚举、Agent Skill 类型。
- `workspace/demo`：目标代码库，作为 AI 生成代码和预览校验的实际落地点。

一句话总结：DevFlow Engine 将 AI 从“单次问答工具”升级为“可落地的软件研发流程执行系统”，让 AI 能在受控边界内参与需求分析、方案设计、并行子任务执行、代码生成、测试与评审，同时保留 Human-in-the-Loop 的关键决策权。

## 二、评分维度对照

| 评分维度 | 项目体现 |
| --- | --- |
| 完整性与价值（50%） | 覆盖需求输入、附件上传、代码库上下文读取、方案设计、两个人工检查点、代码生成、测试、评审、交付和预览反馈，形成端到端闭环。 |
| 创新性（25%） | 引入 Agent Skill Profile、阶段内真并行子任务、受控 workspace 写入、预览界面元素选中 + 自然语言微调、需求附件注入 Prompt。 |
| 技术实现性（25%） | Fastify + React + TypeScript + Swagger + Zod + LLM Provider 抽象 + Pipeline 状态机 + 上下文预算控制 + 自动化测试与构建验证。 |

## 三、维度 1：完整性与价值（50%）

### 1. 解决的问题 / 痛点

传统研发流程中，AI 通常被作为“问答助手”使用，开发者需要手动把需求复制给模型、判断模型输出、修改代码、补测试、写评审说明。这种方式存在几个典型问题：

- 需求输入不结构化，AI 容易忽略约束、验收标准和边界条件。
- 生成内容缺少流程管理，无法清楚追踪“哪个阶段基于什么上下文产出了什么结果”。
- AI 不一定能看到代码库上下文，容易生成和现有工程不匹配的方案。
- 代码生成、测试、评审、交付之间断裂，需要开发者手动串联。
- 全自动生成风险高，但完全人工审核又降低效率。
- UI 结果需要预览后反复修改，传统流程中“看到问题 -> 找文件 -> 改样式”成本较高。

DevFlow Engine 针对这些痛点，把软件交付拆成可管理的 Pipeline，让每个阶段都有明确角色、输入、输出、状态和产物。AI 不再只是给建议，而是在状态机和人类审批约束下参与完整研发流程。

### 2. AI 在其中起到的关键作用

AI 在项目中承担“专业角色 Agent”的职责，而不是一个泛化助手：

- 需求分析 Agent：把自然语言需求和附件内容转为目标、范围、约束、验收标准。
- 方案设计 Agent：基于需求、代码库上下文和上游产物生成技术方案、影响范围、回滚策略。
- 代码生成 Agent：按文件 scope 生成可写入的 `### FILE:` 文件块，由系统统一写入目标 workspace。
- 测试工程 Agent：给出测试策略、主路径、边界条件和验证命令。
- 代码评审 Agent：从正确性、安全性、可维护性、测试充分性角度审查产物。
- 交付管理 Agent：汇总交付范围、验证情况、遗留风险和下一步。

系统层面通过 Prompt 工程、Agent Skill、上下文读取、输出契约和受控写入机制，把 AI 生成过程从“自由发挥”约束为“面向工程交付的可执行步骤”。

### 3. 流程是否完整闭环，能否落地使用

当前默认 Pipeline 已覆盖完整闭环：

1. 用户在控制台输入需求。
2. 用户可上传 PDF 或文本需求附件。
3. 后端解析附件文本并写入 `requirementAttachments`。
4. Agent 执行前读取目标仓库目录树和指定 `contextPaths`。
5. 需求分析阶段输出结构化需求。
6. 方案设计阶段输出技术方案，并可拆分并行子任务。
7. `design-approval` 人工检查点暂停，用户可 Approve 或 Reject。
8. Reject 会携带理由回退到方案设计阶段重做。
9. 代码生成阶段拆成数据模型、组件结构、视觉样式、测试补充等互不重叠 scope 的并行子任务。
10. 子任务完成后统一写入 `workspace/demo`，避免并发写冲突。
11. 测试生成、代码评审阶段继续执行。
12. `release-approval` 最终人工检查点暂停。
13. 用户可在预览界面选中元素，用自然语言要求微调。
14. 系统写回受控 CSS refinement，并记录 `preview_refined` 事件。
15. 最终 Approve 后进入交付总结。

这条链路已经具备落地使用的关键形态：可启动、可暂停、可恢复、可驳回、可写入真实工作区、可观察阶段产物、可进行人工预览反馈。

### 4. Demo 是否稳定、可正常演示

项目提供三端联动 Demo：

- API 服务：`http://localhost:4000`
- Swagger 文档：`http://localhost:4000/docs`
- Web 控制台：`http://localhost:5173`
- Demo 预览：`http://127.0.0.1:5174`

推荐启动命令：

```powershell
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev:web
npm.cmd --prefix workspace/demo run dev
```

当前验证命令：

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run build:demo
```

当前自动化验证覆盖：

- API Pipeline 测试：15 个用例，覆盖持久化、两个人工检查点、Reject 回退、重试上限、真实 workspace diff、上下文读取、预览反馈、删除/隐藏反馈、并行子任务、附件解析、文件块写入和兜底预览写入。
- Demo 页面测试：覆盖页面基础结构、旧附件错误提示移除、世界杯 104 场数据、欧冠核心数据、数据来源说明、文本选择能力等。
- TypeScript 类型检查覆盖共享包、API、Web。
- Demo 目标应用支持独立构建验证。

### 5. 带来的实际价值 / 效率提升

项目带来的价值主要体现在四个层面：

1. 降低需求到实现的断点损耗  
   需求、方案、代码、测试、评审、交付都留在同一条 Pipeline 中，上下游产物可追踪。

2. 降低 AI 生成的不确定性  
   每个 Agent 有角色、Skill、上下文和输出契约；代码生成必须输出完整文件块，不能只输出泛泛计划。

3. 提高复杂任务执行效率  
   `solution-design` 和 `code-generation` 阶段支持真正并发执行子任务。代码生成阶段进一步拆出 `data-model`、`ui-structure`、`visual-style`、`test-coverage`，减少串行等待。

4. 缩短 UI 验收反馈链路  
   用户不需要手动定位 CSS 文件，可以在预览界面直接选择元素并用自然语言给出修改要求。

可量化成果：

- 8 个默认 Pipeline 阶段。
- 2 个 Human-in-the-Loop 检查点。
- 10 个 Agent Skill。
- 4 个代码生成并行子任务。
- 8 个核心 REST API 端点。
- 支持最多 5 个需求附件，单文件最大 5MB。
- 代码上下文总预算约 80KB，单文件约 20KB，避免 Prompt 失控。
- 当前 API 测试 15 个用例通过。

## 四、维度 2：创新性（25%）

### 1. AI 相关创新点

#### 1.1 Agent Skill Profile

项目没有只用“角色”描述 Agent，而是在角色之上引入 Skill Profile。角色决定“谁来做”，Skill 决定“这次启用哪些能力”。

当前 Skill 包括：

- `requirement_structuring`：需求结构化。
- `code_context_reading`：代码库上下文读取。
- `solution_decomposition`：方案拆解。
- `parallel_task_planning`：并行子任务规划。
- `diff_planning`：Diff 规划。
- `workspace_editing`：工作区写入。
- `test_strategy`：测试策略。
- `risk_review`：风险评审。
- `preview_refinement`：预览反馈微调。
- `delivery_summary`：交付摘要。

Skill 会同时进入类型定义、阶段 DTO、事件详情、Prompt 和前端展示，让 AI 能力具有可解释性和可扩展性。

#### 1.2 阶段内真并行 Agent 执行

复杂阶段不是只生成一个大 Prompt，而是拆成多个互不重叠 scope 的子任务，并通过 `Promise.all` 并发调用对应 Agent。

方案设计阶段可以并行拆成：

- 架构方案。
- 风险与评审关注点。
- 测试策略。

代码生成阶段可以并行拆成：

- 数据模型与内容实现。
- 组件结构实现。
- 视觉样式实现。
- 测试用例补充。

这种设计既利用并行提升效率，又通过“统一写入 workspace”避免并发写文件冲突。

#### 1.3 需求附件 + 代码库上下文双注入

项目把 AI Prompt 的上下文来源分成两类：

- 需求附件上下文：PDF、Markdown、JSON、CSV、代码文件等输入材料。
- 代码库上下文：目标仓库目录树、指定文件、上游产物中提到的路径。

这比只把用户一句话发给模型更接近真实研发场景。

#### 1.4 预览驱动自然语言微调

人在最终评审阶段可以在 iframe 预览中选择具体 DOM 元素。目标应用通过 `data-devflow-id` 标记元素，通过 `postMessage` 把元素 ID、文件、文本、边界框传给控制台。用户再输入自然语言反馈，后端写入受控 CSS refinement。

这让 UI 反馈从“抽象描述”变成“绑定具体元素的可执行修改”。

### 2. 方案差异化亮点

DevFlow Engine 与普通 AI 编程助手的差异：

- 普通 AI 编程助手偏单轮对话，本项目是多阶段 Pipeline。
- 普通助手输出不稳定，本项目有 Agent 角色、Skill、输出契约和状态机。
- 普通助手难以处理人工审批，本项目支持两个人工检查点和 Reject 回退。
- 普通助手通常只返回文本，本项目能写入真实 workspace 并生成 diff。
- 普通助手很难直接处理预览反馈，本项目支持选中页面元素后自然语言微调。
- 普通助手难以并行，本项目在方案和代码阶段支持阶段内并行子 Agent。

### 3. 可复用、可推广性

该架构可以推广到多种研发任务：

- 新功能开发。
- Bug 修复。
- UI 改版。
- 测试补全。
- 代码评审预检查。
- PR / MR 描述生成。
- 企业内部审批流。
- 飞书 / Slack / Teams 等协作平台通知。
- 多模型协作编排。

复用方式也比较清晰：保留 Pipeline 状态机和 Agent Provider 抽象，根据业务替换默认阶段、Agent Prompt、Skill 映射和 workspace 写入策略即可。

## 五、维度 3：技术实现性（25%）

### 1. AI 技术使用深度

项目使用的 AI 技术不止是简单 API 调用，而包含完整 AI 工程化链路：

- 多角色 Agent：需求分析、方案设计、代码生成、测试、评审、交付。
- System Prompt 分层：每个角色有独立系统提示和输出检查清单。
- Skill 注入：Prompt 中展示当前启用 Skill 的名称和能力描述。
- 上下文工程：注入上游产物、代码库上下文、附件文本。
- 输出契约：代码生成阶段必须输出完整 `### FILE:` 文件块。
- 流式输出：真实 LLM Provider 支持读取 streaming response 并更新阶段 stream。
- 并行编排：通过子任务并发调用多个 Agent。
- 受控落地：模型输出不是直接无约束执行，而是经过路径校验、安全过滤和统一写入。
- 反馈闭环：人工 Reject 和预览反馈都能进入后续执行链路。

### 2. 技术架构合理性

架构分层如下：

```text
用户 / 评审者
  -> React 控制台 apps/web
  -> Fastify API apps/api
  -> PipelineRunner 状态机
  -> AgentProvider / CodeContextService / WorkspaceChangeService
  -> workspace/demo 目标代码库
```

关键设计：

- `PipelineRunner` 负责流程生命周期和状态流转。
- `AgentProvider` 负责屏蔽模型差异，支持 Mock 与豆包 / 火山方舟。
- `CodeContextService` 负责受控读取代码库上下文。
- `WorkspaceChangeService` 负责解析模型文件块、写入 workspace、生成 diff、处理预览微调。
- `packages/shared` 保证前后端状态类型一致。
- Swagger UI 提供 API 文档能力。

### 3. 工程规范、稳定性、可扩展性

工程规范：

- 全栈 TypeScript。
- API 请求体使用 Zod 校验。
- Fastify Swagger 自动提供 API 文档。
- Monorepo workspaces 管理 API、Web、Shared 包。
- 自动化测试覆盖主流程和关键边界。
- workspace 写入前做路径安全校验，避免越界写入。
- 代码上下文读取跳过 `.git`、`node_modules`、`dist`、`build` 等目录。

稳定性：

- Mock Provider 可保证离线演示和测试稳定。
- 真实 LLM Provider 可通过环境变量切换。
- 当模型输出不完整文件块时，系统有安全预览兜底写入策略。
- `localhost` 预览在 Windows 上可能命中 IPv6 旧进程，项目默认使用 `127.0.0.1:5174` 减少演示不确定性。

可扩展性：

- Agent Provider 可继续接入 OpenAI、Claude、本地模型或企业私有模型。
- Pipeline 阶段可以扩展为 Git 分支创建、PR 提交、CI 验证、部署发布。
- Preview Refinement 可升级为 LLM patch 生成 + diff 审批。
- Code Context 可升级为语义索引、符号检索、依赖图分析。
- 通知层可接入飞书群机器人或审批卡片。

## 六、核心部分代码展示

### 1. Pipeline 状态机与检查点

核心文件：`apps/api/src/domain/pipelineRunner.ts`

代码体现：

```ts
if (nextStage.kind === "checkpoint") {
  pipeline = this.store.save({
    ...pipeline,
    status: "waiting_for_human",
    currentStageId: nextStage.id,
    stages: updateStage(pipeline.stages, nextStage.id, {
      status: "waiting_for_human",
      startedAt: nextStage.startedAt ?? now
    })
  });
  await this.safeNotify(() => this.notifier.checkpointWaiting(pipeline, nextStage));
  return;
}
```

说明：

- 当执行到人工检查点时，Pipeline 状态变为 `waiting_for_human`。
- 系统不会继续自动执行后续阶段，直到用户 Approve 或 Reject。
- 这保证了方案设计和最终交付阶段的人类控制权。

### 2. Reject 回退机制

核心文件：`apps/api/src/domain/pipelineRunner.ts`

代码体现：

```ts
const rollbackStageId = checkpoint.dependsOn?.[0];
const rollbackIndex = pipeline.stages.findIndex((stage) => stage.id === rollbackStageId);

const stages = pipeline.stages.map((stage, index) => {
  if (rollbackIndex >= 0 && index >= rollbackIndex) {
    return resetStageForRetry(stage, index === rollbackIndex);
  }
  return stage;
});
```

说明：

- Reject 不是简单失败，而是回退到检查点依赖的上一阶段。
- Reject 理由会进入事件流和后续上下文，让 AI 可以基于人类反馈重新生成。

### 3. 阶段内并行子任务

核心文件：`apps/api/src/domain/pipelineRunner.ts`

代码体现：

```ts
const completedSubTasks = await Promise.all(
  runningSubTasks.map(async (subTask) => {
    const syntheticStage: PipelineStage = {
      ...stage,
      id: `${stage.id}/${subTask.id}`,
      name: subTask.title,
      agentRole: subTask.agentRole,
      skills: subTask.skills
    };

    return this.agentProvider.execute({
      pipeline: this.requirePipeline(pipeline.id),
      stage: syntheticStage,
      previousArtifacts,
      codeContext
    });
  })
);
```

说明：

- 这里是真并发执行，不是只在文案上“拆任务”。
- 每个子任务拥有独立 `id`、`title`、`agentRole`、`skills`、`scope`。
- 子任务完成后再汇总产物并统一写入 workspace。

### 4. 代码生成阶段的子任务规划

核心文件：`apps/api/src/domain/pipelineRunner.ts`

代码体现：

```ts
stage.id === "code-generation"
  ? [
      {
        id: "data-model",
        title: "数据模型与内容实现",
        scope: ["src/types.ts", "src/data/*.ts", "src/constants.ts"]
      },
      {
        id: "ui-structure",
        title: "组件结构实现",
        scope: ["src/Home.tsx"]
      },
      {
        id: "visual-style",
        title: "视觉样式实现",
        scope: ["src/styles.css"]
      },
      {
        id: "test-coverage",
        title: "测试用例补充",
        scope: ["src/Home.test.tsx"]
      }
    ]
  : [];
```

说明：

- 当前设计把数据、UI、样式、测试拆成互不重叠写入范围。
- 这解决了复杂需求中“UI 引用了数据模块，但数据模块没生成”的实际问题。

### 5. LLM Provider 与流式输出

核心文件：`apps/api/src/agents/agentProvider.ts`

代码体现：

```ts
body: JSON.stringify({
  model: this.config.doubao.model,
  stream: true,
  temperature: this.config.doubao.temperature,
  max_tokens: this.config.doubao.maxTokens,
  messages: [
    { role: "system", content: buildSystemPrompt(stage) },
    { role: "user", content: buildAgentPrompt(pipeline, stage, previousArtifacts, title, codeContext) }
  ]
})
```

说明：

- 模型 Provider 与 Pipeline 状态机解耦。
- 可以通过环境变量切换 Mock 或豆包 / 火山方舟。
- 流式输出会进入阶段 stream，前端可以看到 Agent 生成过程。

### 6. Prompt 构造：上游产物 + 代码上下文 + 附件 + Skill

核心文件：`apps/api/src/agents/agentProvider.ts`

代码体现：

```ts
return [
  `当前阶段：${stage.name} (${stage.id})`,
  `目标仓库：${pipeline.targetRepoPath || "workspace/demo"}`,
  "原始需求：",
  pipeline.requirement,
  "上游上下文：",
  previous || "当前为第一个 Agent 阶段。",
  "代码库上下文：",
  formatCodeContextForPrompt(codeContext),
  "需求附件上下文：",
  formatRequirementAttachmentsForPrompt(pipeline),
  "本阶段启用 Skill：",
  formatSkillProfileList(resolveStageSkills(stage))
].join("\n");
```

说明：

- Agent 的输入不是单一需求文本，而是多源上下文。
- 这让模型更容易生成贴合现有工程的产物。

### 7. 代码库上下文读取

核心文件：`apps/api/src/domain/codeContextService.ts`

代码体现：

```ts
const requestedPaths = buildContextPathCandidates(pipeline, stage, previousArtifacts);
const files: CodeContextFile[] = [];

for (const path of requestedPaths) {
  if (files.length >= DEFAULT_CONTEXT_BUDGET.maxFiles) {
    skipped.push({ path, reason: "已达到上下文文件数量上限。" });
    continue;
  }

  const result = await readContextFile(targetDirectory, path, DEFAULT_CONTEXT_BUDGET, usedBytes);
}
```

说明：

- 上下文读取有预算约束，避免 Prompt 过长。
- 系统只读取目标 workspace 内的文本文件，跳过二进制和构建产物。

### 8. 需求附件解析

核心文件：`apps/api/src/domain/requirementAttachmentService.ts`

代码体现：

```ts
export async function parseRequirementAttachments(
  files: UploadedRequirementAttachment[]
): Promise<RequirementAttachment[]> {
  return Promise.all(files.map((file) => parseRequirementAttachment(file)));
}
```

说明：

- 多附件并发解析。
- PDF 和文本文件解析结果进入 Pipeline。
- 解析失败不会阻断流程，而是记录跳过原因。

### 9. 受控 workspace 写入

核心文件：`apps/api/src/domain/workspaceChangeService.ts`

代码体现：

```ts
let files = extractGeneratedFilesFromArtifact(pipeline, artifact);
const usedFallback = files.length === 0;

if (usedFallback) {
  files = buildDemoFeatureFiles(pipeline);
}

for (const file of files) {
  const absolutePath = resolve(targetDirectory, file.path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, file.content, "utf8");
}
```

说明：

- 模型输出必须是完整文件块才会被写入。
- 写入范围限制在目标 workspace 内。
- 如果模型输出不可安全写入，系统可生成安全预览兜底。

### 10. 预览元素选择与自然语言微调

核心文件：

- `workspace/demo/src/devflowPreviewBridge.ts`
- `apps/api/src/domain/workspaceChangeService.ts`

代码体现：

```ts
window.parent.postMessage(
  {
    type: "devflow:element-selected",
    element: {
      devflowId: target.dataset.devflowId ?? "",
      file: target.dataset.devflowFile,
      selector: `[data-devflow-id="${target.dataset.devflowId ?? ""}"]`,
      tagName: target.tagName.toLowerCase(),
      text: normalizeText(target.innerText)
    }
  },
  "*"
);
```

说明：

- 预览应用不需要和控制台强耦合，只通过 `postMessage` 传递轻量元素信息。
- 用户反馈会被转换成 CSS refinement 写回 `workspace/demo/src/styles.css`。

## 七、项目亮点介绍

本项目最大的亮点，是把 AI 从“单次聊天问答”推进到了“可执行的研发流程”。传统 AI 编程辅助往往停留在开发者向模型提问、复制回答、再手动整理代码和测试的模式中，过程不连续、产物不可追踪，也很难保证每一步都符合工程约束。DevFlow Engine 则把一次研发任务拆成需求分析、方案设计、人工审批、代码生成、测试、代码评审、最终确认和交付总结等阶段，让 AI 按照真实软件交付流程工作。每个阶段都有明确的输入、输出、状态、事件、耗时、产物和依赖关系，用户可以清楚看到当前任务运行到哪里、由哪个 Agent 负责、使用了哪些 Skill、生成了什么结果，以及下一步是否需要人工介入。

项目在自动化和可控性之间做了平衡，没有追求“完全自动写代码上线”，而是在方案设计和最终评审两个关键节点引入 Human-in-the-Loop 检查点。方案设计阶段完成后，系统会暂停等待人工审批；如果方案不满足预期，用户可以 Reject 并填写驳回原因，Pipeline 会携带该原因回退到上游阶段重做。最终评审阶段同样需要人工确认，避免未经审核的生成结果直接进入交付。这样的设计既发挥了 AI 在分析、生成和总结上的效率优势，也把高风险判断保留给人类，适合更真实的研发协作场景。

在复杂任务处理方面，项目支持阶段内并行子 Agent。对于方案设计和代码生成这类容易变大的阶段，系统不会让一个 Agent 独自完成所有内容，而是拆成多个互不重叠 scope 的子任务并发执行。例如代码生成阶段会拆成数据模型与内容实现、组件结构实现、视觉样式实现、测试用例补充等子任务，分别处理 `src/types.ts`、`src/data/*.ts`、`src/Home.tsx`、`src/styles.css`、`src/Home.test.tsx` 等不同文件范围。这样既能减少单个模型输出过长导致截断或混乱的风险，也能避免多个任务同时修改同一文件带来的冲突。所有子任务完成后，系统再统一汇总产物并写入目标 workspace，使并行提效和工程安全可以同时成立。

另一个重要亮点是上下文能力。项目不仅支持用户输入自然语言需求，也支持上传 PDF、Markdown、JSON、CSV、代码文件等需求附件。后端会解析附件文本，并把提取结果作为“需求附件上下文”注入 Agent Prompt。同时，系统还会在 Agent 执行前读取目标仓库目录树和用户指定的 `contextPaths`，例如页面入口文件、样式文件、测试文件和 `package.json`，让 Agent 能够理解当前代码库结构，而不是凭空生成方案。通过附件上下文和代码库上下文的双注入，AI 更容易生成贴合真实需求和现有工程的产物。

项目还把预览反馈纳入了研发闭环。UI 类任务中，很多问题不是单纯的代码正确性问题，而是人眼看到后的布局、视觉、密度、层级和主观偏好问题。DevFlow Engine 在控制台中嵌入目标应用预览，并在目标页面中通过 `data-devflow-id` 标记可选元素。用户可以直接在预览界面选中某个区域，再用自然语言提出“这个区域更紧凑一些”“隐藏这个提示”“标题更醒目”等反馈。系统会把选中元素的信息和反馈指令传给后端，并写回受控的 CSS refinement。这让 UI 修改从“看到问题后再去找文件手动修改”，变成了“选中元素、描述意图、系统写回调整”的低成本流程。

最后，项目的 Demo 目标不是一个静态展示页，而是一个真实的目标代码库 `workspace/demo`。代码生成阶段会把模型输出解析成可写入的完整文件块，并在受控范围内写入真实文件；预览服务会实时反映这些代码变化。因此，Demo 不是简单展示“AI 说它能做什么”，而是展示“AI 生成的结果确实进入了代码仓库，并在浏览器中产生可见效果”。这一点使项目在演示时更有说服力，也更接近真实工程落地。

## 八、AI 亮点介绍

DevFlow Engine 在 AI 工程化上使用了多种高阶技巧。首先是多 Agent 分工：系统不是用同一个 Prompt 处理所有任务，而是为需求分析、方案设计、代码生成、测试工程、代码评审和交付管理分别定义 Agent 角色，每个角色都有独立的 System Prompt、输出检查清单和职责边界。其次是 Agent Skill 化：项目在角色之外引入 Skill Profile，把需求结构化、代码库上下文读取、方案拆解、并行规划、Diff 规划、工作区写入、测试策略、风险评审、预览微调、交付摘要等能力模块化。角色决定“谁来做”，Skill 决定“这次用哪些能力做”，并且这些 Skill 会进入 Prompt、事件详情和前端展示，使 AI 执行过程更透明、更可解释。

在 Prompt 与上下文工程方面，项目不是简单把用户需求发给模型，而是把原始需求、需求附件文本、代码库目录树、指定文件内容、上游阶段产物、当前阶段 Skill、输出要求共同组织成 Agent Prompt。代码生成阶段还设置了严格的输出契约，要求模型输出完整的 `### FILE: path` 文件块，并闭合代码围栏，系统再从产物中解析文件、校验路径和内容安全，最后写入目标 workspace。这样的设计把模型输出从“自然语言建议”转成了“可自动处理的结构化工程产物”，降低了复制粘贴和人工整理成本。

项目也引入了并行 Agent 编排和受控执行机制。对于复杂阶段，PipelineRunner 会把任务拆分为多个子 Agent，并通过 `Promise.all` 并发执行。模型本身不直接拥有任意文件系统权限，而是由系统统一解析、过滤、校验和写入。这种设计既利用了 AI 的并行生成能力，又避免了生成内容直接越界修改文件的风险。结合 Human-in-the-Loop，项目形成了“AI 生成、系统约束、人类把关”的执行方式，而不是让模型完全自主行动。

在人和 AI 的分工上，项目采用的是协作式而非替代式设计。人类负责提出原始需求、上传需求资料、判断方案是否合理、在关键检查点 Approve 或 Reject、在预览界面进行主观质量判断，并最终确认交付。AI 负责把需求结构化、读取并理解代码上下文、设计实现方案、拆分复杂任务、生成代码文件块、设计测试策略、执行风险评审和汇总交付说明。系统则负责状态机控制、事件记录、并行调度、上下文预算、文件安全写入、API 文档、前端可视化和预览通信。三者分工明确：AI 提升产出效率，人类控制关键决策，系统负责约束边界和流程可靠性。

在模型选型方面，项目采用 Provider 抽象，而不是把某个模型写死在业务逻辑中。当前支持 Mock Provider 和 Doubao / 火山方舟 Provider。Mock Provider 主要用于无 API Key 场景、离线演示、自动化测试和比赛现场兜底，保证即使没有真实模型服务也能稳定展示完整流程；Doubao / 火山方舟 Provider 用于真实模型生成阶段产物，支持流式输出和运行时配置。模型切换通过环境变量完成，例如：

```powershell
$env:LLM_PROVIDER="doubao"
$env:DOUBAO_API_KEY="你的 API Key"
$env:DOUBAO_ENDPOINT_ID="你的 ep-... 接入点 ID"
$env:DOUBAO_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
```

这种设计的核心原则是流程引擎不绑定单一模型，Demo 稳定性优先，同时保留接入真实模型的能力。后续还可以扩展为按阶段选择不同模型，例如需求分析和交付总结使用低成本模型，代码生成和代码评审使用更强的模型，从而在效果、速度和成本之间做更精细的平衡。

引入 AI 后，原有软件研发工作流发生了明显变化。过去更常见的方式是“人工写需求 -> 问 AI -> 复制代码 -> 人工改 -> 人工测 -> 人工写总结”，AI 的输出往往分散在聊天记录中，缺少阶段状态和工程约束。DevFlow Engine 则把流程改造成“输入需求 / 附件 -> AI 结构化需求 -> AI 方案设计 -> 人工审批 -> AI 并行生成数据 / UI / 样式 / 测试 -> 系统写入 workspace -> AI 测试与评审 -> 人工预览反馈 -> 系统微调 -> AI 交付总结”。在这个过程中，AI 产物从聊天内容变成阶段产物，AI 行为从自由回答变成受控工作流执行，人类反馈从口头补充变成可回退、可记录、可触发重做的流程事件，代码生成从复制粘贴变成受控文件块写入和 diff 展示，UI 验收也从“找问题再找文件”变成了“预览选中元素直接反馈”。这正是项目想体现的 AI 工程化落地价值。


## 九、可演示内容建议

建议初赛展示时按下面顺序演示：

1. 展示控制台首页：需求输入、附件上传、上下文路径。
2. 输入一个开发需求，选择 `workspace/demo` 作为目标仓库。
3. 启动 Pipeline，展示需求分析和方案设计阶段。
4. 在方案审批处点击 Reject，输入原因，展示回退重做。
5. 再次 Approve，进入代码生成阶段。
6. 展示 `code-generation` 的并行子任务：数据模型、组件结构、视觉样式、测试补充。
7. 展示代码生成阶段产物中的真实工作区变更和 diff。
8. 打开预览页面，展示目标应用已经变化。
9. 在预览面板选择元素，输入自然语言反馈并触发微调。
10. 展示最终评审和交付摘要。
11. 打开 Swagger，说明 API-First 架构。

## 十、当前边界与后续优化

当前边界：

- 真实模型生成效果受模型输出长度和 Prompt 遵循度影响，项目已通过文件块契约和安全兜底降低风险。
- 当前预览反馈主要覆盖受控 CSS 微调，复杂结构调整仍可继续升级。
- 当前状态存储是轻量持久化 / 内存实现，生产落地可替换数据库。
- PDF 解析以文本提取为主，扫描件 PDF 需要 OCR 或模型文档理解增强。

后续优化：

- 增加 OpenAI / Claude / 本地模型 Provider。
- 增加按阶段模型路由和成本统计。
- 将 workspace diff 升级为 Git 分支、Commit、PR / MR。
- 引入 CI 执行和测试报告回写。
- 建立代码语义索引，提高大型仓库上下文检索质量。
- 将预览反馈升级为 LLM patch 生成 + 人工 diff 审批。
- 接入飞书群机器人或审批卡片，实现企业协作闭环。

## 十一、总结

DevFlow Engine 的核心价值在于：它把 AI 能力嵌入真实研发流程，而不是停留在一次性问答层面。项目通过 Pipeline 状态机保证流程闭环，通过多角色 Agent 和 Skill Profile 实现专业分工，通过代码库上下文和需求附件提高模型理解质量，通过 Human-in-the-Loop 控制关键风险，通过并行子任务提升复杂任务效率，通过 workspace 受控写入和预览反馈把 AI 产物落到真实代码和可见效果上。

从初赛评分维度看，本项目既具备完整的端到端 Demo 和实际工程价值，也具备较明显的 AI 工程化创新点，同时在架构、类型、API、测试和可扩展性上有清晰实现基础。它可以作为“AI 驱动研发工作流平台”的 MVP，为后续接入真实模型、多仓库、多团队协作和企业审批流打下基础。
