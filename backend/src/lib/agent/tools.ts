import { tool } from "@langchain/core/tools";
import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import { exec as execCallback } from "child_process";
import { promisify } from "util";

const exec = promisify(execCallback);

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

// ── Scheduling tools ─────────────────────────────────────────────────────────

const sendEmail = async (recipientEmail: string, subject: string, body: string) => {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !fromEmail) throw new Error("RESEND_API_KEY or RESEND_FROM_EMAIL not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject,
      html: `<div>${body.replace(/\n/g, "<br />")}</div>`,
      text: body,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }
};

export const createSchedulingTools = () => {
  const scheduleTaskTool = tool(
    async ({
      taskName,
      actionType,
      delayMs,
      intervalMs,
      maxRuns,
      recipientEmail,
      subject,
      body,
      command,
      url,
      httpMethod,
      httpHeaders,
      httpBody,
      message,
    }: {
      taskName: string;
      actionType: "email" | "command" | "http" | "log";
      delayMs: number;
      intervalMs?: number;
      maxRuns?: number;
      recipientEmail?: string;
      subject?: string;
      body?: string;
      command?: string;
      url?: string;
      httpMethod?: string;
      httpHeaders?: string;
      httpBody?: string;
      message?: string;
    }) => {
      try {
        const { jobs } = await import("../scheduler.js");
        const runAt = new Date(Date.now() + delayMs);

        let taskFn: () => Promise<void>;
        let scheduleOpts: any = {
          runAt,
          ...(intervalMs && intervalMs > 0 ? { interval: intervalMs } : {}),
          ...(maxRuns ? { maxRuns } : {}),
        };

        switch (actionType) {
          case "email":
            if (!recipientEmail || !subject || !body) return "Missing recipientEmail, subject, or body for email action.";
            taskFn = async () => { await sendEmail(recipientEmail, subject, body); };
            break;
          case "command":
            if (!command) return "Missing command for command action.";
            taskFn = async () => {
              const { stdout, stderr } = await exec(command, { timeout: 30_000, maxBuffer: 1024 * 1024 });
              console.log(`[task:command] '${taskName}' output:`, stdout, stderr || "");
            };
            break;
          case "http":
            if (!url) return "Missing url for http action.";
            // Use BlazeJob's native HTTP task type
            taskFn = async () => {};
            scheduleOpts.type = "http";
            scheduleOpts.config = JSON.stringify({
              url,
              method: httpMethod || "POST",
              headers: httpHeaders ? JSON.parse(httpHeaders) : { "Content-Type": "application/json" },
              body: httpBody ? JSON.parse(httpBody) : undefined,
            });
            break;
          case "log":
            taskFn = async () => { console.log(`[task:log] ${message || taskName}`); };
            break;
        }

        const taskId = jobs.schedule(taskFn!, scheduleOpts);

        const type = intervalMs && intervalMs > 0
          ? `recurring every ${Math.round(intervalMs / 1000)}s (max ${maxRuns ?? "∞"} runs)`
          : `one-off in ${delayMs}ms`;

        return `Task '${taskName}' scheduled (id: ${taskId}, ${actionType}, ${type}).`;
      } catch (e: any) {
        return `Failed to schedule task: ${e.message}`;
      }
    },
    {
      name: "schedule_task",
      description:
        "Schedules a deferred or recurring task. Supports actions: email (Resend), command (shell), http (native BlazeJob HTTP), log. Persisted in SQLite — survives restarts.",
      schema: z.object({
        taskName: z.string().describe("Human-readable name for the task."),
        actionType: z.enum(["email", "command", "http", "log"]).describe("Type of action to perform."),
        delayMs: z.number().describe("Initial delay in milliseconds before first run."),
        intervalMs: z.number().optional().describe("If set, repeats every N milliseconds."),
        maxRuns: z.number().optional().describe("Maximum number of runs for recurring tasks."),
        recipientEmail: z.string().optional().describe("(email) Recipient email address."),
        subject: z.string().optional().describe("(email) Email subject line."),
        body: z.string().optional().describe("(email/log) Email body text or log content."),
        command: z.string().optional().describe("(command) Shell command to execute."),
        url: z.string().optional().describe("(http) URL to call."),
        httpMethod: z.string().optional().describe("(http) HTTP method, default POST."),
        httpHeaders: z.string().optional().describe("(http) JSON string of headers."),
        httpBody: z.string().optional().describe("(http) JSON string of request body."),
        message: z.string().optional().describe("(log) Message to log."),
      }),
    }
  );

  const listTasksTool = tool(
    async () => {
      try {
        const { jobs } = await import("../scheduler.js");
        const tasks = jobs.getTasks();

        if (!tasks || tasks.length === 0) return "No scheduled tasks.";

        const lines = tasks.map((t: any) => {
          const interval = t.interval ? ` | every ${Math.round(t.interval / 1000)}s` : "";
          return `#${t.id} — [${t.status}] type: ${t.type || "custom"} | runAt: ${t.runAt}${interval}`;
        });
        return lines.join("\n");
      } catch (e: any) {
        return `Failed to list tasks: ${e.message}`;
      }
    },
    {
      name: "list_tasks",
      description: "Lists all scheduled tasks from BlazeJob (SQLite-persisted).",
      schema: z.object({}),
    }
  );

  const cancelTaskTool = tool(
    async ({ taskId }: { taskId: number }) => {
      try {
        const { jobs } = await import("../scheduler.js");
        jobs.deleteTask(taskId);
        return `Task #${taskId} deleted.`;
      } catch (e: any) {
        return `Failed to cancel task: ${e.message}`;
      }
    },
    {
      name: "cancel_task",
      description: "Deletes a scheduled task by its ID.",
      schema: z.object({
        taskId: z.number().describe("The task ID to delete."),
      }),
    }
  );

  return [scheduleTaskTool, listTasksTool, cancelTaskTool];
};

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

      // Launch the session
      const run = await jules.run(runConfig);

      // Return immediately so the agent doesn't block waiting for Jules to complete
      return `Jules session launched successfully (fire-and-forget). Session ID: ${run.id}`;
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
    description: "Launches a Google Jules coding session in a fire-and-forget manner. Returns the session ID immediately. Does not wait for completion.",
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

export const listJulesSessionsTool = tool(
  async ({ pageSize, pageToken }: { pageSize?: number; pageToken?: string }) => {
    if (!process.env.JULES_API_KEY) {
      return "JULES_API_KEY is missing. Configure it before using this tool.";
    }

    try {
      const qs = new URLSearchParams();
      if (typeof pageSize === "number") qs.set("pageSize", String(pageSize));
      if (pageToken) qs.set("pageToken", pageToken);

      const endpoint = `https://jules.googleapis.com/v1alpha/sessions${qs.size ? `?${qs.toString()}` : ""}`;
      const res = await fetch(endpoint, {
        headers: {
          "x-goog-api-key": process.env.JULES_API_KEY,
          Accept: "application/json",
        },
      });

      const bodyText = await res.text();
      if (!res.ok) {
        return `Failed to list Jules sessions (${res.status} ${res.statusText}): ${bodyText}`;
      }

      try {
        const parsed = JSON.parse(bodyText);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return bodyText;
      }
    } catch (e: any) {
      return `Failed to list Jules sessions: ${e.message}`;
    }
  },
  {
    name: "list_jules_sessions",
    description: "Lists Google Jules sessions through the Jules REST API.",
    schema: z.object({
      pageSize: z.number().int().positive().max(100).optional().describe("Maximum sessions to return (default API behavior applies when omitted)."),
      pageToken: z.string().optional().describe("Pagination token returned by a previous list request."),
    }),
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

export const staticTools = [
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
  listJulesSessionsTool,
  julesSessionTool,
];

/** Returns the full tool set including scheduling tools. */
export const getTools = () => [
  ...staticTools,
  ...createSchedulingTools(),
];
