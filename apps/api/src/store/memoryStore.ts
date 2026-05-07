import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PipelineRun } from "@devflow/shared";

export class MemoryPipelineStore {
  private readonly pipelines = new Map<string, PipelineRun>();

  constructor(private readonly storageFilePath?: string) {
    this.loadFromDisk();
  }

  list(): PipelineRun[] {
    return [...this.pipelines.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): PipelineRun | undefined {
    return this.pipelines.get(id);
  }

  save(pipeline: PipelineRun): PipelineRun {
    const updated = {
      ...pipeline,
      updatedAt: new Date().toISOString()
    };

    this.pipelines.set(updated.id, updated);
    this.persistToDisk();
    return updated;
  }

  private loadFromDisk(): void {
    if (!this.storageFilePath || !existsSync(this.storageFilePath)) {
      return;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.storageFilePath, "utf8")) as unknown;
      const pipelines = Array.isArray(parsed) ? parsed : (parsed as { pipelines?: unknown }).pipelines;

      if (!Array.isArray(pipelines)) {
        return;
      }

      for (const item of pipelines) {
        if (isPipelineRun(item)) {
          this.pipelines.set(item.id, item);
        }
      }
    } catch {
      this.pipelines.clear();
    }
  }

  private persistToDisk(): void {
    if (!this.storageFilePath) {
      return;
    }

    mkdirSync(dirname(this.storageFilePath), { recursive: true });
    writeFileSync(
      this.storageFilePath,
      JSON.stringify(
        {
          pipelines: this.list()
        },
        null,
        2
      ),
      "utf8"
    );
  }
}

function isPipelineRun(value: unknown): value is PipelineRun {
  if (!value || typeof value !== "object") {
    return false;
  }

  const pipeline = value as Partial<PipelineRun>;
  return (
    typeof pipeline.id === "string" &&
    typeof pipeline.requirement === "string" &&
    typeof pipeline.createdAt === "string" &&
    Array.isArray(pipeline.stages)
  );
}
