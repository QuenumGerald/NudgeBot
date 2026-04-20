declare module "blazerjob" {
  interface ScheduleOptions {
    runAt?: Date | string;
    maxRuns?: number;
    maxDurationMs?: number;
    interval?: number;
    priority?: number;
    retriesLeft?: number;
    type?: string;
    config?: string;
    webhookUrl?: string;
    onEnd?: (stats: { runCount: number; errorCount: number }) => void;
  }

  interface BlazeJobOptions {
    storage?: "memory" | "sqlite";
    dbPath?: string;
    concurrency?: number;
    autoExit?: boolean;
    encryptionKey?: string;
    debug?: boolean;
  }

  export class BlazeJob {
    constructor(options?: BlazeJobOptions);
    schedule(fn: (() => Promise<void>) | null, options: ScheduleOptions): number;
    start(): Promise<void>;
    stop(): void;
    getTasks(): any[];
    deleteTask(taskId: number): void;
  }

  export function startServer(port?: number): Promise<void>;
  export function stopServer(): Promise<void>;
}
