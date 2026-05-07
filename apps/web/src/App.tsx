import type {
  AgentSkill,
  PipelineEvent,
  PipelineRun,
  PipelineStage,
  SelectedPreviewElement
} from "@devflow/shared";
import { useEffect, useRef, useState } from "react";
import {
  approveCheckpoint,
  createPipeline,
  getPipeline,
  listPipelines,
  refinePipeline,
  rejectCheckpoint,
  startPipeline
} from "./api";

const defaultRequirement =
  "请为演示站点首页增加一个“比赛亮点”区域，包含三个卡片：AI Pipeline、Human Review、自动交付。要求视觉清晰、文案简短，并补充基础测试。";
const defaultContextPaths = ["src/Home.tsx", "src/styles.css", "src/Home.test.tsx", "package.json"].join("\n");
const PREVIEW_URL = import.meta.env.VITE_DEMO_PREVIEW_URL ?? "http://127.0.0.1:5174";
const PREVIEW_ORIGIN = new URL(PREVIEW_URL).origin;

export default function App() {
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const previewSelectModeRef = useRef(false);
  const previewContentVersionRef = useRef("");
  const isRefiningRef = useRef(false);
  const [requirement, setRequirement] = useState(defaultRequirement);
  const [contextPaths, setContextPaths] = useState(defaultContextPaths);
  const [requirementFiles, setRequirementFiles] = useState<File[]>([]);
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [followCurrentStage, setFollowCurrentStage] = useState(true);
  const [rejectReason, setRejectReason] = useState("方案还需要补充风险控制和回滚策略。");
  const [selectedPreviewElement, setSelectedPreviewElement] = useState<SelectedPreviewElement | null>(null);
  const [previewSelectMode, setPreviewSelectMode] = useState(false);
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);
  const [refineInstruction, setRefineInstruction] = useState("把这个区域做得更紧凑，标题更醒目，但不要改变整体配色。");
  const [isRefining, setIsRefining] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshList();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    previewSelectModeRef.current = previewSelectMode;
  }, [previewSelectMode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (isPreviewReadyMessage(event.data)) {
        postPreviewSelectMode(previewSelectModeRef.current);
        return;
      }

      if (!isPreviewSelectedMessage(event.data)) {
        return;
      }

      setSelectedPreviewElement(event.data.element);
      setPreviewSelectMode(false);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    postPreviewSelectMode(previewSelectMode);
  }, [previewSelectMode, previewRefreshKey]);

  useEffect(() => {
    if (!pipeline?.id || ["completed", "failed", "cancelled", "waiting_for_human"].includes(pipeline.status)) {
      return;
    }

    let isCancelled = false;
    let isFetching = false;
    let ticks = 0;
    const timer = window.setInterval(async () => {
      if (isFetching) {
        return;
      }

      isFetching = true;
      try {
        const latest = await getPipeline(pipeline.id);
        if (isCancelled) {
          return;
        }

        setPipeline(latest);
        if (followCurrentStage) {
          setSelectedStageId(latest.currentStageId ?? latest.stages[0]?.id ?? null);
        }

        ticks += 1;
        if (ticks % 4 === 0 || ["completed", "failed", "cancelled", "waiting_for_human"].includes(latest.status)) {
          await refreshList();
        }
      } finally {
        isFetching = false;
      }
    }, 250);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [followCurrentStage, pipeline?.id, pipeline?.status]);

  const codeGenerationCompletedAt =
    pipeline?.stages.find((stage) => stage.id === "code-generation")?.completedAt ?? "";
  const latestPreviewRefinedEventId =
    [...(pipeline?.events ?? [])].reverse().find((event) => event.type === "preview_refined")?.id ?? "";

  useEffect(() => {
    if (!pipeline?.id) {
      return;
    }

    const nextVersion = `${pipeline.id}:${codeGenerationCompletedAt}:${latestPreviewRefinedEventId}`;
    if (
      nextVersion === previewContentVersionRef.current ||
      (!codeGenerationCompletedAt && !latestPreviewRefinedEventId)
    ) {
      return;
    }

    previewContentVersionRef.current = nextVersion;
    setPreviewRefreshKey((value) => value + 1);
  }, [codeGenerationCompletedAt, latestPreviewRefinedEventId, pipeline?.id]);

  async function refreshList() {
    setPipelines(await listPipelines());
  }

  async function handleCreateAndStart() {
    await runAction(async () => {
      const created = await createPipeline({
        name: "比赛演示 Pipeline",
        requirement,
        targetRepoPath: "workspace/demo",
        contextPaths: parseContextPaths(contextPaths)
      }, requirementFiles);
      const started = await startPipeline(created.id);
      setPipeline(started);
      setSelectedStageId(started.currentStageId ?? started.stages[0]?.id ?? null);
      setFollowCurrentStage(true);
      await refreshList();
    });
  }

  async function handleSelect(id: string) {
    await runAction(async () => {
      const nextPipeline = await getPipeline(id);
      setPipeline(nextPipeline);
      setSelectedStageId(nextPipeline.currentStageId ?? nextPipeline.stages[0]?.id ?? null);
      setFollowCurrentStage(true);
    });
  }

  async function handleApprove(stage: PipelineStage) {
    if (!pipeline) {
      return;
    }

    await runAction(async () => {
      setPipeline(await approveCheckpoint(pipeline.id, stage.id));
      setSelectedStageId(stage.id);
      setFollowCurrentStage(true);
      await refreshList();
    });
  }

  async function handleReject(stage: PipelineStage) {
    if (!pipeline) {
      return;
    }

    await runAction(async () => {
      setPipeline(await rejectCheckpoint(pipeline.id, stage.id, { reason: rejectReason }));
      setSelectedStageId(stage.dependsOn?.[0] ?? stage.id);
      setFollowCurrentStage(true);
      await refreshList();
    });
  }

  async function handleRefinePreview() {
    if (!pipeline || !selectedPreviewElement || isRefiningRef.current) {
      return;
    }

    isRefiningRef.current = true;
    setIsRefining(true);
    setError(null);
    try {
      const updated = await refinePipeline(pipeline.id, {
        stageId: selectedStage?.id,
        instruction: refineInstruction,
        selectedElement: selectedPreviewElement
      });
      setPipeline(updated);
      setPreviewRefreshKey((value) => value + 1);
      await refreshList();
    } catch (innerError) {
      setError(innerError instanceof Error ? innerError.message : "预览修改失败");
    } finally {
      isRefiningRef.current = false;
      setIsRefining(false);
    }
  }

  async function runAction(action: () => Promise<void>) {
    setIsBusy(true);
    setError(null);
    try {
      await action();
    } catch (innerError) {
      setError(innerError instanceof Error ? innerError.message : "操作失败");
    } finally {
      setIsBusy(false);
    }
  }

  function postPreviewSelectMode(enabled: boolean) {
    previewFrameRef.current?.contentWindow?.postMessage(
      {
        type: "devflow:set-select-mode",
        enabled
      },
      PREVIEW_ORIGIN
    );
  }

  const currentCheckpoint = pipeline?.stages.find((stage) => stage.status === "waiting_for_human");
  const selectedStage =
    pipeline?.stages.find((stage) => stage.id === selectedStageId) ??
    pipeline?.stages.find((stage) => stage.id === pipeline.currentStageId) ??
    pipeline?.stages.at(-1);
  const latestEvents = [...(pipeline?.events ?? [])].reverse().slice(0, 16);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">AI DevFlow Competition MVP</p>
          <h1>让 AI 驱动整条研发流水线</h1>
          <p className="heroText">
            从需求输入开始，Pipeline 自动完成分析、方案、编码、测试、评审与交付；人类只在关键节点做审批。
          </p>
        </div>
        <div className="heroCard">
          <span>当前状态</span>
          <strong>{pipeline?.status ?? "ready"}</strong>
          <small>{pipeline?.currentStageId ?? "创建一个 Pipeline 开始演示"}</small>
        </div>
      </section>

      <section className="grid">
        <form className="panel inputPanel" onSubmit={(event) => event.preventDefault()}>
          <div className="sectionTitle">
            <span>01</span>
            <h2>输入需求</h2>
          </div>
          <textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} />
          <div className="fieldGroup">
            <label htmlFor="contextPaths">上下文路径</label>
            <textarea
              id="contextPaths"
              className="compactTextarea"
              value={contextPaths}
              onChange={(event) => setContextPaths(event.target.value)}
            />
          </div>
          <div className="fieldGroup">
            <label htmlFor="requirementFiles">需求附件</label>
            <input
              id="requirementFiles"
              type="file"
              multiple
              accept=".pdf,.txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.ts,.tsx,.js,.jsx,text/*,application/pdf,application/json"
              onChange={(event) => setRequirementFiles(Array.from(event.target.files ?? []))}
            />
            {requirementFiles.length ? (
              <div className="attachmentList">
                {requirementFiles.map((file) => (
                  <span className="attachmentChip" key={`${file.name}-${file.size}`}>
                    {file.name} · {formatBytes(file.size)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="fieldHint">支持 PDF 和常见文本文件，最多 5 个，每个不超过 5MB。</p>
            )}
          </div>
          <button type="button" onClick={handleCreateAndStart} disabled={isBusy || requirement.length < 8}>
            创建并启动 Pipeline
          </button>
          {error ? <p className="error">{error}</p> : null}
        </form>

        <section className="panel">
          <div className="sectionTitle">
            <span>02</span>
            <h2>运行记录</h2>
          </div>
          <div className="runList">
            {pipelines.length === 0 ? <p className="muted">还没有 Pipeline。</p> : null}
            {pipelines.map((item) => (
              <button
                className={item.id === pipeline?.id ? "runItem active" : "runItem"}
                key={item.id}
                type="button"
                onClick={() => void handleSelect(item.id)}
              >
                <strong>{item.name}</strong>
                <span>{item.status}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {pipeline ? (
        <section className="panel timelinePanel">
          <div className="sectionTitle">
            <span>03</span>
            <h2>Pipeline 状态机</h2>
          </div>
          <div className="timeline">
            {pipeline.stages.map((stage) => (
              <button
                className={`stage ${stage.status} ${stage.id === selectedStage?.id ? "selected" : ""}`}
                key={stage.id}
                type="button"
                onClick={() => {
                  setSelectedStageId(stage.id);
                  setFollowCurrentStage(false);
                }}
              >
                <div>
                  <span className="stageKind">{stage.kind}</span>
                  <h3>{stage.name}</h3>
                  <p>{stage.status}</p>
                </div>
                {stage.retryCount > 0 ? <strong className="retry">重试 {stage.retryCount}</strong> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {pipeline ? (
        <section className="panel observePanel">
          <div className="sectionTitle">
            <span>04</span>
            <h2>实时观察</h2>
          </div>
          <div className="observeGrid">
            <article className="stageDetail">
              {selectedStage ? (
                <>
                  <div className="detailHeader">
                    <div>
                      <span className="stageKind">{selectedStage.kind}</span>
                      <h3>{selectedStage.name}</h3>
                    </div>
                    <strong className={`statusPill ${selectedStage.status}`}>{selectedStage.status}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>阶段 ID</dt>
                      <dd>{selectedStage.id}</dd>
                    </div>
                    <div>
                      <dt>Agent 角色</dt>
                      <dd>{selectedStage.agentRole ?? "人工检查点"}</dd>
                    </div>
                    <div>
                      <dt>启用 Skill</dt>
                      <dd>
                        <SkillChips skills={selectedStage.skills} />
                      </dd>
                    </div>
                    <div>
                      <dt>依赖</dt>
                      <dd>{selectedStage.dependsOn?.join(", ") ?? "无"}</dd>
                    </div>
                    <div>
                      <dt>开始时间</dt>
                      <dd>{formatTime(selectedStage.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>耗时</dt>
                      <dd>{formatDuration(selectedStage.startedAt, selectedStage.completedAt, selectedStage.status, nowTick)}</dd>
                    </div>
                  </dl>

                  {selectedStage.status === "running" ? (
                    <p className="liveHint">当前阶段正在调用 Agent。完成后这里会显示模型返回的阶段产物。</p>
                  ) : null}

                  {pipeline.requirementAttachments?.length ? (
                    <div className="attachmentPreview">
                      <h4>需求附件</h4>
                      <div className="attachmentList">
                        {pipeline.requirementAttachments.map((attachment) => (
                          <article className="attachmentItem" key={attachment.id}>
                            <strong>{attachment.fileName}</strong>
                            <span>
                              {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
                              {attachment.truncated ? " · 已截断" : ""}
                            </span>
                            <p>{attachment.skippedReason ?? attachment.summary}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedStage.subTasks?.length ? (
                    <div className="subTaskPanel">
                      <h4>并行子任务</h4>
                      <div className="subTaskList">
                        {selectedStage.subTasks.map((subTask) => (
                          <article className={`subTaskItem ${subTask.status}`} key={subTask.id}>
                            <div>
                              <span>{subTask.agentRole}</span>
                              <h5>{subTask.title}</h5>
                              <p>{subTask.scope.join(", ")}</p>
                              <SkillChips skills={subTask.skills} />
                            </div>
                            <strong>{subTask.status}</strong>
                            {subTask.artifact ? <small>{subTask.artifact.summary}</small> : null}
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedStage.stream?.content && (!selectedStage.artifact || !selectedStage.stream.isComplete) ? (
                    <div className="streamPreview">
                      <div className="streamHeader">
                        <h4>模型流式输出</h4>
                        <span>{selectedStage.stream.isComplete ? "complete" : "streaming"}</span>
                      </div>
                      <pre>
                        {selectedStage.stream.content}
                        {!selectedStage.stream.isComplete ? <span className="cursor">|</span> : null}
                      </pre>
                    </div>
                  ) : null}

                  {selectedStage.status === "waiting_for_human" ? (
                    <p className="liveHint">当前阶段已暂停，等待人工 Approve 或 Reject。</p>
                  ) : null}

                  {selectedStage.humanDecision ? (
                    <p className="decision">
                      人工决策：{selectedStage.humanDecision.action}
                      {selectedStage.humanDecision.reason ? `，原因：${selectedStage.humanDecision.reason}` : ""}
                    </p>
                  ) : null}

                  {selectedStage.codeContext ? (
                    <div className="contextPreview">
                      <h4>代码库上下文</h4>
                      <p>
                        已读取 {selectedStage.codeContext.files.length} 个文件，
                        {selectedStage.codeContext.budget.usedBytes}/
                        {selectedStage.codeContext.budget.maxTotalBytes} bytes。
                      </p>
                      <ul>
                        {selectedStage.codeContext.files.map((file) => (
                          <li key={file.path}>
                            {file.path}
                            {file.truncated ? "（已截断）" : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {selectedStage.artifact ? (
                    <div className="artifactPreview">
                      <h4>{selectedStage.artifact.title}</h4>
                      <p>{selectedStage.artifact.summary}</p>
                      <pre>{selectedStage.artifact.markdown}</pre>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="muted">选择一个阶段查看详情。</p>
              )}
            </article>

            <article className="eventLog">
              <h3>事件流</h3>
              {latestEvents.length === 0 ? <p className="muted">还没有事件。</p> : null}
              {latestEvents.map((event) => (
                <EventItem event={event} key={event.id} />
              ))}
            </article>
          </div>
        </section>
      ) : null}

      {pipeline ? (
        <section className="panel previewPanel">
          <div className="sectionTitle">
            <span>05</span>
            <h2>预览校验</h2>
          </div>
          <div className="previewGrid">
            <div className={previewSelectMode ? "previewFrameWrap selecting" : "previewFrameWrap"}>
              <iframe
                key={previewRefreshKey}
                ref={previewFrameRef}
                className="previewFrame"
                title="Demo preview"
                src={`${PREVIEW_URL}?devflowRefresh=${previewRefreshKey}`}
                onLoad={() => {
                  postPreviewSelectMode(previewSelectModeRef.current);
                }}
              />
            </div>

            <aside className="refinePanel">
              <div className="previewActions">
                <button
                  type="button"
                  className={previewSelectMode ? "selectModeButton active" : "selectModeButton"}
                  onClick={() => setPreviewSelectMode((value) => !value)}
                >
                  {previewSelectMode ? "停止选择" : "选择元素"}
                </button>
                <button className="secondary" type="button" onClick={() => setPreviewRefreshKey((value) => value + 1)}>
                  刷新预览
                </button>
              </div>

              <div className="selectedElementCard">
                <span>选中元素</span>
                <strong>{selectedPreviewElement?.devflowId ?? "未选择"}</strong>
                {selectedPreviewElement ? (
                  <>
                    <small>{selectedPreviewElement.file ?? "src/Home.tsx"}</small>
                    <p>{selectedPreviewElement.text || selectedPreviewElement.tagName}</p>
                  </>
                ) : null}
              </div>

              <div className="fieldGroup">
                <label htmlFor="refineInstruction">反馈要求</label>
                <textarea
                  id="refineInstruction"
                  className="refineTextarea"
                  value={refineInstruction}
                  onChange={(event) => setRefineInstruction(event.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => void handleRefinePreview()}
                disabled={!pipeline || !selectedPreviewElement || refineInstruction.trim().length < 2 || isRefining}
              >
                {isRefining ? "修改中..." : "让 Agent 修改"}
              </button>
            </aside>
          </div>
        </section>
      ) : null}

      {currentCheckpoint && pipeline ? (
        <section className="panel checkpoint">
          <div className="sectionTitle">
            <span>06</span>
            <h2>Human-in-the-Loop 检查点</h2>
          </div>
          <p>
            当前等待人工决策：<strong>{currentCheckpoint.name}</strong>
          </p>
          <textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
          <div className="actions">
            <button type="button" onClick={() => void handleApprove(currentCheckpoint)}>
              Approve 继续
            </button>
            <button className="secondary" type="button" onClick={() => void handleReject(currentCheckpoint)}>
              Reject 回退重做
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

const skillLabels: Record<AgentSkill, string> = {
  requirement_structuring: "需求结构化",
  code_context_reading: "上下文读取",
  solution_decomposition: "方案拆解",
  parallel_task_planning: "并行规划",
  diff_planning: "Diff 规划",
  workspace_editing: "工作区写入",
  test_strategy: "测试策略",
  risk_review: "风险评审",
  preview_refinement: "预览微调",
  delivery_summary: "交付摘要"
};

function SkillChips({ skills }: { skills?: AgentSkill[] }) {
  if (!skills?.length) {
    return <span className="muted">未配置</span>;
  }

  return (
    <div className="skillChips">
      {skills.map((skill) => (
        <span className="skillChip" key={skill}>
          {skillLabels[skill]}
        </span>
      ))}
    </div>
  );
}

function EventItem({ event }: { event: PipelineEvent }) {
  return (
    <div className={`eventItem ${event.type}`}>
      <time>{formatTime(event.createdAt)}</time>
      <p>{event.message}</p>
      {event.stageId ? <small>{event.stageId}</small> : null}
      {event.details ? <small>{formatDetails(event.details)}</small> : null}
    </div>
  );
}

function formatTime(value?: string): string {
  if (!value) {
    return "未开始";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value}B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

function formatDuration(
  startedAt?: string,
  completedAt?: string,
  status?: PipelineStage["status"],
  now = Date.now()
): string {
  if (!startedAt) {
    return "未开始";
  }

  const end =
    completedAt || status === "running" || status === "waiting_for_human"
      ? completedAt
        ? Date.parse(completedAt)
        : now
      : Date.parse(startedAt);
  const durationMs = Math.max(0, end - Date.parse(startedAt));

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatDetails(details: NonNullable<PipelineEvent["details"]>): string {
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

function parseContextPaths(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPreviewSelectedMessage(value: unknown): value is {
  type: "devflow:element-selected";
  element: SelectedPreviewElement;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as { type?: unknown; element?: Partial<SelectedPreviewElement> };
  return (
    message.type === "devflow:element-selected" &&
    typeof message.element?.devflowId === "string" &&
    typeof message.element.tagName === "string" &&
    typeof message.element.text === "string"
  );
}

function isPreviewReadyMessage(value: unknown): value is {
  type: "devflow:preview-ready";
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (value as { type?: unknown }).type === "devflow:preview-ready";
}
