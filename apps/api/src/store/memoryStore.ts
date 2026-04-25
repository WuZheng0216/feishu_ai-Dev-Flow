import type { PipelineRun } from "@devflow/shared";

export class MemoryPipelineStore {
  private readonly pipelines = new Map<string, PipelineRun>();

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
    return updated;
  }
}
