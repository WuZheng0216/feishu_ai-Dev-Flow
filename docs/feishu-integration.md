# 飞书集成方案

## 当前可用方式：群机器人 Webhook

适合比赛 MVP 阶段，用来把 Pipeline 状态推送到飞书群。

准备步骤：

1. 在飞书群中添加「自定义机器人」。
2. 复制机器人 Webhook URL。
3. 写入 `.env` 或启动环境变量：

```env
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxxx
```

当前后端会在这些事件推送飞书文本消息：

- Pipeline 等待人工检查点审批。
- Pipeline 完成交付。

## 后续增强方式：飞书开放平台应用

如果需要“实时交互”而不仅是通知，建议升级为飞书开放平台应用：

- 使用消息卡片展示 Approve / Reject 按钮。
- 将飞书用户身份和 DevFlow 审批人绑定。
- 通过事件回调把飞书按钮点击同步回 DevFlow API。
- 支持把阶段产物摘要直接推送到个人或群聊。

这需要你提供：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- 回调地址配置权限
- 机器人或应用对应的群/用户授权
