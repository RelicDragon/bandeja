export function formatReleaseElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export type ListrTitleTask = {
  title: string;
};

export class ReleaseProgressTimer {
  private readonly startedAt: number;
  private stepStartedAt: number | null = null;
  private stepBaseTitle = '';
  private activeTask: ListrTitleTask | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(startedAt = Date.now()) {
    this.startedAt = startedAt;
  }

  formatTitle(baseTitle: string, at = Date.now(), stepStartedAt = this.stepStartedAt): string {
    const total = formatReleaseElapsed(at - this.startedAt);
    const stepMs = stepStartedAt ? at - stepStartedAt : 0;
    const step = formatReleaseElapsed(stepMs);
    return `${baseTitle} (step ${step} · total ${total})`;
  }

  trackStep(task: ListrTitleTask, baseTitle: string): () => void {
    this.stopInterval();
    this.stepStartedAt = Date.now();
    this.stepBaseTitle = baseTitle;
    this.activeTask = task;
    task.title = this.formatTitle(baseTitle);
    this.interval = setInterval(() => {
      if (this.activeTask && this.stepStartedAt) {
        this.activeTask.title = this.formatTitle(this.stepBaseTitle);
      }
    }, 1000);
    this.interval.unref();
    return () => this.stopStep();
  }

  dispose(): void {
    this.stopStep();
  }

  get totalElapsedLabel(): string {
    return formatReleaseElapsed(Date.now() - this.startedAt);
  }

  private stopStep(): void {
    this.stopInterval();
    if (this.activeTask && this.stepStartedAt) {
      const finishedAt = Date.now();
      this.activeTask.title = this.formatTitle(
        this.stepBaseTitle,
        finishedAt,
        this.stepStartedAt,
      );
    }
    this.activeTask = null;
    this.stepStartedAt = null;
    this.stepBaseTitle = '';
  }

  private stopInterval(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export function timedListrTask(
  timer: ReleaseProgressTimer,
  baseTitle: string,
  run: () => Promise<void>,
): { title: string; task: (ctx: unknown, task: ListrTitleTask) => Promise<void> } {
  return {
    title: baseTitle,
    task: async (_ctx, task) => {
      const stop = timer.trackStep(task, baseTitle);
      try {
        await run();
      } finally {
        stop();
      }
    },
  };
}
