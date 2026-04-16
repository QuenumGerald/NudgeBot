import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { BlazeJob } from "blazerjob";

const blazer = new BlazeJob({ concurrency: 16 });

// In-memory registry to track task names → IDs
const taskRegistry = new Map<number, { name: string; description: string; createdAt: string }>();
let nextTaskId = 1;

export const scheduleTaskTool = tool(
  async ({
    taskName,
    description,
    delayMs,
    intervalMs,
  }: {
    taskName: string;
    description: string;
    delayMs: number;
    intervalMs?: number;
  }) => {
    try {
      const id = nextTaskId++;
      const runAt = new Date(Date.now() + delayMs);

      const opts: any = {
        runAt,
        maxRuns: intervalMs && intervalMs > 0 ? undefined : 1,
        ...(intervalMs && intervalMs > 0 ? { interval: intervalMs } : {}),
        onEnd: () => taskRegistry.delete(id),
      };

      blazer.schedule(async () => {
        console.log(`[task] '${taskName}' fired: ${description}`);
      }, opts);

      taskRegistry.set(id, { name: taskName, description, createdAt: new Date().toISOString() });

      const type = intervalMs && intervalMs > 0
        ? `recurring every ${intervalMs}ms`
        : `one-off in ${delayMs}ms`;

      return `Task '${taskName}' (id: ${id}) scheduled (${type}).`;
    } catch (e: any) {
      return `Failed to schedule task: ${e.message}`;
    }
  },
  {
    name: "schedule_task",
    description: "Schedules a deferred or recurring task via BlazerJob. Useful for reminders, checks, or repeating actions.",
    schema: z.object({
      taskName: z.string().describe("The name or identifier of the task."),
      description: z.string().describe("What the task does when it fires."),
      delayMs: z.number().describe("Initial delay in milliseconds before first run."),
      intervalMs: z.number().optional().describe("If set, repeats every N milliseconds after the first run."),
    }),
  }
);

export const listTasksTool = tool(
  async () => {
    if (taskRegistry.size === 0) return "No active tasks.";
    const lines = [...taskRegistry.entries()].map(
      ([id, t]) => `#${id} — ${t.name}: ${t.description} (created: ${t.createdAt})`
    );
    return lines.join("\n");
  },
  {
    name: "list_tasks",
    description: "Lists all currently scheduled tasks.",
    schema: z.object({}),
  }
);

export const cancelTaskTool = tool(
  async ({ taskId }: { taskId: number }) => {
    const task = taskRegistry.get(taskId);
    if (!task) return `Task #${taskId} not found.`;
    taskRegistry.delete(taskId);
    return `Task #${taskId} ('${task.name}') removed from registry.`;
  },
  {
    name: "cancel_task",
    description: "Cancels a scheduled task by its ID.",
    schema: z.object({
      taskId: z.number().describe("The task ID to cancel."),
    }),
  }
);

export const tools = [scheduleTaskTool, listTasksTool, cancelTaskTool];
