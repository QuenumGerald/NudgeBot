declare module 'blazerjob' {
  export type JobStats = {
    runs: number;
    successes: number;
    failures: number;
    lastError?: string;
  };

  export type ScheduleOptions = {
    runAt: Date;
    interval?: number;
    maxRuns?: number;
    onEnd?: (stats: JobStats) => void;
  };

  export class BlazeJob {
    constructor(config?: { concurrency?: number });
    schedule(task: () => Promise<void> | void, options: ScheduleOptions): void;
  }
}
