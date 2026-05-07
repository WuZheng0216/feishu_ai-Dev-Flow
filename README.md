# DevFlow Engine

AI 驱动的需求交付流程引擎比赛项目骨架。

目标是把「需求输入 -> 方案设计 -> 编码 -> 测试 -> 评审 -> 交付」编排为可观测、可审批、可扩展的 AI Pipeline。

## 当前 MVP 覆盖

- Pipeline 创建、启动、查询、取消。
- 多阶段状态机：需求分析、方案设计、代码生成、测试生成、代码评审、交付集成。
- 至少 2 个 Human-in-the-Loop 检查点：方案审批、最终评审。
- Agent 抽象层：默认 Mock Agent，可后续替换为真实 LLM Provider。
- Agent Skill Profile：每个阶段和子任务会显式绑定技能，如上下文读取、方案拆解、Diff 规划、工作区写入、测试策略、风险评审。
- 阶段内并行子任务：`solution-design` 与 `code-generation` 会拆成多个互不重叠 scope 的子 Agent 任务并发执行。
- 代码库上下文读取：创建 Pipeline 时可指定 `contextPaths`，Agent 执行前会读取目标仓库目录树和有限文件内容。
- 需求附件上传：首次创建 Pipeline 时可上传 PDF 或常见文本文件，后端会提取文本并注入 Agent Prompt。
- 受控代码生成：`code-generation` 阶段会对 `workspace/demo` 写入真实文件变更，并在阶段产物中展示 diff。
- 实时预览反馈：控制台可嵌入 `workspace/demo` 预览，选中页面元素后提交自然语言反馈并写回样式调整。
- REST API + Swagger UI。
- React 控制台：输入需求、观察阶段流转、审批/驳回检查点。
- Docker Compose 一键启动草案。

## 本地启动

PowerShell 如果直接调用 `npm` 遇到执行策略问题，请使用 `npm.cmd`。

```powershell
npm.cmd install
npm.cmd run dev:api
npm.cmd run dev:web
```

访问：

- API: http://localhost:4000
- Swagger: http://localhost:4000/docs
- Web: http://localhost:5173

若要在控制台里实时预览目标应用，请另开一个窗口运行：

```powershell
npm.cmd --prefix workspace/demo run dev
```

访问目标应用：

- Demo preview: http://127.0.0.1:5174

## 验证

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run build:demo
```

## 切换到豆包 / 火山方舟


```powershell
$env:LLM_PROVIDER="doubao"
$env:DOUBAO_API_KEY="你的 API Key"
$env:DOUBAO_ENDPOINT_ID="你的 ep-... 接入点 ID"
$env:DOUBAO_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
npm.cmd run dev:api
```

保留另一个窗口运行前端：

```powershell
npm.cmd run dev:web
```

然后访问 `http://localhost:5173` 创建并启动 Pipeline。此时各 Agent 阶段会调用豆包生成真实阶段产物；Human-in-the-Loop 审批流程仍由本系统状态机控制。

## 代码库上下文

默认目标仓库是 `workspace/demo`。控制台的“上下文路径”会随创建请求提交，后端只允许读取 `workspace/*` 下的文本文件，并跳过 `node_modules`、`.git`、`dist` 等目录。

推荐上下文路径：

```text
src/Home.tsx
src/styles.css
src/Home.test.tsx
package.json
```

## 需求附件上传

控制台创建 Pipeline 时可以上传需求附件。当前支持：

- PDF：后端使用本地解析提取前 12 页文本。
- 常见文本文件：`.txt`、`.md`、`.json`、`.csv`、`.yaml`、`.xml`、`.html`、`.ts`、`.tsx`、`.js`、`.jsx` 等。

限制：最多 5 个文件，每个不超过 5MB；每个附件最多注入约 24,000 字符，超出会截断。解析结果会保存在 Pipeline 的 `requirementAttachments` 中，并在 Agent Prompt 的“需求附件上下文”里提供给模型。

## Agent Skill

当前 MVP 已内置一组适合研发流水线的轻量 Skill，并在 Agent 执行时注入 Prompt：

- `requirement_structuring`：需求结构化。
- `code_context_reading`：读取目标仓库目录和指定文件上下文。
- `solution_decomposition`：把复杂需求拆成可落地步骤。
- `parallel_task_planning`：识别可并行执行的子任务。
- `diff_planning`：按文件规划变更和 diff 摘要。
- `workspace_editing`：在受控 workspace 内写入真实变更。
- `test_strategy`：生成测试策略和验证路径。
- `risk_review`：做正确性、安全性、可维护性评审。
- `preview_refinement`：处理预览界面选中元素后的自然语言微调。
- `delivery_summary`：汇总交付说明。

控制台的阶段详情和并行子任务卡片会展示当前启用的 Skill 标签。

## 推荐演示需求

```text
请为演示站点首页增加一个“比赛亮点”区域，包含三个卡片：AI Pipeline、Human Review、自动交付。要求视觉清晰、文案简短，并补充基础测试。
```

## 飞书集成说明

当前骨架预留了飞书环境变量。后续可以走两种方式：

- 群机器人 Webhook：适合把 Pipeline 状态、审批链接、运行结果推送到群。
- 飞书开放平台应用：适合做更完整的审批交互、消息卡片、用户身份绑定。

我无法直接未经授权连接你的飞书账号；需要你提供群机器人 Webhook 或开放平台应用的 `App ID / App Secret`。

更多细节见 `docs/feishu-integration.md`。
