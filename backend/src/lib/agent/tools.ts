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

export const normalizeProjectName = (projectName: string) =>
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
  async ({ prompt, githubRepository, baseBranch, autoPr }: { prompt: string; githubRepository?: string; baseBranch?: string; autoPr: boolean }) => {
    if (!process.env.JULES_API_KEY) {
      return "JULES_API_KEY is missing. Configure it before using this tool.";
    }

    try {
      const { jules } = await import("@google/jules-sdk");
      const runConfig: any = {
        prompt,
        requireApproval: false,
        autoPr,
      };
      if (githubRepository) {
        runConfig.source = { github: githubRepository, baseBranch: baseBranch || "main" };
      }
      const run = await jules.run(runConfig);

      const progress: string[] = [];
      const planSteps: string[] = [];
      const agentMessages: string[] = [];
      const changeStats: Array<{ path: string; additions: number; deletions: number }> = [];
      const bashLogs: string[] = [];
      const streamWarmupTimeoutMs = 30000;
      const streamRetryDelayMs = 1500;
      const startedAt = Date.now();

      while (true) {
        try {
          for await (const activity of run.stream()) {
            if (activity.type === "progressUpdated") {
              progress.push(activity.title || "Progress updated");
            }
            if (activity.type === "planGenerated") {
              for (const step of activity.plan.steps) {
                if (step.title) {
                  planSteps.push(step.title);
                }
              }
            }
            if (activity.type === "agentMessaged" && activity.message) {
              agentMessages.push(activity.message);
            }
            for (const artifact of activity.artifacts ?? []) {
              if (artifact.type === "changeSet") {
                const parsed = artifact.parsed();
                for (const file of parsed.files) {
                  changeStats.push({
                    path: file.path,
                    additions: file.additions,
                    deletions: file.deletions,
                  });
                }
              }
              if (artifact.type === "bashOutput") {
                bashLogs.push(artifact.toString());
              }
            }
            if (activity.type === "sessionCompleted" || activity.type === "sessionFailed") {
              break;
            }
          }
          break;
        } catch (streamError: any) {
          const message = String(streamError?.message || "");
          const isNotReadyError = /active|not\s+ready|not\s+started|no\s+activities/i.test(message);
          const stillWithinWarmupWindow = Date.now() - startedAt < streamWarmupTimeoutMs;

          if (!isNotReadyError || !stillWithinWarmupWindow) {
            throw streamError;
          }

          await new Promise((resolve) => setTimeout(resolve, streamRetryDelayMs));
        }
      }

      const outcome = await run.result();
      const prUrl = outcome.pullRequest?.url || "";
      const generatedFiles = outcome.generatedFiles ? outcome.generatedFiles().map((f: any) => ({ path: f.path, content: f.content })) : [];

      return JSON.stringify(
        {
          sessionId: run.id,
          planSteps,
          progress,
          agentMessages: agentMessages.slice(-5),
          changeStats,
          bashLogs: bashLogs.slice(-5),
          pullRequestUrl: prUrl || null,
          generatedFiles,
          state: outcome.state || null,
        },
        null,
        2
      );
    } catch (e: any) {
      const errorCode = e?.code;
      if (errorCode === "ERR_MODULE_NOT_FOUND" || /@google\/jules-sdk/.test(e?.message || "")) {
        return "Failed to run Jules session: missing dependency @google/jules-sdk. Install backend dependencies with `npm install` in /backend.";
      }
      return `Failed to run Jules session: ${e.message}`;
    }
  },
  {
    name: "run_jules_session",
    description: "Launches a Google Jules coding session and returns progress plus the resulting PR URL when available.",
    schema: z.object({
      prompt: z.string().describe("Task prompt sent to Jules."),
      githubRepository: z.string().optional().describe("GitHub repository in owner/repo format."),
      baseBranch: z.string().optional().describe("Base branch for Jules work."),
      autoPr: z.boolean().default(true).describe("Whether Jules should automatically create a pull request."),
    }),
  }
);

export const listJulesSourcesTool = tool(
  async () => {
    if (!process.env.JULES_API_KEY) {
      return "JULES_API_KEY is missing. Configure it before using this tool.";
    }

    try {
      const res = await fetch("https://jules.googleapis.com/v1alpha/sources", {
        headers: {
          "x-goog-api-key": process.env.JULES_API_KEY,
          Accept: "application/json",
        },
      });

      const bodyText = await res.text();
      if (!res.ok) {
        return `Failed to list Jules sources (${res.status} ${res.statusText}): ${bodyText}`;
      }

      try {
        const parsed = JSON.parse(bodyText);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return bodyText;
      }
    } catch (e: any) {
      return `Failed to list Jules sources: ${e.message}`;
    }
  },
  {
    name: "list_jules_sources",
    description: "Lists available Google Jules sources using the Jules REST API.",
    schema: z.object({}),
  }
);

// ── Web / Utility tools ───────────────────────────────────────────────────────

export const webFetchTool = tool(
  async ({ url }: { url: string }) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "NudgeBot/1.0" },
      });
      clearTimeout(timeout);

      if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`;

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        return JSON.stringify(json, null, 2).slice(0, 8000);
      }

      const text = await res.text();
      // Strip HTML tags for readability
      const cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleaned.slice(0, 8000);
    } catch (e: any) {
      return `Failed to fetch URL: ${e.message}`;
    }
  },
  {
    name: "web_fetch",
    description: "Fetches the content of a URL and returns the text (HTML tags stripped). Useful for reading web pages, APIs, documentation.",
    schema: z.object({
      url: z.string().describe("The URL to fetch."),
    }),
  }
);

export const sendEmailTool = tool(
  async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
    const apiKey = (process.env.RESEND_API_KEY || "").trim();
    const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();

    if (!apiKey || !fromEmail) {
      return "Email not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.";
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [to],
          subject,
          html: `<div>${body.replace(/\n/g, "<br />")}</div>`,
          text: body,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        return `Failed to send email: ${res.status} ${err}`;
      }

      return `Email sent to ${to} with subject "${subject}".`;
    } catch (e: any) {
      return `Failed to send email: ${e.message}`;
    }
  },
  {
    name: "send_email",
    description: "Sends an email immediately via Resend. Use for quick notifications, summaries, or reports.",
    schema: z.object({
      to: z.string().describe("Recipient email address."),
      subject: z.string().describe("Email subject line."),
      body: z.string().describe("Email body (plain text, newlines supported)."),
    }),
  }
);

export const getDateTimeTool = tool(
  async ({ timezone }: { timezone?: string }) => {
    try {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const formatted = now.toLocaleString("fr-FR", { timeZone: tz, dateStyle: "full", timeStyle: "long" });
      return `${formatted} (${tz})\nISO: ${now.toISOString()}\nTimestamp: ${now.getTime()}`;
    } catch (e: any) {
      return `Failed to get date/time: ${e.message}`;
    }
  },
  {
    name: "get_date_time",
    description: "Returns the current date and time, optionally in a specific timezone.",
    schema: z.object({
      timezone: z.string().optional().describe("IANA timezone (e.g. 'Europe/Paris', 'America/New_York'). Defaults to server timezone."),
    }),
  }
);

export const saveNoteTool = tool(
  async ({ title, content }: { title: string; content: string }) => {
    try {
      const { getGitHubContextManager } = await import("../githubContextManager.js");
      const mgr = getGitHubContextManager();
      if (!mgr) return "GitHub context not configured. Note saved locally only.";

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filePath = `notes/${slug}.md`;
      const markdown = `# ${title}\n\n_Saved: ${new Date().toISOString()}_\n\n${content}`;

      const ok = await (mgr as any).putFile(filePath, markdown, `Save note: ${title}`);
      return ok ? `Note "${title}" saved to GitHub (${filePath}).` : `Failed to save note to GitHub.`;
    } catch (e: any) {
      return `Failed to save note: ${e.message}`;
    }
  },
  {
    name: "save_note",
    description: "Saves a note to the GitHub context repo. Useful for remembering things across sessions.",
    schema: z.object({
      title: z.string().describe("Note title (used as filename)."),
      content: z.string().describe("Note content in markdown."),
    }),
  }
);

export const listNotesTool = tool(
  async () => {
    try {
      const { getGitHubContextManager } = await import("../githubContextManager.js");
      const mgr = getGitHubContextManager();
      if (!mgr) return "GitHub context not configured.";

      const baseUrl = (mgr as any).baseUrl as string;
      const headers = (mgr as any).headers as Record<string, string>;

      const res = await fetch(`${baseUrl}/contents/notes`, { headers });
      if (res.status === 404) return "No notes saved yet.";
      if (!res.ok) return `Failed to list notes: ${res.status}`;

      const files = (await res.json()) as Array<{ name: string; size: number }>;
      if (files.length === 0) return "No notes saved yet.";

      return files.map((f) => `- ${f.name} (${f.size} bytes)`).join("\n");
    } catch (e: any) {
      return `Failed to list notes: ${e.message}`;
    }
  },
  {
    name: "list_notes",
    description: "Lists all notes saved in the GitHub context repo.",
    schema: z.object({}),
  }
);

export const readNoteTool = tool(
  async ({ title }: { title: string }) => {
    try {
      const { getGitHubContextManager } = await import("../githubContextManager.js");
      const mgr = getGitHubContextManager();
      if (!mgr) return "GitHub context not configured.";

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const baseUrl = (mgr as any).baseUrl as string;
      const headers = (mgr as any).headers as Record<string, string>;

      const res = await fetch(`${baseUrl}/contents/notes/${slug}.md`, { headers });
      if (res.status === 404) return `Note "${title}" not found.`;
      if (!res.ok) return `Failed to read note: ${res.status}`;

      const data = (await res.json()) as { content: string };
      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch (e: any) {
      return `Failed to read note: ${e.message}`;
    }
  },
  {
    name: "read_note",
    description: "Reads a note from the GitHub context repo by title.",
    schema: z.object({
      title: z.string().describe("Note title to read."),
    }),
  }
);

export const syncToWorkspaceTool = tool(
  async ({ filePath, message }: { filePath: string; message?: string }) => {
    try {
      const { getGitHubWorkspaceManager } = await import("../githubContextManager.js");
      const mgr = getGitHubWorkspaceManager();
      if (!mgr) return "Workspace GitHub repo not configured. Please set GITHUB_WORKSPACE_REPO.";

      const resolvedPath = resolveSafePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf8");

      const ok = await mgr.putFile(filePath, content, message || `Sync file: ${filePath}`);
      return ok ? `File '${filePath}' successfully synced to GitHub workspace repository (${mgr.repo}).` : `Failed to sync '${filePath}' to GitHub.`;
    } catch (e: any) {
      return `Error during sync: ${e.message}`;
    }
  },
  {
    name: "sync_to_workspace",
    description: "Syncs a local file from the workspace to the dedicated GitHub workspace repository for permanent storage.",
    schema: z.object({
      filePath: z.string().describe("Relative path to the file in the local workspace."),
      message: z.string().optional().describe("Optional commit message."),
    }),
  }
);

// ── Export all tools ──────────────────────────────────────────────────────────

export const tools = [
  // Workspace
  createProjectWorkspaceTool,
  syncToWorkspaceTool,
  // File ops
  createFileTool,
  readFileTool,
  listDirectoryTool,
  deleteFileTool,
  // Shell
  executeCommandTool,
  // Scheduling
  scheduleTaskTool,
  listTasksTool,
  cancelTaskTool,
  // Web
  webFetchTool,
  // Email
  sendEmailTool,
  // Date/Time
  getDateTimeTool,
  // Notes (GitHub-backed)
  saveNoteTool,
  listNotesTool,
  readNoteTool,
  // Google Jules
  listJulesSourcesTool,
  julesSessionTool,
];
