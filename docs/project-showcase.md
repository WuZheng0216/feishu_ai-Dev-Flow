# DevFlow Engine 项目结果展示

## 评分维度对照摘要

| 评分维度 | 项目对应成果 |
| --- | --- |
| 完整性与价值（50%） | 覆盖需求输入、附件上传、方案设计、人工审批、代码生成、测试、评审、交付、预览反馈的完整闭环；支持真实 workspace diff 和可运行 Demo；通过自动化测试、类型检查和构建验证。 |
| 创新性（25%） | 将 AI 从单次问答升级为多阶段 Agent Pipeline；引入需求附件解析、Agent Skill Profile、代码库上下文注入、Human-in-the-Loop 回退重做、阶段内真并行子任务和预览驱动自然语言微调。 |
| 技术实现性（25%） | Fastify REST API + Swagger、React 控制台、共享类型包、Pipeline 状态机、LLM Provider 抽象、上下文预算控制、受控 workspace 写入、自动化测试和构建脚本。 |

## 1. Demo 展示

### 推荐展示方式

建议录制 3-5 分钟演示视频，或在答辩现场按以下流程直接演示：

1. 启动 API、Web 控制台和 Demo 目标应用。
2. 在控制台输入一条自然语言研发需求，可上传 PDF 或文本类需求附件。
3. 点击创建并启动 Pipeline。
4. 展示系统自动完成需求分析、方案设计，并在方案审批处暂停。
5. 点击 Reject，输入驳回理由，展示 Pipeline 回退到方案设计阶段重做。
6. 再次进入方案审批后点击 Approve。
7. 展示代码生成阶段的并行子任务、Agent Skill 标签、真实 workspace diff。
8. 展示测试生成、代码评审、最终评审检查点。
9. 在预览面板中选中页面元素，输入自然语言反馈，触发受控 UI 微调。
10. 点击最终 Approve，展示交付摘要和 completed 状态。

启动命令：

```powershell
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev:web
npm.cmd --prefix workspace/demo run dev
```

访问地址：

- Web 控制台：http://localhost:5173
- API Swagger：http://localhost:4000/docs
- Demo Preview：http://127.0.0.1:5174

推荐演示需求：

```text
请为演示站点首页增加一个“比赛亮点”区域，包含三个卡片：AI Pipeline、Human Review、自动交付。要求视觉清晰、文案简短，并补充基础测试。
```

### Demo 稳定性

项目已提供可重复验证命令：

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run build:demo
```

当前覆盖结果：

- API Pipeline 测试：9 个用例通过。
- Demo 页面测试：1 个用例通过。
- TypeScript 类型检查通过。
- Web 控制台和 Demo 应用生产构建通过。

## 2. 核心部分代码展示

### 2.1 Pipeline 状态机与生命周期

核心文件：`apps/api/src/domain/pipelineRunner.ts`

展示重点：

- Pipeline 支持启动、暂停、恢复、终止。
- 阶段按依赖顺序执行。
- Checkpoint 会暂停流程，等待人工 Approve / Reject。
- Reject 会携带理由回退到上游阶段重做。
- 阶段执行过程中会记录事件流、耗时、产物和状态。

关键实现位置：

- `PipelineRunner`：Pipeline 编排主类。
- `executeAgentStage`：执行 Agent 阶段。
- `executeParallelSubTasks`：复杂阶段并行执行多个子任务。
- `createParallelSubTaskPlan`：为方案设计、代码生成阶段生成并行子任务。
- `buildParallelSubTaskArtifact`：合并并行子任务产物。

核心逻辑摘要：

```ts
const subTaskPlan = createParallelSubTaskPlan(stage);
let artifact = subTaskPlan.length
  ? await this.executeParallelSubTasks(running, stage, subTaskPlan, previousArtifacts, codeContext)
  : await this.agentProvider.execute({ pipeline: running, stage, previousArtifacts, codeContext });
```

### 2.2 Agent Provider 与 Prompt 工程

核心文件：

- `apps/api/src/agents/agentProvider.ts`
- `apps/api/src/domain/requirementAttachmentService.ts`
- `apps/api/src/agents/agentPrompts.ts`

展示重点：

- Agent 角色包括需求分析、方案设计、代码生成、测试、评审、交付。
- 支持 Mock Provider 和豆包 / 火山方舟 Provider，运行时通过环境变量切换。
- 每个 Agent 有 System Prompt、输出检查清单和 Skill Profile。
- Prompt 中会注入上游产物、代码库上下文、启用 Skill 和输出约束。
- Prompt 中也会注入需求附件解析结果，用于从 PDF / 文本需求材料中提取背景和约束。

核心逻辑摘要：

```ts
messages: [
  { role: "system", content: buildSystemPrompt(stage) },
  { role: "user", content: buildAgentPrompt(pipeline, stage, previousArtifacts, title, codeContext) }
]
```

### 2.3 Agent Skill Profile

核心文件：

- `packages/shared/src/index.ts`
- `apps/api/src/agents/agentPrompts.ts`
- `apps/web/src/App.tsx`

展示重点：

- 角色决定“谁来做”，Skill 决定“这次用哪些能力做”。
- 当前内置 10 个 Skill：需求结构化、代码库上下文读取、方案拆解、并行规划、Diff 规划、工作区写入、测试策略、风险评审、预览微调、交付摘要。
- 阶段和子任务都会携带 Skill，前端会展示 Skill 标签，Prompt 也会注入 Skill 描述。

核心逻辑摘要：

```ts
export const roleDefaultSkills: Record<AgentRole, AgentSkill[]> = {
  coder: ["code_context_reading", "diff_planning", "workspace_editing"],
  reviewer: ["code_context_reading", "risk_review"]
};
```

### 2.4 代码库上下文读取

核心文件：`apps/api/src/domain/codeContextService.ts`

展示重点：

- 创建 Pipeline 时可以传入 `contextPaths`。
- Agent 执行前读取目标仓库目录树和有限文件内容。
- 限制目标范围、文件大小和总上下文预算，避免把整个仓库塞进 Prompt。
- 跳过 `node_modules`、`.git`、`dist`、`build`、`coverage` 等目录。

### 2.5 需求附件上传与 PDF 文本提取

核心文件：

- `apps/api/src/routes/pipelines.ts`
- `apps/api/src/domain/requirementAttachmentService.ts`
- `apps/web/src/App.tsx`

展示重点：

- 创建 Pipeline 同时支持 JSON 和 `multipart/form-data`。
- 前端可以选择多个需求附件。
- 后端支持 PDF 和常见文本文件，PDF 会提取前 12 页文本。
- 附件解析结果写入 `requirementAttachments`，并进入 Agent Prompt。
- 不支持或解析失败的附件不会阻断 Pipeline，会记录跳过原因。

### 2.6 受控代码生成与真实 diff

核心文件：`apps/api/src/domain/workspaceChangeService.ts`

展示重点：

- `code-generation` 阶段会对 `workspace/demo` 写入真实代码变更。
- 变更结果会生成 diff，并追加到阶段产物中。
- 文件写入集中在并行子任务完成后统一执行，避免并发写冲突。

### 2.7 Human-in-the-Loop 与预览反馈

核心文件：

- `apps/web/src/App.tsx`
- `workspace/demo/src/devflowPreviewBridge.ts`
- `apps/api/src/routes/pipelines.ts`
- `apps/api/src/domain/workspaceChangeService.ts`

展示重点：

- 控制台支持 Approve / Reject。
- Reject 会把人工原因带回上游阶段。
- 预览界面支持选中元素，通过 `postMessage` 把元素信息传回控制台。
- 用户输入自然语言反馈后，API 会写入受控 CSS refinement。

核心逻辑摘要：

```ts
window.parent.postMessage(
  {
    type: "devflow:element-selected",
    element
  },
  "*"
);
```

## 3. 项目亮点介绍

### 解决的问题 / 痛点

传统研发流程中，需求、方案、编码、测试、评审、交付分散在不同工具和不同角色之间，容易出现以下问题：

- 需求输入不结构化，后续实现容易跑偏。
- AI 生成内容缺少流程约束，难以形成稳定交付链路。
- 人类审核节点不清晰，要么全自动风险高，要么人工介入成本高。
- Agent 不理解代码库上下文，只能泛泛生成建议。
- 代码生成、测试、评审之间缺少可追踪的阶段产物。
- 生成结果无法快速在预览界面中验证和微调。

DevFlow Engine 的目标是把一次研发需求变成可观测、可审批、可回退、可演示的 AI Pipeline。

### 流程完整性与闭环

项目实现了从需求到交付的完整闭环：

1. 需求输入。
2. 上传 PDF / 文本类需求附件。
3. 需求分析 Agent 基于文本需求和附件上下文生成结构化需求。
4. 方案设计 Agent 生成技术方案。
5. 人工方案审批。
6. 代码生成 Agent 写入真实 workspace 变更。
7. 测试 Agent 生成测试策略。
8. 评审 Agent 生成代码评审报告。
9. 人工最终评审。
10. 交付 Agent 汇总交付摘要。
11. 预览界面支持人工选中元素后自然语言微调。

### 实际价值 / 效率提升

- 把“和 AI 来回聊天”升级为“可追踪的研发流水线”。
- 每个阶段有明确输入输出，减少上下文丢失。
- 人类只在关键风险节点决策，降低人工审核成本。
- 复杂阶段支持并行子任务，提高方案生成和代码生成阶段的吞吐。
- 上下文读取让 Agent 更贴近真实代码库，减少无效建议。
- 预览反馈让 UI 调整从“描述问题 -> 找文件 -> 手改样式”变为“选中元素 -> 自然语言反馈 -> 自动写回”。

### 可量化成果

- 8 个默认 Pipeline 阶段。
- 2 个 Human-in-the-Loop 检查点。
- 10 个 Agent Skill。
- 支持最多 5 个需求附件上传，PDF 可提取前 12 页文本。
- 2 个复杂阶段支持并行子任务。
- 每个复杂阶段拆分为 3 个并行子任务。
- 8 个核心 REST API 端点。
- 9 个 API 流程测试 + 1 个 Demo 页面测试。
- 支持 API、Web 控制台、Demo 目标应用三端联动演示。

## 4. AI 亮点介绍

### 高阶 AI 技巧

1. Agent 工作流编排

系统不是单次调用模型，而是把研发过程拆成多个有依赖关系的 Agent 阶段。每个 Agent 有明确角色、System Prompt、输入上下文和输出契约。

2. Human-in-the-Loop

在方案审批和最终评审设置人工检查点。AI 负责产出，人类负责关键决策。Reject 会携带理由回退上游阶段，实现“人类反馈 -> AI 重做”的闭环。

3. 代码库上下文注入

Agent 执行前会读取目标仓库目录树和指定文件内容，并通过预算控制注入 Prompt。相比盲目生成，Agent 能基于现有文件结构做方案和代码计划。

4. 需求附件理解

用户首次输入需求时可以上传 PDF 或文本类文件。系统先把附件解析成受控文本上下文，再交给需求分析 Agent，适合处理比赛说明、产品说明、需求文档和验收材料。

5. Agent Skill Profile

在角色之外引入 Skill 层。角色表示执行身份，Skill 表示启用能力。这样既方便 Prompt 注入，也方便前端观测和后续扩展。

6. 真正并行的子 Agent 执行

`solution-design` 和 `code-generation` 会拆分为互不重叠 scope 的子任务，并用并发调用执行。系统保留并行速度优势，同时把文件写入放在汇总后统一执行，控制冲突风险。

7. 预览驱动的自然语言修改

人类可以在预览界面选中具体元素，再用自然语言描述修改要求。系统把元素 ID、文本、文件路径和反馈指令转成受控样式更新。

### 人和 AI 的分工

- 人类负责提出需求、审批关键方案、驳回不满意产物、在预览界面做主观反馈。
- AI 负责需求结构化、方案拆解、代码变更计划、测试策略、风险评审和交付总结。
- 系统负责状态机、上下文收集、并行调度、API 暴露、产物记录和 workspace 受控写入。

这种分工避免了“全自动不可控”和“人工流程太重”两个极端。

### 模型选型思路

当前实现采用 Provider 抽象：

- Mock Provider：保证离线演示稳定、便于测试和比赛现场兜底。
- 豆包 / 火山方舟 Provider：用于接入真实 LLM 生成阶段产物。

Provider 通过 `LLM_PROVIDER` 环境变量切换。后续可在同一接口下继续接入 OpenAI、Claude 或本地模型，不需要改 Pipeline 状态机。

### AI 对原有工作流的改变

原有方式通常是：开发者单独问 AI、复制结果、手动改代码、再自行测试评审。DevFlow Engine 改成：

- AI 输出不再是零散聊天内容，而是阶段化产物。
- 每次生成都有上游上下文、代码库上下文和角色约束。
- 人类反馈不再停留在聊天层，而会进入状态机并影响后续阶段。
- 代码结果不只是文本建议，而能写入目标 workspace 并生成 diff。
- UI 问题可以直接从预览页面反馈给系统。

## 5. 创新性说明

### 差异化亮点

- 不是普通 Chatbot，而是研发流程引擎。
- 不是单 Agent，而是多角色、多阶段、可并行的 Agent 编排。
- 不是一次性生成代码，而是带人工审批、Reject 回退、阶段产物和事件流。
- 不是只看 Prompt，而是结合真实代码库上下文和目标 workspace diff。
- 不是生成后人工找问题，而是把预览反馈纳入工作流。

### 可复用性 / 可推广性

这套架构可以推广到多种研发场景：

- 新功能开发。
- Bug 修复。
- UI 改版。
- 测试补全。
- 代码评审预检查。
- MR / PR 描述生成。
- 企业内部审批流和飞书通知集成。

只需要替换默认 Pipeline 阶段、Agent Prompt、Skill 映射和目标仓库，就可以迁移到其他项目。

## 6. 技术实现性说明

### 技术架构

- Monorepo：统一管理 API、Web、共享类型和 Demo workspace。
- API：Fastify + Zod + Swagger UI。
- Web：React + Vite。
- Shared：前后端共享 DTO 和领域类型。
- Pipeline：内存状态存储 + 事件流 + 阶段状态机。
- Agent：Provider 抽象，支持 Mock 和豆包 / 火山方舟。
- Demo：`workspace/demo` 作为可被修改和预览的目标代码库。

### 工程规范与稳定性

- TypeScript 全栈类型约束。
- API 请求体使用 Zod 校验。
- Swagger UI 暴露 API 文档。
- 测试覆盖 Pipeline 主流程、Reject 回退、重试上限、真实 diff、上下文读取、预览反馈、并行子任务。
- 构建脚本覆盖 API、Web 和 Demo。
- 工作区写入限制在目标 workspace 范围内，避免任意文件写入风险。

### 可扩展性

- Agent Provider 可继续接入更多模型。
- Skill Profile 可扩展更多工程能力，如代码索引、依赖分析、安全扫描。
- Workspace diff 可升级为 Git 分支、提交、MR / PR 创建。
- Preview Refinement 可升级为 LLM 生成 patch，并接入人工 diff 审批。
- 通知系统可接入飞书群机器人或审批卡片。

## 7. 其他补充信息

### 当前边界

- 当前真实模型接入路径以豆包 / 火山方舟为主，Mock Provider 用于稳定演示和自动化测试。
- 当前 workspace 写入是受控模板化生成，适合 MVP 演示；后续可以升级为 LLM patch 生成 + diff 审批。
- 当前状态存储为内存实现，后续落地可替换为数据库持久化。
- 当前预览反馈主要覆盖 CSS 微调，后续可扩展到组件结构、文案和交互逻辑修改。

### 推荐答辩总结

DevFlow Engine 的核心价值是把 AI 从“单点问答工具”变成“可落地的研发流程执行系统”。它用 Pipeline 保证流程闭环，用 Agent 保证专业分工，用 Skill 表达可组合能力，用 Human-in-the-Loop 控制风险，用代码库上下文和真实 diff 连接工程现场，并用预览反馈把人的判断重新带回自动化流程。
