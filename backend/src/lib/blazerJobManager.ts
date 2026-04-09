/**
 * Singleton BlazeJob manager.
 * BlazeJob stores task metadata in SQLite but task functions are in-memory,
 * so recurring tasks must be re-registered on every startup.
 */

import path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BlazeJob } = require("blazerjob");

export interface TaskRow {
  id: number;
  runAt: string;
  interval: number | null;
  priority: number;
  retriesLeft: number;
  type: string;
  config: string | null;
  webhookUrl: string | null;
  status: "pending" | "running" | "success" | "failed";
  executed_at: string | null;
  created_at: string;
  lastError: string | null;
}

let blazer: InstanceType<typeof BlazeJob> | null = null;

const getDbPath = () =>
  path.resolve(
    process.env.DATABASE_URL || path.join(process.cwd(), "nudgebot.sqlite")
  );

export const getBlazer = (): InstanceType<typeof BlazeJob> => {
  if (!blazer) {
    blazer = new BlazeJob({ dbPath: getDbPath(), concurrency: 5 });
    blazer.start();
    console.log("[blazer] scheduler started");
  }
  return blazer;
};

/**
 * Schedule a one-off task.
 * Returns the task ID (number).
 */
export const scheduleOnce = (
  name: string,
  fn: () => Promise<void>,
  delayMs: number
): number => {
  return getBlazer().schedule(fn, {
    runAt: new Date(Date.now() + delayMs),
    type: "custom",
    config: { name },
    priority: 0,
    retriesLeft: 0,
  });
};

/**
 * Schedule a recurring task that re-runs every intervalMs.
 * Cleans up stale DB rows with the same name first (so restarts don't pile up).
 * Returns the task ID.
 */
export const scheduleRecurring = (
  name: string,
  fn: () => Promise<void>,
  intervalMs: number
): number => {
  // Remove stale rows from previous runs
  cancelTasksByName(name);

  return getBlazer().schedule(fn, {
    runAt: new Date(Date.now() + intervalMs),
    interval: intervalMs,
    type: "custom",
    config: { name },
    priority: 0,
    retriesLeft: 0,
  });
};

/** List all tasks from the DB. */
export const listTasks = (): TaskRow[] => getBlazer().getTasks() as TaskRow[];

/** Cancel (delete) a task by its numeric ID. */
export const cancelTask = (taskId: number): void => {
  const db = (getBlazer() as any).db;
  db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
  (getBlazer() as any).taskFns?.delete(taskId);
  (getBlazer() as any).taskRunStats?.delete(taskId);
};

/** Cancel all tasks whose config JSON contains a given name. */
export const cancelTasksByName = (name: string): void => {
  const tasks: TaskRow[] = listTasks();
  for (const t of tasks) {
    try {
      const cfg = t.config ? JSON.parse(t.config) : {};
      if (cfg.name === name) cancelTask(t.id);
    } catch {
      // ignore parse errors
    }
  }
};
