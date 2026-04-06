const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const { tool } = require("@langchain/core/tools");
const { z } = require("zod");

const execAsync = promisify(exec);

const WORKSPACE_DIR = path.join(process.cwd(), "data", "workspace");
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

const SYSTEM_PROMPT = `You are NudgeBot, an expert security and code audit assistant operating in a workspace environment.

You have access to the following tools:
- execute_command: Run shell commands in the workspace (${WORKSPACE_DIR})
- read_file: Read file contents from the workspace
- write_file: Create or overwrite files in the workspace
- list_directory: List files and folders in the workspace

Use tools proactively to accomplish tasks. When asked to do something in the workspace, use the tools rather than just describing how to do it.`;

const executeCommandTool = tool(
  async ({ command }) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: WORKSPACE_DIR,
        timeout: 30000,
      });
      return (stdout + stderr).trim() || "(no output)";
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },
  {
    name: "execute_command",
    description: "Execute a shell command in the workspace directory. Use for running scripts, git, npm, grep, etc.",
    schema: z.object({
      command: z.string().describe("The shell command to execute"),
    }),
  }
);

const readFileTool = tool(
  async ({ file_path }) => {
    const fullPath = path.resolve(WORKSPACE_DIR, file_path);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return "Error: Path outside workspace";
    try {
      return fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },
  {
    name: "read_file",
    description: "Read the content of a file in the workspace",
    schema: z.object({
      file_path: z.string().describe("File path relative to workspace root"),
    }),
  }
);

const writeFileTool = tool(
  async ({ file_path, content }) => {
    const fullPath = path.resolve(WORKSPACE_DIR, file_path);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return "Error: Path outside workspace";
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
      return `Successfully wrote ${file_path}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },
  {
    name: "write_file",
    description: "Write content to a file in the workspace (creates or overwrites)",
    schema: z.object({
      file_path: z.string().describe("File path relative to workspace root"),
      content: z.string().describe("Content to write to the file"),
    }),
  }
);

const listDirectoryTool = tool(
  async ({ dir_path = "." }) => {
    const fullPath = path.resolve(WORKSPACE_DIR, dir_path);
    if (!fullPath.startsWith(WORKSPACE_DIR)) return "Error: Path outside workspace";
    try {
      const items = fs.readdirSync(fullPath, { withFileTypes: true });
      if (items.length === 0) return "(empty directory)";
      return items
        .map(item => `${item.isDirectory() ? "[dir] " : "[file]"} ${item.name}`)
        .join("\n");
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },
  {
    name: "list_directory",
    description: "List files and directories in the workspace",
    schema: z.object({
      dir_path: z.string().optional().describe("Directory path relative to workspace root (default: .)"),
    }),
  }
);

const TOOLS = [executeCommandTool, readFileTool, writeFileTool, listDirectoryTool];

module.exports = { TOOLS, SYSTEM_PROMPT, WORKSPACE_DIR };
