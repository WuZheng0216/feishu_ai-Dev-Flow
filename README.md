# DevFlow Engine

AI 驱动的需求交付流程引擎比赛项目骨架。

目标是把「需求输入 -> 方案设计 -> 编码 -> 测试 -> 评审 -> 交付」编排为可观测、可审批、可扩展的 AI Pipeline。

## 当前 MVP 覆盖

- Pipeline 创建、启动、查询、取消。
- 多阶段状态机：需求分析、方案设计、代码生成、测试生成、代码评审、交付集成。
- 至少 2 个 Human-in-the-Loop 检查点：方案审批、最终评审。
- Agent 抽象层：默认 Mock Agent，可后续替换为真实 LLM Provider。
- 代码库上下文读取：创建 Pipeline 时可指定 `contextPaths`，Agent 执行前会读取目标仓库目录树和有限文件内容。
- 受控代码生成：`code-generation` 阶段会对 `workspace/demo` 写入真实文件变更，并在阶段产物中展示 diff。
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
