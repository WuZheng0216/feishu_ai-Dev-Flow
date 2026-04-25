import type { PipelineRun, PipelineStage } from "@devflow/shared";
import type { ApiConfig } from "../config.js";

export interface DevFlowNotifier {
  checkpointWaiting(pipeline: PipelineRun, stage: PipelineStage): Promise<void>;
  pipelineCompleted(pipeline: PipelineRun): Promise<void>;
}

export function createNotifier(config: ApiConfig): DevFlowNotifier {
  if (config.feishuWebhookUrl) {
    return new FeishuWebhookNotifier(config.feishuWebhookUrl);
  }

  return new ConsoleNotifier();
}

class ConsoleNotifier implements DevFlowNotifier {
  async checkpointWaiting(pipeline: PipelineRun, stage: PipelineStage): Promise<void> {
    console.info(`[notify] ${pipeline.name} waiting for ${stage.name}`);
  }

  async pipelineCompleted(pipeline: PipelineRun): Promise<void> {
    console.info(`[notify] ${pipeline.name} completed`);
  }
}

class FeishuWebhookNotifier implements DevFlowNotifier {
  constructor(private readonly webhookUrl: string) {}

  async checkpointWaiting(pipeline: PipelineRun, stage: PipelineStage): Promise<void> {
    await this.sendText([
      "DevFlow 需要人工审批",
      `Pipeline: ${pipeline.name}`,
      `检查点: ${stage.name}`,
      `状态: ${pipeline.status}`,
      "请打开 DevFlow 控制台执行 Approve 或 Reject。"
    ].join("\n"));
  }

  async pipelineCompleted(pipeline: PipelineRun): Promise<void> {
    await this.sendText([
      "DevFlow Pipeline 已完成",
      `Pipeline: ${pipeline.name}`,
      `需求: ${pipeline.requirement}`,
      "请打开控制台查看交付摘要。"
    ].join("\n"));
  }

  private async sendText(text: string): Promise<void> {
    const response = await fetch(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        msg_type: "text",
        content: {
          text
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Feishu webhook failed: ${response.status} ${response.statusText}`);
    }
  }
}
