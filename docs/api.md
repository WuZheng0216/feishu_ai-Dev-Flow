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
| `POST` | `/api/pipelines/:id/refine` | 根据预览选中元素和自然语言反馈执行受控调整 |
| `POST` | `/api/pipelines/:id/checkpoints/:stageId/approve` | 审批通过 |
| `POST` | `/api/pipelines/:id/checkpoints/:stageId/reject` | 驳回并回退 |

## 创建 Pipeline 请求体

JSON 创建方式：

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

如果需要上传需求附件，`POST /api/pipelines` 也支持 `multipart/form-data`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | text | Pipeline 名称，可选 |
| `requirement` | text | 原始需求，必填 |
| `targetRepoPath` | text | 目标仓库路径，可选 |
| `contextPaths` | text | JSON 字符串数组或换行分隔路径，可选 |
| `attachments` | file[] | 需求附件，支持 PDF 和常见文本文件 |

当前附件限制：最多 5 个文件，每个不超过 5MB。PDF 会提取前 12 页文本，文本类附件会直接读取 UTF-8 内容。解析结果会进入 Pipeline 的 `requirementAttachments` 字段，并注入 Agent Prompt。

## 预览反馈请求体

```json
{
  "stageId": "release-approval",
  "instruction": "把这个区域做得更紧凑，标题更醒目，但不要改变整体配色。",
  "selectedElement": {
    "devflowId": "highlights-section",
    "tagName": "section",
    "text": "比赛亮点 AI Pipeline Human Review 自动交付",
    "file": "src/Home.tsx",
    "selector": "[data-devflow-id=\"highlights-section\"]"
  }
}
```

当前 MVP 会把反馈转换为受控 CSS refinement，写回 `workspace/demo/src/styles.css` 并记录 `preview_refined` 事件。
