# API 草案

完整 Swagger UI 由后端运行时提供：`/docs`。

## 核心端点

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/pipelines` | 创建 Pipeline |
| `GET` | `/api/pipelines` | 查询 Pipeline 列表 |
| `GET` | `/api/pipelines/:id` | 查询 Pipeline 详情 |
| `POST` | `/api/pipelines/:id/start` | 启动或继续 Pipeline |
| `POST` | `/api/pipelines/:id/cancel` | 取消 Pipeline |
| `POST` | `/api/pipelines/:id/checkpoints/:stageId/approve` | 审批通过 |
| `POST` | `/api/pipelines/:id/checkpoints/:stageId/reject` | 驳回并回退 |

## 创建 Pipeline 请求体

```json
{
  "name": "比赛演示 Pipeline",
  "requirement": "请为演示站点首页增加一个比赛亮点区域。",
  "targetRepoPath": "workspace/demo",
  "contextPaths": [
    "src/Home.tsx",
    "src/styles.css",
    "src/Home.test.tsx",
    "package.json"
  ]
}
```

`contextPaths` 是相对于 `targetRepoPath` 的文本文件路径。后端会在每个 Agent 阶段执行前收集目录树和有限文件内容，作为代码库上下文传给 Agent。
