declare module "blazerjob" {
  interface ScheduleOptions {
    runAt?: Date;
    maxRuns?: number;
    interval?: number;
    onEnd?: () => void;
  }

  export class BlazeJob {
    constructor(options?: { concurrency?: number });
    schedule(fn: () => Promise<void>, options: ScheduleOptions): void;
    start(): void;
    stop(): void;
  }
}
