# 技术方案草案

## 核心理念

Pipeline 是骨架，Agent 是执行肌肉，人类负责关键决策。

系统将一次研发需求拆成多个阶段，每个阶段都有明确输入、输出和执行者。Agent 负责生成阶段产物，人类在高风险节点 Approve 或 Reject。

Agent 执行前会通过 Code Context Service 收集目标仓库上下文。上下文包含浅层目录树、用户指定的 `contextPaths`、阶段默认文件和上游产物中提到的路径，整体受文件数量和字节预算限制，避免把整个仓库塞进 Prompt。

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

## 代码库上下文策略

- 目标范围限制在 `workspace/*`。
- 默认跳过 `.git`、`node_modules`、`dist`、`build`、`coverage` 等目录。
- 单文件最大读取 20KB，总上下文最大 80KB。
- `requirement-analysis` 阶段偏向读取 README、package 信息。
- `solution-design` 与 `code-generation` 阶段会读取入口文件、样式、测试和用户指定路径。
- 后续阶段会从上游产物中提取疑似路径，补充读取相关文件。

## 后续增强方向

- 接入 OpenAI 与第二个模型提供商。
- 将当前 workspace 受控 diff 升级为 Git 分支、提交、MR/PR 创建。
- 增加代码库语义索引和检索。
- 增加可观测性面板：阶段耗时、Token 消耗、失败率。
- 增加飞书群机器人通知与审批卡片。
