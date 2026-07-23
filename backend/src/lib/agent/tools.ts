import { tool as __originalCreateTool } from "ai";
import type { ZodSchema } from "zod";
import { runVerifiedAction, type ActionVerifier } from "./actaro.js";

function createTool<T extends ZodSchema>(options: {
  id: string;
  description: string;
  inputSchema: T;
  execute: (params: z.infer<T>) => Promise<any> | any;
  verify?: ActionVerifier<z.infer<T>>;
}) {
  const originalExecute = options.execute;
  const wrappedExecute = async (params: z.infer<T>) => {
    console.log(`[Actaro Logger] Outil ${options.id} lancé via Actaro verification runner...`);
    try {
      const { output, receipt } = await runVerifiedAction({
        name: options.id,
        description: options.description,
        inputSchema: options.inputSchema,
        input: params,
        execute: async (p) => await originalExecute(p),
        verify: options.verify,
      });
      console.log(`[Actaro Logger] Outil ${options.id} terminé avec reçu status=${receipt.status}`);
      return output;
    } catch (e: any) {
      console.error(`[Actaro Logger] Outil ${options.id} a échoué:`, e.message);
      throw e;
    }
  };
  return {
    ...__originalCreateTool({
      description: options.description,
      inputSchema: options.inputSchema,
      execute: wrappedExecute,
    }),
    id: options.id,
    description: options.description,
    inputSchema: options.inputSchema,
    execute: wrappedExecute,
  };
}

import { z } from "zod";
import path from "path";
import { promises as fs } from "fs";
import fsSync from "fs";
import { exec as execCallback } from "child_process";
import { promisify } from "util";
import { jobs } from "../scheduler.js";
import { getStore } from "../githubStore.js";
import { scheduleNotificationJob } from "../notifications.js";

const exec = promisify(execCallback);

// ── Workspace helpers ─────────────────────────────────────────────────────────

const getWorkspaceRoot = (): string => {
  const envWorkdir = (process.env.NUDGEBOT_WORKDIR || "").trim();
  if (envWorkdir) {
    try {
      fsSync.mkdirSync(envWorkdir, { recursive: true });
      return envWorkdir;
    } catch (err) {
      console.warn(`[workspace] Configured workdir '${envWorkdir}' is not writable, falling back to local workspace.`);
    }
  }
  const fallback = path.join(process.cwd(), "workspace");
  try {
    fsSync.mkdirSync(fallback, { recursive: true });
  } catch (err) {
    // ignore
  }
  return fallback;
};

const getProjectsRoot = () => {
  return path.resolve(getWorkspaceRoot(), "projects");
};

export const normalizeProjectName = (projectName: string) =>
  projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "general";

const resolveSafePath = (requestedPath: string) => {
  const workspaceRoot = path.resolve(getWorkspaceRoot());
  const resolvedPath = path.resolve(workspaceRoot, requestedPath);
  const workspaceRootWithSep = `${workspaceRoot}${path.sep}`;

  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRootWithSep)) {
    throw new Error("Access denied: path must stay within the workspace.");
  }

  return resolvedPath;
};

// ── Tools ─────────────────────────────────────────────────────────────────────

export const createProjectWorkspaceTool = createTool({
  id: "create_project_workspace",
  description: "Creates (or reuses) a dedicated working subfolder for a project under the NudgeBot workspace.",
  inputSchema: z.object({
    projectName: z.string().describe("Project name used to create a normalized subfolder."),
  }),
  execute: async ({ projectName }) => {
    try {
      const projectsRoot = getProjectsRoot();
      const normalized = normalizeProjectName(projectName);
      const projectDir = path.join(projectsRoot, normalized);
      await fs.mkdir(projectDir, { recursive: true });
      return `Project workspace ready: ${projectDir}`;
    } catch (e: any) {
      throw new Error(`Failed to create project workspace: ${e.message}`);
    }
  },
  verify: async ({ projectName }) => {
    const projectsRoot = getProjectsRoot();
    const normalized = normalizeProjectName(projectName);
    const projectDir = path.join(projectsRoot, normalized);
    const exists = fsSync.existsSync(projectDir);
    return exists
      ? { status: "verified" as const, evidence: { projectDir, exists: true } }
      : { status: "failed" as const, reason: `Project directory ${projectDir} does not exist.` };
  },
});

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
  const scheduleTaskTool = createTool({
    id: "schedule_task",
    description:
      "Schedules a deferred or recurring task. Supports actions: email (Resend), command (shell), http (native BlazeJob HTTP), log. Persisted in SQLite — survives restarts.",
    inputSchema: z.object({
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
    execute: async ({
      taskName, actionType, delayMs, intervalMs, maxRuns,
      recipientEmail, subject, body, command, url,
      httpMethod, httpHeaders, httpBody, message,
    }) => {
      try {
        const runAt = new Date(Date.now() + delayMs);
        jobs.start();

        if (actionType === "email") {
          if (!recipientEmail || !subject || !body) throw new Error("Missing recipientEmail, subject, or body for email action.");
          const store = await getStore();
          const created = await store.createNotification(1, {
            recipient_email: recipientEmail,
            subject,
            body,
            send_at: runAt.toISOString(),
            recurrence_interval_minutes: intervalMs ? Math.round(intervalMs / 60_000) : undefined,
            max_runs: maxRuns,
          });
          await scheduleNotificationJob(created.id, runAt);
          const typeStr = intervalMs && intervalMs > 0
            ? `recurring every ${Math.round(intervalMs / 60000)}m (max ${maxRuns ?? "∞"} runs)`
            : `one-off in ${delayMs}ms`;
          return `Email task '${taskName}' scheduled persistently via githubStore (id: ${created.id}, ${typeStr}).`;
        }

        let taskFn: () => Promise<void>;
        const scheduleOpts: any = {
          runAt,
          ...(intervalMs && intervalMs > 0 ? { interval: intervalMs } : {}),
          ...(maxRuns ? { maxRuns } : {}),
        };

        switch (actionType) {
          case "command":
            if (!command) throw new Error("Missing command for command action.");
            taskFn = async () => {
              const { stdout, stderr } = await exec(command, { timeout: 30_000, maxBuffer: 1024 * 1024 });
              console.log(`[task:command] '${taskName}' output:`, stdout, stderr || "");
            };
            break;
          case "http":
            if (!url) throw new Error("Missing url for http action.");
            taskFn = async () => {
              const method = (httpMethod || "POST").toUpperCase();
              const headers = httpHeaders ? JSON.parse(httpHeaders) : { "Content-Type": "application/json" };
              const parsedBody = httpBody ? JSON.parse(httpBody) : undefined;

              const res = await fetch(url, {
                method,
                headers,
                body: parsedBody == null ? undefined : (typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)),
              });

              if (!res.ok) {
                const errText = await res.text();
                throw new Error(`HTTP task failed (${res.status}): ${errText}`);
              }
            };
            break;
          case "log":
            taskFn = async () => { console.log(`[task:log] ${message || taskName}`); };
            break;
        }

        const taskId = jobs.schedule(taskFn!, scheduleOpts);

        const type = intervalMs && intervalMs > 0
          ? `recurring every ${Math.round(intervalMs / 1000)}s (max ${maxRuns ?? "∞"} runs)`
          : `one-off in ${delayMs}ms`;

        return `System task '${taskName}' scheduled (id: ${taskId}, ${actionType}, ${type}).`;
      } catch (e: any) {
        throw new Error(`Failed to schedule task: ${e.message}`);
      }
    },
  });

  const listTasksTool = createTool({
    id: "list_tasks",
    description: "Lists all scheduled tasks (emails and system tasks).",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const store = await getStore();
        const notifications = await store.getNotificationsByUser(1);
        const tasks = jobs.getTasks().filter((t: any) => t.type !== null || t.config !== null);

        let result = "";

        if (notifications.length > 0) {
          result += "=== Persistent Email Tasks (survive restarts) ===\n";
          result += notifications.map((n: any) => {
            const recurrence = n.recurrence_interval_minutes ? ` | every ${n.recurrence_interval_minutes}m (max ${n.max_runs ?? "∞"} runs)` : "";
            return `#${n.id} — [${n.status}] to: ${n.recipient_email} | sendAt: ${n.send_at}${recurrence}`;
          }).join("\n") + "\n";
        } else {
          result += "No persistent email tasks.\n";
        }

        if (tasks.length > 0) {
          result += "\n=== System HTTP Tasks ===\n";
          result += tasks.map((t: any) => {
            const interval = t.interval ? ` | every ${Math.round(t.interval / 1000)}s` : "";
            return `#${t.id} — [${t.status}] type: ${t.type || "custom"} | runAt: ${t.runAt}${interval}`;
          }).join("\n");
        }

        return result;
      } catch (e: any) {
        throw new Error(`Failed to list tasks: ${e.message}`);
      }
    },
  });

  const cancelTaskTool = createTool({
    id: "cancel_task",
    description: "Deletes or cancels a scheduled task by its ID.",
    inputSchema: z.object({
      taskId: z.number().describe("The task ID to delete/cancel."),
    }),
    execute: async ({ taskId }) => {
      try {
        const store = await getStore();
        const notification = await store.getNotification(taskId);
        if (notification) {
          await store.updateNotification(taskId, {
            status: "cancelled",
            sent_at: new Date().toISOString(),
          });
          return `Email task #${taskId} cancelled successfully.`;
        }

        jobs.deleteTask(taskId);
        return `System task #${taskId} deleted successfully.`;
      } catch (e: any) {
        throw new Error(`Failed to cancel task: ${e.message}`);
      }
    },
  });

  return [scheduleTaskTool, listTasksTool, cancelTaskTool];
};

export const createFileTool = createTool({
  id: "create_file",
  description: "Creates a file with the provided content, or appends to it.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file in the workspace."),
    content: z.string().describe("Content to write into the file."),
    mode: z.enum(["write", "append"]).default("write").describe("'write' to replace, 'append' to add."),
  }),
  execute: async ({ path: filePath, content, mode }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

      const writeMode = mode === "append" ? "a" : "w";
      await fs.writeFile(resolvedPath, content, { encoding: "utf8", flag: writeMode });

      return `File ${mode === "append" ? "updated" : "created"} successfully at: ${filePath}`;
    } catch (e: any) {
      throw new Error(`Failed to create/update file: ${e.message}`);
    }
  },
  verify: async ({ path: filePath, content, mode }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      if (!fsSync.existsSync(resolvedPath)) {
        return { status: "failed" as const, reason: `File does not exist at ${filePath}` };
      }
      const stat = await fs.stat(resolvedPath);
      const actualContent = await fs.readFile(resolvedPath, "utf8");
      const isVerified = mode === "append" ? actualContent.includes(content) : actualContent === content;
      return isVerified
        ? { status: "verified" as const, evidence: { path: filePath, size: stat.size, mode } }
        : { status: "failed" as const, reason: "File content mismatch upon disk verification" };
    } catch (err: any) {
      return { status: "failed" as const, reason: `Verification error: ${err.message}` };
    }
  },
});

export const readFileTool = createTool({
  id: "read_file",
  description: "Reads and returns file content.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file in the workspace."),
  }),
  execute: async ({ path: filePath }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf8");
      return content;
    } catch (e: any) {
      throw new Error(`Failed to read file: ${e.message}`);
    }
  },
});

export const listDirectoryTool = createTool({
  id: "list_directory",
  description: "Lists files and folders in a directory.",
  inputSchema: z.object({
    path: z.string().default(".").describe("Relative path to the directory."),
  }),
  execute: async ({ path: dirPath }) => {
    try {
      const resolvedPath = resolveSafePath(dirPath || ".");
      const items = await fs.readdir(resolvedPath, { withFileTypes: true });
      return items.map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`).join("\n");
    } catch (e: any) {
      throw new Error(`Failed to list directory: ${e.message}`);
    }
  },
});

export const deleteFileTool = createTool({
  id: "delete_file",
  description: "Deletes a file.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file."),
  }),
  execute: async ({ path: filePath }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      await fs.unlink(resolvedPath);
      return `File deleted successfully: ${filePath}`;
    } catch (e: any) {
      throw new Error(`Failed to delete file: ${e.message}`);
    }
  },
  verify: async ({ path: filePath }) => {
    try {
      const resolvedPath = resolveSafePath(filePath);
      const exists = fsSync.existsSync(resolvedPath);
      return !exists
        ? { status: "verified" as const, evidence: { path: filePath, deleted: true } }
        : { status: "failed" as const, reason: `File ${filePath} still exists on disk.` };
    } catch (err: any) {
      return { status: "failed" as const, reason: `Verification error: ${err.message}` };
    }
  },
});

export const executeCommandTool = createTool({
  id: "execute_command",
  description: "Executes a shell command from the workspace and returns output.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to execute."),
  }),
  execute: async ({ command }) => {
    try {
      const { stdout, stderr } = await exec(command, {
        cwd: getWorkspaceRoot(),
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });

      if (stderr && !stdout) {
        throw new Error(`Command completed with stderr:\n${stderr}`);
      }

      return `Command output:\n${stdout}${stderr ? `\nStderr:\n${stderr}` : ""}`;
    } catch (e: any) {
      throw new Error(`Failed to execute command: ${e.message}`);
    }
  },
});

export const julesSessionTool = createTool({
  id: "run_jules_session",
  description: "Launches a Google Jules automated coding run in start mode (fire-and-forget) and returns the session ID immediately. Does not wait for completion.",
  inputSchema: z.object({
    prompt: z.string().describe("Task prompt sent to Jules."),
    title: z.string().optional().describe("Short title displayed in Jules for the session."),
    githubRepository: z.string().optional().describe("GitHub repository in owner/repo format."),
    baseBranch: z.string().optional().describe("Base branch for Jules work."),
    autoPr: z.boolean().default(true).describe("Whether Jules should automatically create a pull request."),
    requireApproval: z.boolean().default(false).describe("Whether Jules should pause and wait for plan approval. Set to false (default) to run immediately (start mode)."),
  }),
  execute: async ({ prompt, title, githubRepository, baseBranch, autoPr, requireApproval }) => {
    if (!process.env.JULES_API_KEY) {
      throw new Error("JULES_API_KEY is missing. Configure it before using this tool.");
    }

    try {
      const { jules } = await import("@google/jules-sdk");
      const sessionConfig: any = { prompt, title, autoPr, requireApproval };

      if (githubRepository) {
        sessionConfig.source = { github: githubRepository, baseBranch: baseBranch || "main" };
      }

      const automatedSession = await jules.run(sessionConfig);

      return `Jules session launched successfully in automated start mode (fire-and-forget). Session ID: ${automatedSession.id}`;
    } catch (e: any) {
      const errorCode = e?.code;
      if (errorCode === "ERR_MODULE_NOT_FOUND" || /@google\/jules-sdk/.test(e?.message || "")) {
        throw new Error("Failed to run Jules session: missing dependency @google/jules-sdk. Install backend dependencies with `npm install` in /backend.");
      }
      throw new Error(`Failed to run Jules session: ${e.message}`);
    }
  },
});

export const listJulesSourcesTool = createTool({
  id: "list_jules_sources",
  description: "Lists available Google Jules sources using the Jules REST API.",
  inputSchema: z.object({
    pageSize: z.number().int().positive().max(100).optional().describe("Maximum sources to return (default API behavior applies when omitted)."),
    pageToken: z.string().optional().describe("Pagination token returned by a previous list request."),
  }),
  execute: async ({ pageSize, pageToken }) => {
    if (!process.env.JULES_API_KEY) {
      throw new Error("JULES_API_KEY is missing. Configure it before using this tool.");
    }

    try {
      const qs = new URLSearchParams();
      if (typeof pageSize === "number") qs.set("pageSize", String(pageSize));
      if (pageToken) qs.set("pageToken", pageToken);

      const endpoint = `https://jules.googleapis.com/v1alpha/sources${qs.size ? `?${qs.toString()}` : ""}`;
      const res = await fetch(endpoint, {
        headers: {
          "x-goog-api-key": process.env.JULES_API_KEY,
          Accept: "application/json",
        },
      });

      const bodyText = await res.text();
      if (!res.ok) {
        throw new Error(`Failed to list Jules sources (${res.status} ${res.statusText}): ${bodyText}`);
      }

      try {
        const parsed = JSON.parse(bodyText);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return bodyText;
      }
    } catch (e: any) {
      throw new Error(`Failed to list Jules sources: ${e.message}`);
    }
  },
});

export const listJulesSessionsTool = createTool({
  id: "list_jules_sessions",
  description: "Lists Google Jules sessions through the Jules REST API.",
  inputSchema: z.object({
    pageSize: z.number().int().positive().max(100).optional().describe("Maximum sessions to return (default API behavior applies when omitted)."),
    pageToken: z.string().optional().describe("Pagination token returned by a previous list request."),
  }),
  execute: async ({ pageSize, pageToken }) => {
    if (!process.env.JULES_API_KEY) {
      throw new Error("JULES_API_KEY is missing. Configure it before using this tool.");
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
        throw new Error(`Failed to list Jules sessions (${res.status} ${res.statusText}): ${bodyText}`);
      }

      try {
        const parsed = JSON.parse(bodyText);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return bodyText;
      }
    } catch (e: any) {
      throw new Error(`Failed to list Jules sessions: ${e.message}`);
    }
  },
});

// ── Web / Utility tools ───────────────────────────────────────────────────────

export const webSearchTool = createTool({
  id: "web_search",
  description: "Searches the web using DuckDuckGo and returns a list of relevant search results with URLs, titles, and snippets. Useful for finding current information.",
  inputSchema: z.object({
    query: z.string().describe("The search query."),
  }),
  execute: async ({ query }) => {
    try {
      const url = "https://html.duckduckgo.com/html/";
      const formData = new URLSearchParams();
      formData.append("q", query);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const html = await res.text();
      const { load } = await import("cheerio");
      const $ = load(html);
      const results: { title: string; url: string; snippet: string }[] = [];

      $(".result").each((_, element) => {
        const title = $(element).find(".result__title").text().trim();
        const url = $(element).find(".result__url").attr("href")?.trim() || "";
        const snippet = $(element).find(".result__snippet").text().trim();

        if (title && url) {
          // DDG sometimes prefixes urls with their redirector
          let finalUrl = url;
          if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
            try {
              const urlObj = new URL("https:" + url);
              const uddg = urlObj.searchParams.get("uddg");
              if (uddg) finalUrl = decodeURIComponent(uddg);
            } catch (e) {
              // ignore
            }
          }

          results.push({ title, url: finalUrl, snippet });
        }
      });

      if (results.length === 0) {
        return "No results found.";
      }

      return results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}\n`).join("\n").slice(0, 8000);
    } catch (e: any) {
      throw new Error(`Failed to perform web search: ${e.message}`);
    }
  },
});

export const webFetchTool = createTool({
  id: "web_fetch",
  description: "Fetches the content of a URL and returns the text (HTML tags stripped). Useful for reading web pages, APIs, documentation.",
  inputSchema: z.object({
    url: z.string().describe("The URL to fetch."),
  }),
  execute: async ({ url }) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "NudgeBot/1.0" },
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        return JSON.stringify(json, null, 2).slice(0, 8000);
      }

      const text = await res.text();
      const cleaned = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleaned.slice(0, 8000);
    } catch (e: any) {
      throw new Error(`Failed to fetch URL: ${e.message}`);
    }
  },
});

export const sendEmailTool = createTool({
  id: "send_email",
  description: "Sends an email immediately via Resend. Use for quick notifications, summaries, or reports.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address."),
    subject: z.string().describe("Email subject line."),
    body: z.string().describe("Email body (plain text, newlines supported)."),
  }),
  execute: async ({ to, subject, body }) => {
    const apiKey = (process.env.RESEND_API_KEY || "").trim();
    const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();

    if (!apiKey || !fromEmail) {
      throw new Error("Email not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
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
        throw new Error(`Failed to send email: ${res.status} ${err}`);
      }

      return `Email sent to ${to} with subject "${subject}".`;
    } catch (e: any) {
      throw new Error(`Failed to send email: ${e.message}`);
    }
  },
});

export const getDateTimeTool = createTool({
  id: "get_date_time",
  description: "Returns the current date and time, optionally in a specific timezone.",
  inputSchema: z.object({
    timezone: z.string().optional().describe("IANA timezone (e.g. 'Europe/Paris', 'America/New_York'). Defaults to server timezone."),
  }),
  execute: async ({ timezone }) => {
    try {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const now = new Date();
      const formatted = now.toLocaleString("fr-FR", { timeZone: tz, dateStyle: "full", timeStyle: "long" });
      return `${formatted} (${tz})\nISO: ${now.toISOString()}\nTimestamp: ${now.getTime()}`;
    } catch (e: any) {
      throw new Error(`Failed to get date/time: ${e.message}`);
    }
  },
});

// Local in-memory cache for notes to prevent propagation delay or rate limits from GitHub API
const notesCache = new Map<string, { content: string; timestamp: number }>();

export const saveNoteTool = createTool({
  id: "save_note",
  description: "Saves a note to /notes/ in the GitHub memory repo. Useful for remembering things across sessions.",
  inputSchema: z.object({
    title: z.string().describe("Note title (used as filename)."),
    content: z.string().describe("Note content in markdown."),
  }),
  execute: async ({ title, content }) => {
    try {
      const { getGitHubMemoryManager } = await import("../githubContextManager.js");
      const mgr = getGitHubMemoryManager();
      if (!mgr) throw new Error("GitHub memory repo not configured. Please set GITHUB_MEMORY_REPO or configure a GitHub token so it can be auto-created.");

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const filePath = `notes/${slug}.md`;
      const markdown = `# ${title}\n\n_Saved: ${new Date().toISOString()}_\n\n${content}`;

      // Update cache immediately so it's readable right away
      notesCache.set(slug, {
        content: markdown,
        timestamp: Date.now(),
      });

      const ok = await mgr.putFile(filePath, markdown, `Save note: ${title}`);
      return ok ? `Note "${title}" saved to GitHub (${filePath}).` : `Note "${title}" saved locally only (failed to sync to GitHub).`;
    } catch (e: any) {
      throw new Error(`Failed to save note: ${e.message}`);
    }
  },
});

export const listNotesTool = createTool({
  id: "list_notes",
  description: "Lists all notes saved in /notes/ in the GitHub memory repo.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const { getGitHubMemoryManager } = await import("../githubContextManager.js");
      const mgr = getGitHubMemoryManager();
      if (!mgr) throw new Error("GitHub memory repo not configured. Please set GITHUB_MEMORY_REPO or configure a GitHub token so it can be auto-created.");

      const baseUrl = (mgr as any).baseUrl as string;
      const headers = (mgr as any).headers as Record<string, string>;

      let githubFiles: Array<{ name: string; size: number }> = [];
      try {
        const res = await fetch(`${baseUrl}/contents/notes`, { headers });
        if (res.ok) {
          githubFiles = (await res.json()) as Array<{ name: string; size: number }>;
        }
      } catch (e) {
        // ignore list fetch error, fallback to cache
      }

      const fileNames = new Set(githubFiles.map((f) => f.name));
      const mergedFiles = [...githubFiles];

      for (const [slug, item] of notesCache.entries()) {
        const filename = `${slug}.md`;
        if (!fileNames.has(filename)) {
          mergedFiles.push({
            name: filename,
            size: Buffer.byteLength(item.content, "utf8"),
          });
        }
      }

      if (mergedFiles.length === 0) return "No notes saved yet.";

      return mergedFiles.map((f) => `- ${f.name} (${f.size} bytes)`).join("\n");
    } catch (e: any) {
      throw new Error(`Failed to list notes: ${e.message}`);
    }
  },
});

export const readNoteTool = createTool({
  id: "read_note",
  description: "Reads a note from /notes/ in the GitHub memory repo by title.",
  inputSchema: z.object({
    title: z.string().describe("Note title to read."),
  }),
  execute: async ({ title }) => {
    try {
      const { getGitHubMemoryManager } = await import("../githubContextManager.js");
      const mgr = getGitHubMemoryManager();
      if (!mgr) throw new Error("GitHub memory repo not configured. Please set GITHUB_MEMORY_REPO or configure a GitHub token so it can be auto-created.");

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Check cache first to bypass propagation lag
      const cached = notesCache.get(slug);
      if (cached) {
        return cached.content;
      }

      const content = await mgr.getFile(`notes/${slug}.md`);
      if (!content) throw new Error(`Note "${title}" not found.`);

      // Save to cache for subsequent reads
      notesCache.set(slug, {
        content,
        timestamp: Date.now(),
      });

      return content;
    } catch (e: any) {
      throw new Error(`Failed to read note: ${e.message}`);
    }
  },
});

export const listGitHubRepositoriesTool = createTool({
  id: "list_github_repositories",
  description: "Lists all GitHub repositories of the authenticated user.",
  inputSchema: z.object({
    visibility: z.enum(["all", "public", "private"]).optional().describe("Visibility of repositories to return (all, public, or private)."),
    sort: z.enum(["created", "updated", "pushed", "full_name"]).optional().describe("Property to sort the results by."),
    direction: z.enum(["asc", "desc"]).optional().describe("Direction to sort the results by."),
    perPage: z.number().optional().describe("Results per page (max 100)."),
    page: z.number().optional().describe("Page number of results to fetch."),
  }),
  execute: async ({ visibility, sort, direction, perPage, page }) => {
    const token = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN || "").trim();
    if (!token) {
      throw new Error("GitHub token not configured. Please set GITHUB_PERSONAL_ACCESS_TOKEN or configure the GitHub integration.");
    }

    try {
      const url = new URL("https://api.github.com/user/repos");
      if (visibility) url.searchParams.set("visibility", visibility);
      if (sort) url.searchParams.set("sort", sort);
      if (direction) url.searchParams.set("direction", direction);
      if (perPage) url.searchParams.set("per_page", String(perPage));
      if (page) url.searchParams.set("page", String(page));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`GitHub API returned status ${res.status}: ${bodyText}`);
      }

      const repos = (await res.json()) as Array<{
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        description: string | null;
      }>;

      return JSON.stringify(
        repos.map((r) => ({
          name: r.name,
          full_name: r.full_name,
          private: r.private,
          html_url: r.html_url,
          description: r.description,
        })),
        null,
        2
      );
    } catch (e: any) {
      throw new Error(`Failed to list GitHub repositories: ${e.message}`);
    }
  },
});

export const getGitHubContentsTool = createTool({
  id: "get_github_contents",
  description: "Gets the contents of a file or directory in a GitHub repository.",
  inputSchema: z.object({
    owner: z.string().describe("The owner of the repository (e.g. 'QuenumGerald')."),
    repo: z.string().describe("The name of the repository (e.g. 'nudgebot-workspace')."),
    path: z.string().optional().default("").describe("The path to the file or directory. Defaults to the root directory."),
    ref: z.string().optional().describe("The name of the commit/branch/tag. Default: the repository's default branch."),
  }),
  execute: async ({ owner, repo, path: filePath, ref }) => {
    const token = (process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_CONTEXT_TOKEN || "").trim();
    if (!token) {
      throw new Error("GitHub token not configured. Please set GITHUB_PERSONAL_ACCESS_TOKEN or configure the GitHub integration.");
    }

    try {
      const cleanPath = filePath.replace(/^\/+/, "");
      const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}`);
      if (ref) url.searchParams.set("ref", ref);

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`GitHub API returned status ${res.status}: ${bodyText}`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        // It's a directory
        return JSON.stringify(
          data.map((item) => ({
            name: item.name,
            path: item.path,
            type: item.type, // 'file' or 'dir'
            size: item.size,
            download_url: item.download_url,
          })),
          null,
          2
        );
      } else if (data && typeof data === "object" && "content" in data) {
        // It's a file
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return content;
      }

      return JSON.stringify(data, null, 2);
    } catch (e: any) {
      throw new Error(`Failed to get GitHub contents: ${e.message}`);
    }
  },
});

export const syncToWorkspaceTool = createTool({
  id: "sync_to_workspace",
  description: "Syncs a local file from the workspace to /workspace/ in the GitHub memory repository for permanent storage.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative path to the file in the local workspace."),
    message: z.string().optional().describe("Optional commit message."),
  }),
  execute: async ({ filePath, message }) => {
    try {
      const { getGitHubMemoryManager } = await import("../githubContextManager.js");
      const mgr = getGitHubMemoryManager();
      if (!mgr) throw new Error("GitHub memory repo not configured. Please set GITHUB_MEMORY_REPO or configure a GitHub token so it can be auto-created.");

      const resolvedPath = resolveSafePath(filePath);
      const content = await fs.readFile(resolvedPath, "utf8");

      const repoPath = `workspace/${filePath.replace(/^\/+/, "")}`;
      const ok = await mgr.putFile(repoPath, content, message || `Sync file: ${filePath}`);
      if (!ok) throw new Error(`Failed to sync \`${filePath}\` to GitHub.`);
      return `File \`${filePath}\` successfully synced to GitHub memory repository at \`${repoPath}\` (${mgr.repo}).`;
    } catch (e: any) {
      throw new Error(`Error during sync: ${e.message}`);
    }
  },
});

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
  webSearchTool,
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
  // GitHub
  listGitHubRepositoriesTool,
  getGitHubContentsTool,
];

/** Returns the full tool set including scheduling tools. */
export const getTools = () => [
  ...staticTools,
  ...createSchedulingTools(),
];
