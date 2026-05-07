# 技术方案草案

## 核心理念

Pipeline 是骨架，Agent 是执行肌肉，人类负责关键决策。

系统将一次研发需求拆成多个阶段，每个阶段都有明确输入、输出和执行者。Agent 负责生成阶段产物，人类在高风险节点 Approve 或 Reject。

Agent 执行前会通过 Code Context Service 收集目标仓库上下文。上下文包含浅层目录树、用户指定的 `contextPaths`、阶段默认文件和上游产物中提到的路径，整体受文件数量和字节预算限制，避免把整个仓库塞进 Prompt。

用户在创建 Pipeline 时可以上传需求附件。API 支持 `multipart/form-data`，后端会解析 PDF 和常见文本文件，把提取出的文本保存为 `requirementAttachments`，并在 Agent Prompt 中作为“需求附件上下文”注入。PDF 当前采用本地文本提取，优先保证 Demo 稳定；后续可以切换或叠加火山方舟 Files / Responses API 做更强的文档理解。

Agent 角色之上增加了 Skill Profile。角色决定“谁来做”，Skill 决定“这次用哪些能力做”。例如代码生成阶段默认启用上下文读取、Diff 规划和工作区写入；视觉样式子任务会额外启用预览反馈微调。Skill 会被写入阶段 DTO、事件详情、Prompt 和前端展示。

复杂阶段支持真正的阶段内并行。`solution-design` 和 `code-generation` 会被拆成多个互不重叠 scope 的子任务，PipelineRunner 使用 `Promise.all` 并发调用对应 Agent；所有子任务完成后再合并阶段产物并统一写入 workspace，从而避免并发写同一文件导致冲突。

人在回路阶段可以进入 Preview Refinement 流程：控制台通过 iframe 预览目标应用，目标应用用 `data-devflow-id` 标记可选元素，并通过 `postMessage` 把选中元素传回控制台。用户提交自然语言反馈后，API 执行受控样式调整并写回 `workspace/demo`。

## 模块划分

- `apps/api`：REST API、Pipeline 状态机、Agent 编排、Swagger 文档。
- `apps/web`：研发流程控制台，用于输入需求、查看产物、执行审批。
- `packages/shared`：前后端共享 DTO、状态枚举、领域类型。
- `workspace/demo`：被 DevFlow 修改和演示的目标代码库。

## 默认 Pipeline

| 阶段 | 类型 | 说明 |
| --- | --- | --- |
| requirement-analysis | Agent | 输出结构化需求与验收标准 |
| solution-design | Agent | 输出技术方案、影响范围、文件变更计划 |
| design-approval | Checkpoint | 人工审批方案，Reject 后回退到方案设计 |
| code-generation | Agent | 生成代码变更计划，并对 `workspace/demo` 写入受控真实 diff |
| test-generation | Agent | 生成测试建议和执行结果摘要 |
| code-review | Agent | 生成评审报告 |
| release-approval | Checkpoint | 人工确认最终交付 |
| delivery | Agent | 生成交付摘要 |

## 并行子任务策略

- `solution-design` 并行执行架构方案、风险评审、测试策略三个子任务。
- `code-generation` 并行执行组件结构、视觉样式、测试补充三个子任务。
- 子任务拥有独立 Agent 角色、scope、状态、开始/完成时间和产物摘要。
- 当前版本并发执行 Agent 调用，但文件写入仍在子任务汇总后统一执行。
- 前端阶段详情会展示每个子任务的状态和影响范围。

## Agent Skill 策略

| Skill | 用途 | 典型阶段 |
| --- | --- | --- |
| requirement_structuring | 需求目标、范围、约束和验收标准结构化 | requirement-analysis |
| code_context_reading | 收集目录树和指定文件内容，给 Agent 提供代码库现状 | 全部 Agent 阶段 |
| solution_decomposition | 拆解技术方案、影响范围和落地步骤 | solution-design |
| parallel_task_planning | 规划互不冲突的并行子任务 | solution-design |
| diff_planning | 生成文件级变更计划和 diff 摘要 | code-generation |
| workspace_editing | 在受控 workspace 写入真实代码变更 | code-generation |
| test_strategy | 设计测试用例、验证命令和补测建议 | solution-design、test-generation |
| risk_review | 做正确性、安全性、可维护性和演示风险评审 | solution-design、code-review |
| preview_refinement | 将预览界面选中元素和自然语言反馈转成 UI 微调 | code-generation、Preview Refinement |
| delivery_summary | 汇总交付范围、验证情况和遗留风险 | delivery |

## 代码库上下文策略

- 目标范围限制在 `workspace/*`。
- 默认跳过 `.git`、`node_modules`、`dist`、`build`、`coverage` 等目录。
- 单文件最大读取 20KB，总上下文最大 80KB。
- `requirement-analysis` 阶段偏向读取 README、package 信息。
- `solution-design` 与 `code-generation` 阶段会读取入口文件、样式、测试和用户指定路径。
- 后续阶段会从上游产物中提取疑似路径，补充读取相关文件。

## 需求附件策略

- 创建 Pipeline 支持 JSON 和 `multipart/form-data` 两种请求。
- 附件字段名为 `attachments`，最多 5 个文件，单文件最大 5MB。
- PDF 使用本地解析提取前 12 页文本。
- 文本类文件直接读取 UTF-8 内容。
- 单个附件最多注入约 24,000 字符，超出会截断并标记。
- 不支持或解析失败的附件不会阻断 Pipeline 创建，会在附件状态中展示跳过原因。

## 预览反馈策略

- 预览面板默认打开 `http://127.0.0.1:5174`，避免 Windows 上 `localhost` 优先命中 IPv6 旧服务。
- 可选择元素通过 `data-devflow-id`、`data-devflow-file` 标记。
- iframe 内部只通过 `postMessage` 传递元素 ID、文本、class、边界框等轻量信息。
- `/api/pipelines/:id/refine` 会把自然语言反馈转换为受控 CSS refinement。
- 本阶段先覆盖视觉微调，后续可升级为 LLM 生成 patch 并走 diff 审批。

## 后续增强方向

- 接入 OpenAI 与第二个模型提供商。
- 将当前 workspace 受控 diff 升级为 Git 分支、提交、MR/PR 创建。
- 增加代码库语义索引和检索。
- 增加可观测性面板：阶段耗时、Token 消耗、失败率。
- 增加飞书群机器人通知与审批卡片。
