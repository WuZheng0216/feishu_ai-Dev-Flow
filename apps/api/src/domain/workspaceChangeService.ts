import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import type { PipelineRun } from "@devflow/shared";
import { findProjectRoot, resolveWorkspaceTarget, toPosixPath } from "./workspacePaths.js";

export interface WorkspaceChangeResult {
  changedFiles: string[];
  diff: string;
  summary: string;
}

export interface WorkspaceChangeService {
  applyCodeGeneration(pipeline: PipelineRun): Promise<WorkspaceChangeResult | undefined>;
}

export class NoopWorkspaceChangeService implements WorkspaceChangeService {
  async applyCodeGeneration(_pipeline: PipelineRun): Promise<WorkspaceChangeResult | undefined> {
    return undefined;
  }
}

export function createWorkspaceChangeService(rootDirectory = findProjectRoot(process.cwd())): WorkspaceChangeService {
  return new LocalWorkspaceChangeService(rootDirectory);
}

class LocalWorkspaceChangeService implements WorkspaceChangeService {
  constructor(private readonly rootDirectory: string) {}

  async applyCodeGeneration(pipeline: PipelineRun): Promise<WorkspaceChangeResult> {
    const targetDirectory = resolveWorkspaceTarget(
      this.rootDirectory,
      pipeline.targetRepoPath ?? "workspace/demo"
    );
    const files = buildDemoFeatureFiles(pipeline.requirement);
    const changedFiles: string[] = [];
    const patches: string[] = [];

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
          ? `已在 ${pipeline.targetRepoPath ?? "workspace/demo"} 写入 ${changedFiles.length} 个真实文件变更。`
          : `${pipeline.targetRepoPath ?? "workspace/demo"} 已经是目标状态，本次没有新的文件变更。`
    };
  }
}

interface GeneratedFile {
  path: string;
  content: string;
}

function buildDemoFeatureFiles(requirement: string): GeneratedFile[] {
  const requirementSummary = compactText(requirement);

  return [
    {
      path: "src/Home.tsx",
      content: `${[
        'import React from "react";',
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
        "  return (",
        '    <main className="demoShell">',
        '      <section className="hero">',
        '        <p className="eyebrow">DevFlow Demo Site</p>',
        "        <h1>AI 驱动的需求交付流程</h1>",
        `        <p className="lead">${requirementSummary}</p>`,
        '        <button className="primaryAction">开始体验</button>',
        "      </section>",
        "",
        '      <section className="highlights" aria-label="比赛亮点">',
        '        <div className="sectionHeader">',
        "          <h2>比赛亮点</h2>",
        "          <p>把演示重点压缩成评委一眼能看懂的三件事。</p>",
        "        </div>",
        '        <div className="highlightGrid">',
        "          {highlights.map((item) => (",
        '            <article className="highlightCard" key={item.title}>',
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
