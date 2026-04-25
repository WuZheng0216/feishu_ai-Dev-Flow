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
