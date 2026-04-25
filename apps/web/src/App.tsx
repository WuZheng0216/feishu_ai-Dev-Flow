import type { PipelineEvent, PipelineRun, PipelineStage } from "@devflow/shared";
import { useEffect, useState } from "react";
import {
  approveCheckpoint,
  createPipeline,
  getPipeline,
  listPipelines,
  rejectCheckpoint,
  startPipeline
} from "./api";

const defaultRequirement =
  "请为演示站点首页增加一个“比赛亮点”区域，包含三个卡片：AI Pipeline、Human Review、自动交付。要求视觉清晰、文案简短，并补充基础测试。";

export default function App() {
  const [requirement, setRequirement] = useState(defaultRequirement);
  const [pipeline, setPipeline] = useState<PipelineRun | null>(null);
  const [pipelines, setPipelines] = useState<PipelineRun[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [followCurrentStage, setFollowCurrentStage] = useState(true);
  const [rejectReason, setRejectReason] = useState("方案还需要补充风险控制和回滚策略。");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshList();
  }, []);

  useEffect(() => {
    if (!pipeline || ["completed", "failed", "cancelled", "waiting_for_human"].includes(pipeline.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      const latest = await getPipeline(pipeline.id);
      setPipeline(latest);
      if (followCurrentStage) {
        setSelectedStageId(latest.currentStageId ?? latest.stages[0]?.id ?? null);
      }
      await refreshList();
    }, 500);

    return () => window.clearInterval(timer);
  }, [followCurrentStage, pipeline]);

  async function refreshList() {
    setPipelines(await listPipelines());
  }

  async function handleCreateAndStart() {
    await runAction(async () => {
      const created = await createPipeline({
        name: "比赛演示 Pipeline",
        requirement,
        targetRepoPath: "workspace/demo"
      });
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
                      <dt>依赖</dt>
                      <dd>{selectedStage.dependsOn?.join(", ") ?? "无"}</dd>
                    </div>
                    <div>
                      <dt>开始时间</dt>
                      <dd>{formatTime(selectedStage.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>耗时</dt>
                      <dd>{formatDuration(selectedStage.startedAt, selectedStage.completedAt, selectedStage.status)}</dd>
                    </div>
                  </dl>

                  {selectedStage.status === "running" ? (
                    <p className="liveHint">当前阶段正在调用 Agent。完成后这里会显示模型返回的阶段产物。</p>
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

      {currentCheckpoint && pipeline ? (
        <section className="panel checkpoint">
          <div className="sectionTitle">
            <span>05</span>
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

function formatDuration(startedAt?: string, completedAt?: string, status?: PipelineStage["status"]): string {
  if (!startedAt) {
    return "未开始";
  }

  const end =
    completedAt || status === "running" || status === "waiting_for_human"
      ? completedAt
        ? Date.parse(completedAt)
        : Date.now()
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
