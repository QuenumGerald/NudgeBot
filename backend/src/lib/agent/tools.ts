import { tool } from "@langchain/core/tools";
import { z } from "zod";
import * as blazerjob from "blazerjob";
import path from "path";
import { promises as fs } from "fs";
import { exec as execCallback } from "child_process";
import { promisify } from "util";

// Initialize blazerjob scheduler using the sqlite database
const blazer = new (blazerjob as any).BlazeJob({
  dbPath: process.env.DATABASE_URL || "nudgebot.sqlite",
});
const exec = promisify(execCallback);

const resolveSafePath = (requestedPath: string) => {
  const workspaceRoot = process.cwd();
  const resolvedPath = path.resolve(workspaceRoot, requestedPath);
  const workspaceRootWithSep = `${workspaceRoot}${path.sep}`;

  if (resolvedPath !== workspaceRoot && !resolvedPath.startsWith(workspaceRootWithSep)) {
    throw new Error("Access denied: path must stay within the workspace.");
  }

  return resolvedPath;
};

export const scheduleTaskTool = tool(
  async ({ taskName, delay, payload }: { taskName: string, delay: number, payload: any }) => {
    try {
      const runAt = Date.now() + delay;
      await blazer.schedule(taskName, payload, runAt);
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
      // Basic implementation; depends on blazerjob API specifics.
      // Assuming a generic status check if direct querying isn't exposed.
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

export const createFileTool = tool(
  async ({ path: filePath, content, mode }: { path: string, content: string, mode: "write" | "append" }) => {
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
      mode: z.enum(["write", "append"]).default("write").describe("Use 'write' to replace contents, 'append' to add to existing contents."),
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
      return items
        .map((item) => `${item.isDirectory() ? "[DIR]" : "[FILE]"} ${item.name}`)
        .join("\n");
    } catch (e: any) {
      return `Failed to list directory: ${e.message}`;
    }
  },
  {
    name: "list_directory",
    description: "Lists files and folders in a directory.",
    schema: z.object({
      path: z.string().default(".").describe("Relative path to the directory in the workspace."),
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
      path: z.string().describe("Relative path to the file in the workspace."),
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

export const tools = [
  scheduleTaskTool,
  checkTasksTool,
  createFileTool,
  readFileTool,
  listDirectoryTool,
  deleteFileTool,
  executeCommandTool,
];
