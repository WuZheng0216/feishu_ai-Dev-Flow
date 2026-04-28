import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

export function findProjectRoot(startDirectory = process.cwd()): string {
  let current = resolve(startDirectory);

  while (true) {
    if (existsSync(join(current, "tsconfig.base.json")) && existsSync(join(current, "package.json"))) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current || parse(current).root === current) {
      return resolve(startDirectory);
    }

    current = parent;
  }
}

export function resolveWorkspaceTarget(rootDirectory: string, targetRepoPath: string): string {
  const targetDirectory = resolve(rootDirectory, targetRepoPath);
  const relativeTarget = toPosixPath(relative(rootDirectory, targetDirectory));

  if (isAbsolute(relativeTarget) || relativeTarget.startsWith("..")) {
    throw new Error("Workspace target must stay inside the DevFlow project directory.");
  }

  if (relativeTarget !== "workspace" && !relativeTarget.startsWith("workspace/")) {
    throw new Error("Workspace operations are currently limited to workspace/* targets.");
  }

  return targetDirectory;
}

export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}
