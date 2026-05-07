import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import type {
  CodeContextFile,
  CodeContextSkippedItem,
  CodeContextSnapshot,
  CodeContextTreeEntry,
  PipelineRun,
  PipelineStage,
  StageArtifact
} from "@devflow/shared";
import { findProjectRoot, resolveWorkspaceTarget, toPosixPath } from "./workspacePaths.js";

export interface CodeContextInput {
  pipeline: PipelineRun;
  stage: PipelineStage;
  previousArtifacts: StageArtifact[];
}

export interface CodeContextService {
  collect(input: CodeContextInput): Promise<CodeContextSnapshot | undefined>;
}

export class NoopCodeContextService implements CodeContextService {
  async collect(_input: CodeContextInput): Promise<CodeContextSnapshot | undefined> {
    return undefined;
  }
}

export function createCodeContextService(rootDirectory = findProjectRoot()): CodeContextService {
  return new LocalCodeContextService(rootDirectory);
}

const DEFAULT_CONTEXT_BUDGET = {
  maxTreeEntries: 120,
  maxTreeDepth: 4,
  maxFiles: 8,
  maxFileBytes: 20_000,
  maxTotalBytes: 80_000
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

const BINARY_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".pdf",
  ".png",
  ".webp",
  ".zip"
]);

class LocalCodeContextService implements CodeContextService {
  constructor(private readonly rootDirectory: string) {}

  async collect({ pipeline, stage, previousArtifacts }: CodeContextInput): Promise<CodeContextSnapshot> {
    const targetRepoPath = pipeline.targetRepoPath ?? "workspace/demo";
    const targetDirectory = resolveWorkspaceTarget(this.rootDirectory, targetRepoPath);
    const tree = await collectTree(targetDirectory);
    const requestedPaths = buildContextPathCandidates(pipeline, stage, previousArtifacts);
    const files: CodeContextFile[] = [];
    const skipped: CodeContextSkippedItem[] = [];
    let usedBytes = 0;

    for (const path of requestedPaths) {
      if (files.length >= DEFAULT_CONTEXT_BUDGET.maxFiles) {
        skipped.push({ path, reason: "已达到上下文文件数量上限。" });
        continue;
      }

      const result = await readContextFile(targetDirectory, path, DEFAULT_CONTEXT_BUDGET, usedBytes);

      if ("skipped" in result) {
        skipped.push(result.skipped);
        continue;
      }

      files.push(result.file);
      usedBytes += Buffer.byteLength(result.file.content, "utf8");
    }

    return {
      targetRepoPath,
      collectedAt: new Date().toISOString(),
      tree,
      files,
      skipped,
      budget: {
        maxFiles: DEFAULT_CONTEXT_BUDGET.maxFiles,
        maxFileBytes: DEFAULT_CONTEXT_BUDGET.maxFileBytes,
        maxTotalBytes: DEFAULT_CONTEXT_BUDGET.maxTotalBytes,
        usedBytes
      }
    };
  }
}

async function collectTree(
  targetDirectory: string,
  currentDirectory = targetDirectory,
  depth = 0,
  entries: CodeContextTreeEntry[] = []
): Promise<CodeContextTreeEntry[]> {
  if (entries.length >= DEFAULT_CONTEXT_BUDGET.maxTreeEntries || depth > DEFAULT_CONTEXT_BUDGET.maxTreeDepth) {
    return entries;
  }

  const children = await readdir(currentDirectory, { withFileTypes: true }).catch(() => undefined);

  if (!children) {
    return entries;
  }

  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entries.length >= DEFAULT_CONTEXT_BUDGET.maxTreeEntries) {
      break;
    }

    if (child.isDirectory() && IGNORED_DIRECTORIES.has(child.name)) {
      continue;
    }

    const absolutePath = resolve(currentDirectory, child.name);
    const relativePath = toPosixPath(relative(targetDirectory, absolutePath));

    if (!relativePath || relativePath.startsWith("..")) {
      continue;
    }

    if (child.isDirectory()) {
      entries.push({ path: relativePath, kind: "directory" });
      await collectTree(targetDirectory, absolutePath, depth + 1, entries);
      continue;
    }

    if (!child.isFile()) {
      continue;
    }

    const fileStat = await stat(absolutePath).catch(() => undefined);
    entries.push({
      path: relativePath,
      kind: "file",
      sizeBytes: fileStat?.size
    });
  }

  return entries;
}

function buildContextPathCandidates(
  pipeline: PipelineRun,
  stage: PipelineStage,
  previousArtifacts: StageArtifact[]
): string[] {
  const candidates = new Set<string>();
  const targetRepoPath = toPosixPath(pipeline.targetRepoPath ?? "workspace/demo");

  for (const path of getStageDefaultPaths(stage.id)) {
    candidates.add(path);
  }

  for (const path of pipeline.contextPaths ?? []) {
    candidates.add(normalizeContextPath(path, targetRepoPath));
  }

  if (["code-generation", "test-generation", "code-review", "delivery"].includes(stage.id)) {
    for (const artifact of previousArtifacts) {
      for (const path of extractLikelyPaths(artifact.markdown, targetRepoPath)) {
        candidates.add(path);
      }
    }
  }

  return [...candidates].filter(Boolean);
}

function getStageDefaultPaths(stageId: string): string[] {
  const common = ["package.json", "README.md"];

  if (stageId === "requirement-analysis") {
    return common;
  }

  if (stageId === "solution-design") {
    return [...common, "src/Home.tsx", "src/styles.css", "src/types.ts", "src/data/championsLeague.ts", "src/data/worldCup.ts"];
  }

  if (stageId === "code-generation") {
    return [
      "src/Home.tsx",
      "src/Home.test.tsx",
      "src/styles.css",
      "src/types.ts",
      "src/data/championsLeague.ts",
      "src/data/worldCup.ts",
      "src/constants.ts",
      "package.json"
    ];
  }

  if (stageId === "test-generation" || stageId === "code-review") {
    return ["src/Home.tsx", "src/Home.test.tsx", "src/types.ts", "src/data/championsLeague.ts", "src/data/worldCup.ts", "package.json"];
  }

  return common;
}

function extractLikelyPaths(markdown: string, targetRepoPath: string): string[] {
  const matches = markdown.match(/[`'"]?((?:workspace\/[A-Za-z0-9._/-]+)|(?:src\/[A-Za-z0-9._/-]+)|(?:[A-Za-z0-9._-]+\.json))[`'"]?/g) ?? [];

  return matches.map((match) => normalizeContextPath(match.replace(/^[`'"]|[`'"]$/g, ""), targetRepoPath));
}

function normalizeContextPath(path: string, targetRepoPath: string): string {
  const normalized = toPosixPath(path.trim()).replace(/^\/+/, "");
  const targetPrefix = `${targetRepoPath.replace(/\/+$/, "")}/`;

  if (normalized.startsWith(targetPrefix)) {
    return normalized.slice(targetPrefix.length);
  }

  return normalized;
}

async function readContextFile(
  targetDirectory: string,
  requestedPath: string,
  budget: typeof DEFAULT_CONTEXT_BUDGET,
  usedBytes: number
): Promise<{ file: CodeContextFile } | { skipped: CodeContextSkippedItem }> {
  const normalizedPath = normalizeContextPath(requestedPath, "");
  const absolutePath = resolve(targetDirectory, normalizedPath);
  const relativePath = toPosixPath(relative(targetDirectory, absolutePath));

  if (!relativePath || relativePath.startsWith("..")) {
    return { skipped: { path: requestedPath, reason: "路径超出目标仓库范围。" } };
  }

  if (BINARY_EXTENSIONS.has(getLowerExtension(relativePath))) {
    return { skipped: { path: relativePath, reason: "跳过二进制或媒体文件。" } };
  }

  const fileStat = await stat(absolutePath).catch(() => undefined);

  if (!fileStat) {
    return { skipped: { path: relativePath, reason: "文件不存在。" } };
  }

  if (!fileStat.isFile()) {
    return { skipped: { path: relativePath, reason: "不是普通文本文件。" } };
  }

  const remainingBytes = budget.maxTotalBytes - usedBytes;
  if (remainingBytes <= 0) {
    return { skipped: { path: relativePath, reason: "已达到上下文总大小上限。" } };
  }

  const contentBuffer = await readFile(absolutePath);

  if (looksBinary(contentBuffer)) {
    return { skipped: { path: relativePath, reason: "文件内容看起来是二进制。" } };
  }

  const maxBytes = Math.min(budget.maxFileBytes, remainingBytes);
  const truncated = contentBuffer.length > maxBytes;
  const content = contentBuffer.subarray(0, maxBytes).toString("utf8");

  return {
    file: {
      path: relativePath,
      content,
      sizeBytes: contentBuffer.length,
      truncated
    }
  };
}

function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  return sample.includes(0);
}

function getLowerExtension(path: string): string {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index).toLowerCase() : "";
}
