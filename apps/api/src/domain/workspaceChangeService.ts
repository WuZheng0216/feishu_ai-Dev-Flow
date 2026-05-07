import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { PipelineRun, RefinePipelineRequest, StageArtifact } from "@devflow/shared";
import { findProjectRoot, resolveWorkspaceTarget, toPosixPath } from "./workspacePaths.js";

export interface WorkspaceChangeResult {
  changedFiles: string[];
  diff: string;
  summary: string;
}

export interface WorkspaceChangeService {
  applyCodeGeneration(pipeline: PipelineRun, artifact?: StageArtifact): Promise<WorkspaceChangeResult | undefined>;
  applyRefinement(pipeline: PipelineRun, input: RefinePipelineRequest): Promise<WorkspaceChangeResult | undefined>;
}

export class NoopWorkspaceChangeService implements WorkspaceChangeService {
  async applyCodeGeneration(_pipeline: PipelineRun, _artifact?: StageArtifact): Promise<WorkspaceChangeResult | undefined> {
    return undefined;
  }

  async applyRefinement(
    _pipeline: PipelineRun,
    _input: RefinePipelineRequest
  ): Promise<WorkspaceChangeResult | undefined> {
    return undefined;
  }
}

export function createWorkspaceChangeService(rootDirectory = findProjectRoot(process.cwd())): WorkspaceChangeService {
  return new LocalWorkspaceChangeService(rootDirectory);
}

class LocalWorkspaceChangeService implements WorkspaceChangeService {
  constructor(private readonly rootDirectory: string) {}

  async applyCodeGeneration(pipeline: PipelineRun, artifact?: StageArtifact): Promise<WorkspaceChangeResult> {
    const targetDirectory = resolveWorkspaceTarget(
      this.rootDirectory,
      pipeline.targetRepoPath ?? "workspace/demo"
    );
    let files = extractGeneratedFilesFromArtifact(pipeline, artifact);
    const usedFallback = files.length === 0;
    const changedFiles: string[] = [];
    const patches: string[] = [];

    if (usedFallback) {
      files = buildDemoFeatureFiles(pipeline);
    }

    for (const file of files) {
      const absolutePath = resolve(targetDirectory, file.path);
      const oldContent = await readOptionalFile(absolutePath);

      if (normalizeNewlines(oldContent) === file.content) {
        continue;
      }

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.content, "utf8");

      const repositoryPath = toPosixPath(relative(this.rootDirectory, absolutePath));
      changedFiles.push(repositoryPath);
      patches.push(buildWholeFileDiff(repositoryPath, oldContent, file.content));
    }

    return {
      changedFiles,
      diff: patches.join("\n"),
      summary:
        changedFiles.length > 0
          ? usedFallback
            ? `Agent 未输出可安全写入的完整 FILE 文件块，已在 ${pipeline.targetRepoPath ?? "workspace/demo"} 写入 ${changedFiles.length} 个安全预览文件变更。`
            : `已在 ${pipeline.targetRepoPath ?? "workspace/demo"} 写入 ${changedFiles.length} 个真实文件变更。`
          : usedFallback
            ? `Agent 未输出可安全写入的完整 FILE 文件块，已保留 ${pipeline.targetRepoPath ?? "workspace/demo"} 的现有安全预览页面。`
            : `${pipeline.targetRepoPath ?? "workspace/demo"} 已经是目标状态，本次没有新的文件变更。`
    };
  }

  async applyRefinement(pipeline: PipelineRun, input: RefinePipelineRequest): Promise<WorkspaceChangeResult> {
    const targetDirectory = resolveWorkspaceTarget(
      this.rootDirectory,
      pipeline.targetRepoPath ?? "workspace/demo"
    );
    const cssPath = resolve(targetDirectory, "src/styles.css");
    const oldContent = await readOptionalFile(cssPath);
    const nextContent = applyManagedRefinementBlock(oldContent, buildRefinementCss(input));
    const repositoryPath = toPosixPath(relative(this.rootDirectory, cssPath));

    if (normalizeNewlines(oldContent) === nextContent) {
      return {
        changedFiles: [],
        diff: "",
        summary: "预览反馈没有产生新的文件变更，当前样式已经匹配该调整。"
      };
    }

    await mkdir(dirname(cssPath), { recursive: true });
    await writeFile(cssPath, nextContent, "utf8");

    return {
      changedFiles: [repositoryPath],
      diff: buildWholeFileDiff(repositoryPath, oldContent, nextContent),
      summary: `已根据预览反馈调整 ${input.selectedElement.devflowId}。`
    };
  }
}

interface GeneratedFile {
  path: string;
  content: string;
}

function extractGeneratedFilesFromArtifact(
  pipeline: PipelineRun,
  artifact?: StageArtifact
): GeneratedFile[] {
  if (!artifact?.markdown) {
    return [];
  }

  const files = new Map<string, GeneratedFile>();
  const fileBlockPattern = /(?:^|\n)#{1,6}\s*FILE\s*[:：]\s*([^\r\n]+)\r?\n```[^\r\n]*\r?\n([\s\S]*?)\r?\n```/gi;
  let match: RegExpExecArray | null;

  while ((match = fileBlockPattern.exec(artifact.markdown)) !== null) {
    const path = normalizeGeneratedFilePath(match[1] ?? "", pipeline.targetRepoPath ?? "workspace/demo");
    const content = normalizeNewlines(match[2] ?? "").replace(/\n?$/, "\n");

    if (!path || !content.trim() || !isGeneratedFileContentSafe(path, content)) {
      continue;
    }

    files.set(path, { path, content });
  }

  return [...files.values()];
}

function normalizeGeneratedFilePath(rawPath: string, targetRepoPath: string): string | undefined {
  const normalizedTarget = toPosixPath(targetRepoPath).replace(/\/+$/, "");
  let normalizedPath = toPosixPath(rawPath)
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\.\//, "");

  if (normalizedPath.startsWith(`${normalizedTarget}/`)) {
    normalizedPath = normalizedPath.slice(normalizedTarget.length + 1);
  }

  if (normalizedPath.startsWith("workspace/demo/")) {
    normalizedPath = normalizedPath.slice("workspace/demo/".length);
  }

  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    /^[A-Za-z]:/.test(normalizedPath) ||
    normalizedPath.split("/").includes("..") ||
    normalizedPath.includes("node_modules/") ||
    normalizedPath.startsWith("dist/") ||
    normalizedPath.startsWith("build/")
  ) {
    return undefined;
  }

  return normalizedPath;
}

function isGeneratedFileContentSafe(path: string, content: string): boolean {
  if (!/\.(css|js|jsx|ts|tsx)$/i.test(path)) {
    return true;
  }

  const looksLikeMarkdownArtifact =
    /^\s*#{1,6}\s+\S/m.test(content) ||
    /^\s*[-*]\s+(子任务 ID|Agent|Skills|Scope|状态|耗时)：/m.test(content) ||
    content.includes("```");

  return !looksLikeMarkdownArtifact;
}

function buildDemoFeatureFiles(pipeline: PipelineRun): GeneratedFile[] {
  if (isScheduleRequirement(pipeline.requirement)) {
    return buildScheduleFeatureFiles(pipeline);
  }

  return buildDevFlowFeatureFiles(pipeline.requirement);
}

function isScheduleRequirement(requirement: string): boolean {
  const normalized = requirement.toLowerCase();
  return (
    includesAny(normalized, ["赛程", "欧冠", "世界杯", "比分", "schedule", "fixture", "world cup", "champions league"]) ||
    (normalized.includes("比赛") && includesAny(normalized, ["结果", "赛果"]))
  );
}

function buildScheduleFeatureFiles(pipeline: PipelineRun): GeneratedFile[] {
  const attachmentNotice = buildScheduleAttachmentNotice(pipeline);

  return [
    {
      path: "src/Home.tsx",
      content: [
        'import React, { useMemo, useState } from "react";',
        'import { useDevflowPreviewBridge } from "./devflowPreviewBridge";',
        "",
        'type TournamentKey = "worldCup" | "championsLeague";',
        'type MatchStatus = "scheduled" | "resultPending" | "finished";',
        "",
        "interface Match {",
        "  id: string;",
        "  stage: string;",
        "  date: string;",
        "  time: string;",
        "  home: string;",
        "  away: string;",
        "  venue: string;",
        "  status: MatchStatus;",
        "  score?: string;",
        "}",
        "",
        "const attachmentNotice = " + JSON.stringify(attachmentNotice) + ";",
        "",
        "const tournaments: Record<TournamentKey, { label: string; subtitle: string; matches: Match[] }> = {",
        "  worldCup: {",
        '    label: "2026 世界杯",',
        '    subtitle: "按上传赛程文档生成的世界杯展示视图，结果字段会在数据可提取后自动填充。",',
        "    matches: [",
        '      { id: "wc-opener", stage: "小组赛 · 揭幕战", date: "2026-06-11", time: "待公布", home: "墨西哥", away: "待定", venue: "墨西哥城", status: "scheduled" },',
        '      { id: "wc-group", stage: "小组赛", date: "2026-06-12", time: "待公布", home: "美国/加拿大赛区球队", away: "待定", venue: "北美赛区", status: "scheduled" },',
        '      { id: "wc-knockout", stage: "淘汰赛", date: "2026-07-04", time: "待公布", home: "小组晋级队", away: "小组晋级队", venue: "待定", status: "scheduled" },',
        '      { id: "wc-final", stage: "决赛", date: "2026-07-19", time: "待公布", home: "半决赛胜者", away: "半决赛胜者", venue: "纽约/新泽西", status: "scheduled" }',
        "    ]",
        "  },",
        "  championsLeague: {",
        '    label: "2025-26 欧冠",',
        '    subtitle: "欧冠赛程与结果展示区，支持已结束、待录入结果和未开赛三类状态。",',
        "    matches: [",
        '      { id: "ucl-league", stage: "联赛阶段", date: "2025-09-16", time: "待录入", home: "参赛球队", away: "参赛球队", venue: "欧洲赛区", status: "resultPending" },',
        '      { id: "ucl-playoff", stage: "淘汰赛附加赛", date: "2026-02-17", time: "待录入", home: "晋级球队", away: "晋级球队", venue: "欧洲赛区", status: "resultPending" },',
        '      { id: "ucl-quarter", stage: "四分之一决赛", date: "2026-04-07", time: "待录入", home: "晋级球队", away: "晋级球队", venue: "欧洲赛区", status: "resultPending" },',
        '      { id: "ucl-final", stage: "决赛", date: "2026-05-30", time: "待公布", home: "半决赛胜者", away: "半决赛胜者", venue: "布达佩斯", status: "scheduled" }',
        "    ]",
        "  }",
        "};",
        "",
        "const statusLabels: Record<MatchStatus, string> = {",
        '  scheduled: "未开赛",',
        '  resultPending: "结果待录入",',
        '  finished: "已结束"',
        "};",
        "",
        "export function Home() {",
        "  useDevflowPreviewBridge();",
        '  const [activeTournament, setActiveTournament] = useState<TournamentKey>("worldCup");',
        "  const tournament = tournaments[activeTournament];",
        "  const stats = useMemo(() => {",
        "    const total = tournament.matches.length;",
        '    const scheduled = tournament.matches.filter((match) => match.status === "scheduled").length;',
        '    const resultPending = tournament.matches.filter((match) => match.status === "resultPending").length;',
        "    return { total, scheduled, resultPending };",
        "  }, [tournament]);",
        "",
        "  return (",
        '    <main className="scheduleShell" data-devflow-id="schedule-shell" data-devflow-file="src/Home.tsx">',
        '      <section className="scheduleHero" data-devflow-id="schedule-hero" data-devflow-file="src/Home.tsx">',
        '        <p className="eyebrow" data-devflow-id="schedule-eyebrow" data-devflow-file="src/Home.tsx">Fixture Board</p>',
        '        <h1 data-devflow-id="schedule-title" data-devflow-file="src/Home.tsx">欧冠与世界杯赛程及结果</h1>',
        '        <p className="lead" data-devflow-id="schedule-lead" data-devflow-file="src/Home.tsx">',
        "          根据上传赛程附件生成双赛事展示页，支持切换查看赛程、状态和比分结果。",
        "        </p>",
        '        <div className="notice" data-devflow-id="attachment-notice" data-devflow-file="src/Home.tsx">',
        "          {attachmentNotice}",
        "        </div>",
        "      </section>",
        "",
        '      <section className="tournamentTabs" aria-label="赛事切换" data-devflow-id="tournament-tabs" data-devflow-file="src/Home.tsx">',
        "        {(Object.keys(tournaments) as TournamentKey[]).map((key) => (",
        "          <button",
        "            className={key === activeTournament ? \"tab active\" : \"tab\"}",
        "            data-devflow-id={`tab-${key}`}",
        '            data-devflow-file="src/Home.tsx"',
        "            key={key}",
        "            type=\"button\"",
        "            onClick={() => setActiveTournament(key)}",
        "          >",
        "            {tournaments[key].label}",
        "          </button>",
        "        ))}",
        "      </section>",
        "",
        '      <section className="summaryGrid" aria-label="赛程状态" data-devflow-id="schedule-summary" data-devflow-file="src/Home.tsx">',
        '        <article><span>当前赛事</span><strong>{tournament.label}</strong></article>',
        '        <article><span>收录场次</span><strong>{stats.total}</strong></article>',
        '        <article><span>未开赛</span><strong>{stats.scheduled}</strong></article>',
        '        <article><span>结果待录入</span><strong>{stats.resultPending}</strong></article>',
        "      </section>",
        "",
        '      <section className="scheduleBoard" data-devflow-id="schedule-board" data-devflow-file="src/Home.tsx">',
        "        <div>",
        "          <h2>{tournament.label}</h2>",
        "          <p>{tournament.subtitle}</p>",
        "        </div>",
        '        <div className="matchList" data-devflow-id="match-list" data-devflow-file="src/Home.tsx">',
        "          {tournament.matches.map((match) => (",
        "            <article className={`matchCard ${match.status}`} key={match.id} data-devflow-id={`match-${match.id}`} data-devflow-file=\"src/Home.tsx\">",
        "              <div className=\"matchMeta\">",
        "                <span>{match.stage}</span>",
        "                <strong>{match.date}</strong>",
        "                <small>{match.time} · {match.venue}</small>",
        "              </div>",
        "              <div className=\"teams\">",
        "                <span>{match.home}</span>",
        "                <b>VS</b>",
        "                <span>{match.away}</span>",
        "              </div>",
        "              <div className=\"resultBox\">",
        "                <span>{statusLabels[match.status]}</span>",
        "                <strong>{match.score ?? (match.status === \"scheduled\" ? \"未开赛\" : \"比分待更新\")}</strong>",
        "              </div>",
        "            </article>",
        "          ))}",
        "        </div>",
        "      </section>",
        "    </main>",
        "  );",
        "}",
        ""
      ].join("\n")
    },
    buildPreviewBridgeFile(),
    {
      path: "src/Home.test.tsx",
      content: [
        'import assert from "node:assert/strict";',
        'import { describe, it } from "node:test";',
        'import React from "react";',
        'import { renderToStaticMarkup } from "react-dom/server";',
        'import { Home } from "./Home";',
        "",
        'describe("Home", () => {',
        '  it("renders the football schedule board", () => {',
        "    const html = renderToStaticMarkup(<Home />);",
        "",
        '    assert.match(html, /欧冠与世界杯赛程及结果/);',
        '    assert.match(html, /2026 世界杯/);',
        '    assert.match(html, /2025-26 欧冠/);',
        '    assert.match(html, /赛程状态/);',
        '    assert.match(html, /结果待录入|未开赛/);',
        "  });",
        "});",
        ""
      ].join("\n")
    },
    {
      path: "src/styles.css",
      content: buildScheduleStyles()
    }
  ];
}

function buildScheduleAttachmentNotice(pipeline: PipelineRun): string {
  const attachment = pipeline.requirementAttachments?.[0];

  if (!attachment) {
    return "未检测到可用附件，当前先展示赛程网站结构，可在上传可解析赛程后自动填充数据。";
  }

  if (attachment.skippedReason || !attachment.extractedText.trim()) {
    return `已接收附件《${attachment.fileName}》，但未提取到可用赛程文本：${attachment.skippedReason ?? "内容为空"}。当前页面先展示结构化赛程视图和待录入数据位。`;
  }

  return `已读取附件《${attachment.fileName}》，赛程文本已进入 Agent 上下文。`;
}

function buildDevFlowFeatureFiles(requirement: string): GeneratedFile[] {
  const requirementSummary = compactText(requirement);

  return [
    {
      path: "src/Home.tsx",
      content: `${[
        'import React from "react";',
        'import { useDevflowPreviewBridge } from "./devflowPreviewBridge";',
        "",
        "const highlights = [",
        "  {",
        '    title: "AI Pipeline",',
        '    description: "把需求分析、方案设计、代码生成、测试评审串成可观察的自动化流程。"',
        "  },",
        "  {",
        '    title: "Human Review",',
        '    description: "在方案审批和最终交付前保留人工决策，让 AI 输出始终可控。"',
        "  },",
        "  {",
        '    title: "自动交付",',
        '    description: "沉淀阶段产物、验证摘要和交付说明，为后续 MR 集成打基础。"',
        "  }",
        "];",
        "",
        "export function Home() {",
        "  useDevflowPreviewBridge();",
        "",
        "  return (",
        '    <main className="demoShell" data-devflow-id="page-shell" data-devflow-file="src/Home.tsx">',
        '      <section className="hero" data-devflow-id="hero-section" data-devflow-file="src/Home.tsx">',
        '        <p className="eyebrow" data-devflow-id="hero-eyebrow" data-devflow-file="src/Home.tsx">',
        "          DevFlow Demo Site",
        "        </p>",
        '        <h1 data-devflow-id="hero-title" data-devflow-file="src/Home.tsx">',
        "          AI 驱动的需求交付流程",
        "        </h1>",
        '        <p className="lead" data-devflow-id="hero-lead" data-devflow-file="src/Home.tsx">',
        `          ${requirementSummary}`,
        "        </p>",
        '        <button className="primaryAction" data-devflow-id="primary-action" data-devflow-file="src/Home.tsx">',
        "          开始体验",
        "        </button>",
        "      </section>",
        "",
        '      <section className="highlights" aria-label="比赛亮点" data-devflow-id="highlights-section" data-devflow-file="src/Home.tsx">',
        '        <div className="sectionHeader" data-devflow-id="highlights-header" data-devflow-file="src/Home.tsx">',
        '          <h2 data-devflow-id="highlights-title" data-devflow-file="src/Home.tsx">比赛亮点</h2>',
        "          <p>把演示重点压缩成评委一眼能看懂的三件事。</p>",
        "        </div>",
        '        <div className="highlightGrid" data-devflow-id="highlight-grid" data-devflow-file="src/Home.tsx">',
        "          {highlights.map((item) => (",
        '            <article className="highlightCard" key={item.title} data-devflow-id={`highlight-card-${item.title}`} data-devflow-file="src/Home.tsx">',
        "              <h3>{item.title}</h3>",
        "              <p>{item.description}</p>",
        "            </article>",
        "          ))}",
        "        </div>",
        "      </section>",
        "    </main>",
        "  );",
        "}",
        ""
      ].join("\n")}`
    },
    {
      path: "src/devflowPreviewBridge.ts",
      content: `${[
        'import { useEffect } from "react";',
        "",
        "type SelectModeMessage = {",
        '  type: "devflow:set-select-mode";',
        "  enabled: boolean;",
        "};",
        "",
        "export function useDevflowPreviewBridge() {",
        "  useEffect(() => {",
        "    let isSelectMode = false;",
        "    let hoveredElement: HTMLElement | undefined;",
        "",
        "    const clearHover = () => {",
        '      hoveredElement?.classList.remove("devflowSelectableHover");',
        "      hoveredElement = undefined;",
        "    };",
        "",
        "    const setSelectMode = (enabled: boolean) => {",
        "      isSelectMode = enabled;",
        '      document.body.classList.toggle("devflowSelectMode", enabled);',
        "      if (!enabled) {",
        "        clearHover();",
        "      }",
        "    };",
        "",
        "    const handleMessage = (event: MessageEvent<SelectModeMessage>) => {",
        '      if (event.data?.type !== "devflow:set-select-mode") {',
        "        return;",
        "      }",
        "",
        "      setSelectMode(Boolean(event.data.enabled));",
        "    };",
        "",
        "    const handlePointerMove = (event: PointerEvent) => {",
        "      if (!isSelectMode) {",
        "        return;",
        "      }",
        "",
        "      const target = findSelectableElement(event.target);",
        "",
        "      if (target === hoveredElement) {",
        "        return;",
        "      }",
        "",
        "      clearHover();",
        "      hoveredElement = target;",
        '      hoveredElement?.classList.add("devflowSelectableHover");',
        "    };",
        "",
        "    const handleClick = (event: MouseEvent) => {",
        "      if (!isSelectMode) {",
        "        return;",
        "      }",
        "",
        "      const target = findSelectableElement(event.target);",
        "",
        "      if (!target) {",
        "        return;",
        "      }",
        "",
        "      event.preventDefault();",
        "      event.stopPropagation();",
        "",
        "      const bounds = target.getBoundingClientRect();",
        "      window.parent.postMessage(",
        "        {",
        '          type: "devflow:element-selected",',
        "          element: {",
        '            devflowId: target.dataset.devflowId ?? "",',
        "            file: target.dataset.devflowFile,",
        '            selector: `[data-devflow-id="${target.dataset.devflowId ?? ""}"]`,',
        "            tagName: target.tagName.toLowerCase(),",
        "            className: target.className,",
        "            text: normalizeText(target.innerText),",
        "            bounds: {",
        "              x: Math.round(bounds.x),",
        "              y: Math.round(bounds.y),",
        "              width: Math.round(bounds.width),",
        "              height: Math.round(bounds.height)",
        "            }",
        "          }",
        "        },",
        '        "*"',
        "      );",
        "",
        "      setSelectMode(false);",
        "    };",
        "",
        '    window.addEventListener("message", handleMessage);',
        '    window.addEventListener("pointermove", handlePointerMove, true);',
        '    window.addEventListener("click", handleClick, true);',
        '    window.parent.postMessage({ type: "devflow:preview-ready" }, "*");',
        "",
        "    return () => {",
        "      clearHover();",
        '      document.body.classList.remove("devflowSelectMode");',
        '      window.removeEventListener("message", handleMessage);',
        '      window.removeEventListener("pointermove", handlePointerMove, true);',
        '      window.removeEventListener("click", handleClick, true);',
        "    };",
        "  }, []);",
        "}",
        "",
        "function findSelectableElement(target: EventTarget | null): HTMLElement | undefined {",
        "  if (!(target instanceof HTMLElement)) {",
        "    return undefined;",
        "  }",
        "",
        '  return target.closest<HTMLElement>("[data-devflow-id]") ?? undefined;',
        "}",
        "",
        "function normalizeText(text: string): string {",
        '  return text.replace(/\\s+/g, " ").trim().slice(0, 240);',
        "}",
        ""
      ].join("\n")}`
    },
    {
      path: "src/Home.test.tsx",
      content: `${[
        'import assert from "node:assert/strict";',
        'import { describe, it } from "node:test";',
        'import React from "react";',
        'import { renderToStaticMarkup } from "react-dom/server";',
        'import { Home } from "./Home";',
        "",
        'describe("Home", () => {',
        '  it("renders the competition highlight cards", () => {',
        "    const html = renderToStaticMarkup(<Home />);",
        "",
        '    assert.match(html, /比赛亮点/);',
        '    assert.match(html, /AI Pipeline/);',
        '    assert.match(html, /Human Review/);',
        '    assert.match(html, /自动交付/);',
        "  });",
        "});",
        ""
      ].join("\n")}`
    },
    {
      path: "src/styles.css",
      content: `${[
        ":root {",
        '  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;',
        "  color: #19231f;",
        "  background: #f6f3ea;",
        "}",
        "",
        "* {",
        "  box-sizing: border-box;",
        "}",
        "",
        "body {",
        "  margin: 0;",
        "  min-width: 320px;",
        "  min-height: 100vh;",
        "  background: linear-gradient(135deg, #f9f4e7 0%, #eaf2eb 54%, #eef5f8 100%);",
        "}",
        "",
        "button {",
        "  font: inherit;",
        "}",
        "",
        ".demoShell {",
        "  width: min(1080px, calc(100% - 32px));",
        "  margin: 0 auto;",
        "  padding: 56px 0;",
        "}",
        "",
        ".hero {",
        "  display: grid;",
        "  gap: 18px;",
        "  padding: 44px 0 34px;",
        "}",
        "",
        ".eyebrow {",
        "  margin: 0;",
        "  color: #1f6f52;",
        "  font-size: 0.82rem;",
        "  font-weight: 800;",
        "  letter-spacing: 0.08em;",
        "  text-transform: uppercase;",
        "}",
        "",
        "h1,",
        "h2,",
        "h3,",
        "p {",
        "  margin-top: 0;",
        "}",
        "",
        "h1 {",
        "  max-width: 760px;",
        "  margin-bottom: 0;",
        "  font-size: clamp(2.6rem, 8vw, 5.8rem);",
        "  line-height: 0.96;",
        "}",
        "",
        ".lead {",
        "  max-width: 720px;",
        "  color: #5f6d66;",
        "  font-size: 1.1rem;",
        "}",
        "",
        ".primaryAction {",
        "  width: fit-content;",
        "  border: 0;",
        "  border-radius: 999px;",
        "  padding: 0.85rem 1.25rem;",
        "  color: #fffaf0;",
        "  background: #19231f;",
        "}",
        "",
        ".highlights {",
        "  display: grid;",
        "  gap: 18px;",
        "  padding-top: 26px;",
        "  border-top: 1px solid rgba(25, 35, 31, 0.14);",
        "}",
        "",
        ".sectionHeader {",
        "  display: flex;",
        "  justify-content: space-between;",
        "  gap: 24px;",
        "  align-items: end;",
        "}",
        "",
        ".sectionHeader p {",
        "  max-width: 420px;",
        "  color: #5f6d66;",
        "}",
        "",
        ".highlightGrid {",
        "  display: grid;",
        "  grid-template-columns: repeat(3, minmax(0, 1fr));",
        "  gap: 16px;",
        "}",
        "",
        ".highlightCard {",
        "  min-height: 178px;",
        "  border: 1px solid rgba(25, 35, 31, 0.12);",
        "  border-radius: 8px;",
        "  padding: 22px;",
        "  background: rgba(255, 252, 244, 0.82);",
        "  box-shadow: 0 18px 52px rgba(25, 35, 31, 0.08);",
        "}",
        "",
        ".highlightCard h3 {",
        "  margin-bottom: 0.7rem;",
        "}",
        "",
        ".highlightCard p {",
        "  color: #5f6d66;",
        "}",
        "",
        ".devflowSelectMode {",
        "  cursor: crosshair;",
        "}",
        "",
        ".devflowSelectableHover {",
        "  outline: 2px solid #197663;",
        "  outline-offset: 4px;",
        "  box-shadow: 0 0 0 6px rgba(25, 118, 99, 0.12);",
        "}",
        "",
        "@media (max-width: 760px) {",
        "  .sectionHeader,",
        "  .highlightGrid {",
        "    grid-template-columns: 1fr;",
        "  }",
        "",
        "  .sectionHeader {",
        "    display: grid;",
        "    align-items: start;",
        "  }",
        "}",
        ""
      ].join("\n")}`
    }
  ];
}

function buildPreviewBridgeFile(): GeneratedFile {
  const bridgeFile = buildDevFlowFeatureFiles("").find((file) => file.path === "src/devflowPreviewBridge.ts");

  if (!bridgeFile) {
    throw new Error("Preview bridge template is missing.");
  }

  return bridgeFile;
}

function buildScheduleStyles(): string {
  return [
    ":root {",
    '  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;',
    "  color: #17211d;",
    "  background: #f5f7f3;",
    "}",
    "",
    "* {",
    "  box-sizing: border-box;",
    "}",
    "",
    "body {",
    "  margin: 0;",
    "  min-width: 320px;",
    "  min-height: 100vh;",
    "  background: linear-gradient(135deg, #f7faf5 0%, #edf4f7 42%, #f8f4ec 100%);",
    "}",
    "",
    "button {",
    "  font: inherit;",
    "}",
    "",
    ".scheduleShell {",
    "  width: min(1180px, calc(100% - 32px));",
    "  margin: 0 auto;",
    "  padding: 44px 0 64px;",
    "}",
    "",
    ".scheduleHero {",
    "  display: grid;",
    "  gap: 16px;",
    "  padding: 28px 0 22px;",
    "}",
    "",
    ".eyebrow {",
    "  margin: 0;",
    "  color: #1d6f66;",
    "  font-size: 0.78rem;",
    "  font-weight: 900;",
    "  letter-spacing: 0.08em;",
    "  text-transform: uppercase;",
    "}",
    "",
    "h1,",
    "h2,",
    "p {",
    "  margin-top: 0;",
    "}",
    "",
    "h1 {",
    "  max-width: 860px;",
    "  margin-bottom: 0;",
    "  font-size: clamp(2.45rem, 7vw, 5.2rem);",
    "  line-height: 0.98;",
    "}",
    "",
    ".lead {",
    "  max-width: 720px;",
    "  margin-bottom: 0;",
    "  color: #5f6d66;",
    "  font-size: 1.05rem;",
    "}",
    "",
    ".notice {",
    "  max-width: 920px;",
    "  border: 1px solid rgba(188, 137, 54, 0.22);",
    "  border-radius: 8px;",
    "  padding: 12px 14px;",
    "  color: #6d4f16;",
    "  background: rgba(255, 247, 226, 0.82);",
    "}",
    "",
    ".tournamentTabs {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  gap: 10px;",
    "  margin: 18px 0;",
    "}",
    "",
    ".tab {",
    "  border: 1px solid rgba(23, 33, 29, 0.14);",
    "  border-radius: 8px;",
    "  padding: 0.74rem 1rem;",
    "  color: #17211d;",
    "  background: rgba(255, 255, 255, 0.74);",
    "  cursor: pointer;",
    "}",
    "",
    ".tab.active {",
    "  color: #fff;",
    "  border-color: #1d6f66;",
    "  background: #1d6f66;",
    "}",
    "",
    ".summaryGrid {",
    "  display: grid;",
    "  grid-template-columns: repeat(4, minmax(0, 1fr));",
    "  gap: 12px;",
    "  margin-bottom: 18px;",
    "}",
    "",
    ".summaryGrid article {",
    "  border: 1px solid rgba(23, 33, 29, 0.1);",
    "  border-radius: 8px;",
    "  padding: 16px;",
    "  background: rgba(255, 255, 255, 0.78);",
    "  box-shadow: 0 14px 38px rgba(23, 33, 29, 0.07);",
    "}",
    "",
    ".summaryGrid span {",
    "  display: block;",
    "  color: #69766f;",
    "  font-size: 0.78rem;",
    "}",
    "",
    ".summaryGrid strong {",
    "  display: block;",
    "  margin-top: 0.35rem;",
    "  color: #1d6f66;",
    "  font-size: 1.35rem;",
    "}",
    "",
    ".scheduleBoard {",
    "  display: grid;",
    "  gap: 18px;",
    "  border: 1px solid rgba(23, 33, 29, 0.12);",
    "  border-radius: 8px;",
    "  padding: 20px;",
    "  background: rgba(255, 255, 255, 0.76);",
    "  box-shadow: 0 18px 52px rgba(23, 33, 29, 0.08);",
    "}",
    "",
    ".scheduleBoard h2 {",
    "  margin-bottom: 0.4rem;",
    "}",
    "",
    ".scheduleBoard p {",
    "  color: #5f6d66;",
    "}",
    "",
    ".matchList {",
    "  display: grid;",
    "  gap: 10px;",
    "}",
    "",
    ".matchCard {",
    "  display: grid;",
    "  grid-template-columns: 220px minmax(0, 1fr) 150px;",
    "  gap: 14px;",
    "  align-items: center;",
    "  border: 1px solid rgba(23, 33, 29, 0.1);",
    "  border-left: 4px solid #1d6f66;",
    "  border-radius: 8px;",
    "  padding: 14px;",
    "  background: #fff;",
    "}",
    "",
    ".matchCard.resultPending {",
    "  border-left-color: #bc8936;",
    "}",
    "",
    ".matchMeta {",
    "  display: grid;",
    "  gap: 4px;",
    "}",
    "",
    ".matchMeta span,",
    ".matchMeta small,",
    ".resultBox span {",
    "  color: #69766f;",
    "  font-size: 0.78rem;",
    "}",
    "",
    ".matchMeta strong {",
    "  color: #17211d;",
    "}",
    "",
    ".teams {",
    "  display: grid;",
    "  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);",
    "  gap: 12px;",
    "  align-items: center;",
    "  color: #17211d;",
    "  font-weight: 850;",
    "}",
    "",
    ".teams span {",
    "  overflow-wrap: anywhere;",
    "}",
    "",
    ".teams b {",
    "  border-radius: 999px;",
    "  padding: 0.2rem 0.55rem;",
    "  color: #1d6f66;",
    "  background: rgba(29, 111, 102, 0.1);",
    "  font-size: 0.78rem;",
    "}",
    "",
    ".resultBox {",
    "  display: grid;",
    "  justify-items: end;",
    "  gap: 4px;",
    "}",
    "",
    ".resultBox strong {",
    "  color: #1d6f66;",
    "}",
    "",
    ".resultPending .resultBox strong {",
    "  color: #9a661c;",
    "}",
    "",
    ".devflowSelectMode {",
    "  cursor: crosshair;",
    "}",
    "",
    ".devflowSelectableHover {",
    "  outline: 2px solid #197663;",
    "  outline-offset: 4px;",
    "  box-shadow: 0 0 0 6px rgba(25, 118, 99, 0.12);",
    "}",
    "",
    "@media (max-width: 880px) {",
    "  .summaryGrid {",
    "    grid-template-columns: repeat(2, minmax(0, 1fr));",
    "  }",
    "",
    "  .matchCard {",
    "    grid-template-columns: 1fr;",
    "  }",
    "",
    "  .resultBox {",
    "    justify-items: start;",
    "  }",
    "}",
    "",
    "@media (max-width: 560px) {",
    "  .summaryGrid {",
    "    grid-template-columns: 1fr;",
    "  }",
    "",
    "  .teams {",
    "    grid-template-columns: 1fr;",
    "  }",
    "}",
    ""
  ].join("\n");
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return normalizeNewlines(await readFile(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function buildWholeFileDiff(path: string, oldContent: string, newContent: string): string {
  const oldLines = splitDiffLines(oldContent);
  const newLines = splitDiffLines(newContent);
  const removed = oldLines.map((line) => `-${line}`).join("\n");
  const added = newLines.map((line) => `+${line}`).join("\n");

  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    removed,
    added
  ]
    .filter(Boolean)
    .join("\n");
}

function splitDiffLines(content: string): string[] {
  const normalized = normalizeNewlines(content).replace(/\n$/, "");
  return normalized ? normalized.split("\n") : [];
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= 96) {
    return normalized;
  }

  return `${normalized.slice(0, 96)}...`;
}

function applyManagedRefinementBlock(content: string, block: string): string {
  const normalized = normalizeNewlines(content).replace(/\n*$/, "\n");
  const nextBlock = [
    "/* devflow-refinement:start */",
    block.trim(),
    "/* devflow-refinement:end */",
    ""
  ].join("\n");
  const markerPattern = /\/\* devflow-refinement:start \*\/[\s\S]*?\/\* devflow-refinement:end \*\/\n?/;

  if (markerPattern.test(normalized)) {
    return normalized.replace(markerPattern, nextBlock);
  }

  return `${normalized}\n${nextBlock}`;
}

function buildRefinementCss(input: RefinePipelineRequest): string {
  const selector = `[data-devflow-id="${escapeCssIdentifier(input.selectedElement.devflowId)}"]`;
  const instruction = input.instruction.toLowerCase();
  const selectedId = input.selectedElement.devflowId.toLowerCase();
  const rules = new Set<string>([
    "transition: all 180ms ease;"
  ]);
  const nestedRules: string[] = [];

  if (includesAny(instruction, ["删除", "移除", "去掉", "隐藏", "不显示", "不要显示", "没有必要"])) {
    rules.add("display: none !important;");
    rules.add("visibility: hidden;");
    rules.add("pointer-events: none;");
    return [
      `${selector} {`,
      ...[...rules].map((rule) => `  ${rule}`),
      "}"
    ].join("\n");
  }

  if (includesAny(instruction, ["紧凑", "收紧", "小一点", "更小"])) {
    rules.add("gap: 10px;");
    rules.add("padding: 16px;");
    rules.add("min-height: auto;");
    rules.add("font-size: 0.96em;");
    nestedRules.push(`${selector} .highlightGrid { gap: 10px; }`);
    nestedRules.push(`${selector} .highlightCard { min-height: 138px; padding: 16px; }`);
  }

  if (includesAny(instruction, ["间距", "留白", "更大", "宽松"]) && !includesAny(instruction, ["紧凑", "收紧"])) {
    rules.add("gap: 26px;");
    rules.add("padding-block: 34px;");
    nestedRules.push(`${selector} .highlightGrid { gap: 24px; }`);
    nestedRules.push(`${selector} .highlightCard { padding: 26px; }`);
  }

  if (includesAny(instruction, ["放大", "大一点", "字号", "字体大", "更大"])) {
    rules.add("font-size: 1.08em;");
    rules.add("transform: scale(1.01);");
  }

  if (includesAny(instruction, ["加粗", "粗体", "更粗"])) {
    rules.add("font-weight: 850;");
  }

  if (includesAny(instruction, ["居中", "居中对齐"])) {
    rules.add("text-align: center;");
    rules.add("justify-items: center;");
  }

  if (includesAny(instruction, ["醒目", "突出", "标题", "强调", "更亮"])) {
    rules.add("color: #174f43;");
    rules.add("font-weight: 850;");
    rules.add("text-wrap: balance;");
    if (/^h[1-6]$/i.test(input.selectedElement.tagName) || selectedId.includes("title")) {
      rules.add("text-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);");
    }
    nestedRules.push(`${selector} h1, ${selector} h2, ${selector} h3 { color: #174f43; font-weight: 850; }`);
    nestedRules.push(`${selector} h2, ${selector} h3 { font-size: 1.18em; }`);
  }

  if (includesAny(instruction, ["圆角", "柔和"])) {
    rules.add("border-radius: 14px;");
    nestedRules.push(`${selector} .highlightCard { border-radius: 14px; }`);
  }

  if (includesAny(instruction, ["边框", "描边"])) {
    rules.add("border: 1px solid rgba(25, 118, 99, 0.36);");
  }

  if (includesAny(instruction, ["阴影", "立体", "浮起"])) {
    rules.add("box-shadow: 0 18px 46px rgba(25, 35, 31, 0.14);");
  }

  if (includesAny(instruction, ["浅", "淡", "轻", "干净"])) {
    rules.add("background: rgba(255, 255, 255, 0.9);");
    rules.add("box-shadow: 0 12px 34px rgba(25, 35, 31, 0.07);");
  }

  const requestedColor = getRequestedColor(instruction);
  if (requestedColor) {
    if (includesAny(instruction, ["背景", "底色", "卡片", "区域"])) {
      rules.add(`background: ${requestedColor.background};`);
      rules.add(`border-color: ${requestedColor.border};`);
      rules.add(`color: ${requestedColor.text};`);
    } else {
      rules.add(`color: ${requestedColor.accent};`);
      rules.add(`border-color: ${requestedColor.border};`);
    }
  }

  if (selectedId.includes("card")) {
    rules.add("border-color: rgba(25, 118, 99, 0.42);");
    rules.add("box-shadow: 0 18px 48px rgba(25, 35, 31, 0.16);");
  }

  if (rules.size === 1 && nestedRules.length === 0) {
    rules.add("outline: 2px solid rgba(25, 118, 99, 0.34);");
    rules.add("outline-offset: 4px;");
    rules.add("background: rgba(232, 248, 243, 0.95);");
    rules.add("box-shadow: 0 18px 46px rgba(25, 35, 31, 0.14);");
  }

  return [
    `${selector} {`,
    ...[...rules].map((rule) => `  ${rule}`),
    "}",
    ...nestedRules
  ].join("\n");
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function getRequestedColor(value: string): {
  accent: string;
  background: string;
  border: string;
  text: string;
} | undefined {
  if (includesAny(value, ["红色", "红"])) {
    return {
      accent: "#b42318",
      background: "rgba(254, 226, 226, 0.9)",
      border: "rgba(180, 35, 24, 0.28)",
      text: "#7a271a"
    };
  }

  if (includesAny(value, ["蓝色", "蓝"])) {
    return {
      accent: "#175cd3",
      background: "rgba(219, 234, 254, 0.88)",
      border: "rgba(23, 92, 211, 0.28)",
      text: "#1849a9"
    };
  }

  if (includesAny(value, ["绿色", "绿"])) {
    return {
      accent: "#147d64",
      background: "rgba(209, 250, 229, 0.82)",
      border: "rgba(20, 125, 100, 0.28)",
      text: "#05603a"
    };
  }

  if (includesAny(value, ["黄色", "黄"])) {
    return {
      accent: "#b54708",
      background: "rgba(254, 240, 199, 0.9)",
      border: "rgba(181, 71, 8, 0.26)",
      text: "#7a2e0e"
    };
  }

  if (includesAny(value, ["紫色", "紫"])) {
    return {
      accent: "#6941c6",
      background: "rgba(237, 233, 254, 0.9)",
      border: "rgba(105, 65, 198, 0.28)",
      text: "#4a1fb8"
    };
  }

  return undefined;
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
