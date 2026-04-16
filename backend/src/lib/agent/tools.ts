import { tool } from "@langchain/core/tools";
import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { BlazeJob } from "blazerjob";

const exec = promisify(execCallback);
const blazer = new BlazeJob({ concurrency: 16 });

// ── Workspace helpers ─────────────────────────────────────────────────────────

const getProjectsRoot = () => {
  const base = (process.env.NUDGEBOT_WORKDIR || path.join(process.cwd(), "workspace")).trim();
  return path.resolve(base, "projects");
};

const normalizeProjectName = (projectName: string) =>
  projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";

const resolveSafePath = (requestedPath: string) => {
  const workspaceRoot = process.cwd();
  const resolvedPath = path.resolve(workspaceRoot, requestedPath);
  const workspaceRootWithSep = `${workspaceRoot}${path.sep}`;

  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRootWithSep)) {
    throw new Error("Access denied: path must stay within the workspace.");
  }

  return resolvedPath;
};

// ── Task registry ─────────────────────────────────────────────────────────────

const taskRegistry = new Map<number, { name: string; description: string; createdAt: string }>();
let nextTaskId = 1;

// ── Tools ─────────────────────────────────────────────────────────────────────

export const createProjectWorkspaceTool = tool(
  async ({ projectName }: { projectName: string }) => {
    try {
      const projectsRoot = getProjectsRoot();
      const normalized = normalizeProjectName(projectName);
      const projectDir = path.join(projectsRoot, normalized);
      await fs.mkdir(projectDir, { recursive: true });
      return `Project workspace ready: ${projectDir}`;
    } catch (e: any) {
      return `Failed to create project workspace: ${e.message}`;
    }
  },
  {
    name: "create_project_workspace",
    description: "Creates (or reuses) a dedicated working subfolder for a project under the NudgeBot workspace.",
    schema: z.object({
      projectName: z.string().describe("Project name used to create a normalized subfolder."),
    }),
  }
);

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
    return `Task #${taskId} ('${task.name}') removed.`;
  },
  {
    name: "cancel_task",
    description: "Cancels a scheduled task by its ID.",
    schema: z.object({
      taskId: z.number().describe("The task ID to cancel."),
    }),
  }
);

export const createFileTool = tool(
  async ({ path: filePath, content, mode }: { path: string; content: string; mode: "write" | "append" }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

      const writeMode = mode === "append" ? "a" : "w";
      await fs.writeFile(resolvedPath, content, { encoding: "utf8", flag: writeMode });

      return `File ${mode === "append" ? "updated" : "created"} successfully at: ${filePath}`;
    } catch (e: any) {
      return `Failed to create/update file: ${e.message}`;
    }
  },
  {
    name: "create_file",
    description: "Creates a file with the provided content, or appends to it.",
    schema: z.object({
      path: z.string().describe("Relative path to the file in the workspace."),
      content: z.string().describe("Content to write into the file."),
      mode: z.enum(["write", "append"]).default("write").describe("'write' to replace, 'append' to add."),
    }),
  }
);

export const readFileTool = tool(
  async ({ path: filePath }: { path: string }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf8");
      return content;
    } catch (e: any) {
      return `Failed to read file: ${e.message}`;
    }
  },
  {
    name: "read_file",
    description: "Reads and returns file content.",
    schema: z.object({
      path: z.string().describe("Relative path to the file in the workspace."),
    }),
  }
);

export const listDirectoryTool = tool(
  async ({ path: dirPath }: { path: string }) => {
    try {
      const resolvedPath = resolveSafePath(dirPath || ".");
      const items = await fs.readdir(resolvedPath, { withFileTypes: true });
      return items.map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`).join("\n");
    } catch (e: any) {
      return `Failed to list directory: ${e.message}`;
    }
  },
  {
    name: "list_directory",
    description: "Lists files and folders in a directory.",
    schema: z.object({
      path: z.string().default(".").describe("Relative path to the directory."),
    }),
  }
);

export const deleteFileTool = tool(
  async ({ path: filePath }: { path: string }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      await fs.unlink(resolvedPath);
      return `File deleted successfully: ${filePath}`;
    } catch (e: any) {
      return `Failed to delete file: ${e.message}`;
    }
  },
  {
    name: "delete_file",
    description: "Deletes a file.",
    schema: z.object({
      path: z.string().describe("Relative path to the file."),
    }),
  }
);

export const executeCommandTool = tool(
  async ({ command }: { command: string }) => {
    try {
      const { stdout, stderr } = await exec(command, {
        cwd: process.cwd(),
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });

      if (stderr && !stdout) {
        return `Command completed with stderr:\n${stderr}`;
      }

      return `Command output:\n${stdout}${stderr ? `\nStderr:\n${stderr}` : ""}`;
    } catch (e: any) {
      return `Failed to execute command: ${e.message}`;
    }
  },
  {
    name: "execute_command",
    description: "Executes a shell command from the workspace and returns output.",
    schema: z.object({
      command: z.string().describe("Shell command to execute."),
    }),
  }
);

export const julesSessionTool = tool(
  async ({ prompt, githubRepository, baseBranch, autoPr }: { prompt: string; githubRepository: string; baseBranch: string; autoPr: boolean }) => {
    if (!process.env.JULES_API_KEY) {
      return "JULES_API_KEY is missing. Configure it before using this tool.";
    }

    try {
      const { jules } = await import("@google/jules-sdk");
      const session = await jules.session({
        prompt,
        source: { github: githubRepository, baseBranch },
        autoPr,
      });

      const progress: string[] = [];
      for await (const activity of session.stream()) {
        if (activity.type === "progressUpdated") {
          progress.push(activity.title || "Progress updated");
        }
        if (activity.type === "sessionCompleted" || activity.type === "sessionFailed") {
          break;
        }
      }

      const outcome: any = await session.result();
      const prUrl = outcome?.pullRequest?.url || "";

      return JSON.stringify(
        {
          sessionId: session.id,
          progress,
          pullRequestUrl: prUrl || null,
          state: outcome?.state || null,
        },
        null,
        2
      );
    } catch (e: any) {
      return `Failed to run Jules session: ${e.message}`;
    }
  },
  {
    name: "run_jules_session",
    description: "Launches a Google Jules coding session and returns progress plus the resulting PR URL when available.",
    schema: z.object({
      prompt: z.string().describe("Task prompt sent to Jules."),
      githubRepository: z.string().describe("GitHub repository in owner/repo format."),
      baseBranch: z.string().default("main").describe("Base branch for Jules work."),
      autoPr: z.boolean().default(true).describe("Whether Jules should automatically create a pull request."),
    }),
  }
);

export const tools = [
  createProjectWorkspaceTool,
  scheduleTaskTool,
  listTasksTool,
  cancelTaskTool,
  createFileTool,
  readFileTool,
  listDirectoryTool,
  deleteFileTool,
  executeCommandTool,
  julesSessionTool,
];
