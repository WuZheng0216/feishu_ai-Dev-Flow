import type { PipelineStage } from "@devflow/shared";

export function createDefaultStages(): PipelineStage[] {
  return [
    {
      id: "requirement-analysis",
      name: "需求分析",
      kind: "agent",
      agentRole: "requirements_analyst",
      status: "pending",
      retryCount: 0,
      maxRetries: 2
    },
    {
      id: "solution-design",
      name: "方案设计",
      kind: "agent",
      agentRole: "solution_architect",
      dependsOn: ["requirement-analysis"],
      status: "pending",
      retryCount: 0,
      maxRetries: 2
    },
    {
      id: "design-approval",
      name: "方案审批",
      kind: "checkpoint",
      dependsOn: ["solution-design"],
      status: "pending",
      retryCount: 0,
      maxRetries: 0
    },
    {
      id: "code-generation",
      name: "代码生成",
      kind: "agent",
      agentRole: "coder",
      dependsOn: ["design-approval"],
      status: "pending",
      retryCount: 0,
      maxRetries: 2
    },
    {
      id: "test-generation",
      name: "测试生成",
      kind: "agent",
      agentRole: "test_engineer",
      dependsOn: ["code-generation"],
      status: "pending",
      retryCount: 0,
      maxRetries: 2
    },
    {
      id: "code-review",
      name: "代码评审",
      kind: "agent",
      agentRole: "reviewer",
      dependsOn: ["test-generation"],
      status: "pending",
      retryCount: 0,
      maxRetries: 2
    },
    {
      id: "release-approval",
      name: "最终评审",
      kind: "checkpoint",
      dependsOn: ["code-review"],
      status: "pending",
      retryCount: 0,
      maxRetries: 0
    },
    {
      id: "delivery",
      name: "交付集成",
      kind: "agent",
      agentRole: "delivery_manager",
      dependsOn: ["release-approval"],
      status: "pending",
      retryCount: 0,
      maxRetries: 1
    }
  ];
}
