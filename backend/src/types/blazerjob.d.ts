declare module 'blazerjob' {
  export class BlazerJob {
    constructor(config: { dbPath: string });
    init(): Promise<void>;
    schedule(taskName: string, payload: any, runAt: number): Promise<void>;
  }
}
