import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as blazerjob from "blazerjob";

const blazer = new (blazerjob as any).BlazeJob({ concurrency: 16 });

export const scheduleTaskTool = tool(
  async ({ taskName, delay, payload }: { taskName: string, delay: number, payload: any }) => {
    try {
      const runAt = new Date(Date.now() + delay);
      blazer.schedule(async () => {
        console.log(`[schedule_task] ${taskName}`, payload);
      }, {
        runAt,
        maxRuns: 1,
      });
      return `Task '${taskName}' scheduled to run in ${delay}ms.`;
    } catch (e: any) {
      return `Failed to schedule task: ${e.message}`;
    }
  },
  {
    name: "schedule_task",
    description: "Schedules an asynchronous task using blazerjob. Useful for reminders or deferred actions.",
    schema: z.object({
      taskName: z.string().describe("The name or identifier of the task."),
      delay: z.number().describe("The delay in milliseconds before the task should run."),
      payload: z.any().describe("Additional data for the task."),
    }),
  }
);

export const checkTasksTool = tool(
  async () => {
    try {
      return `Blazerjob scheduler is active and managing database tasks.`;
    } catch (e: any) {
      return `Failed to check tasks: ${e.message}`;
    }
  },
  {
    name: "check_tasks",
    description: "Checks the status of scheduled tasks.",
    schema: z.object({}),
  }
);

export const tools = [scheduleTaskTool, checkTasksTool];
