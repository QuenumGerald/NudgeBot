import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const maxDuration = 120;
export const runtime = "nodejs";

const WORKSPACE_PATH = path.resolve(process.env.NUDGEBOT_WORKSPACE_PATH || process.cwd());

function resolveWorkspacePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("Missing required parameter: path");
  }

  const normalizedPath = path.normalize(inputPath.trim());
  const absolutePath = path.resolve(WORKSPACE_PATH, normalizedPath);
  const workspaceRoot = `${WORKSPACE_PATH}${path.sep}`;

  if (absolutePath !== WORKSPACE_PATH && !absolutePath.startsWith(workspaceRoot)) {
    throw new Error("Path rejected: access outside workspace is not allowed.");
  }

  return absolutePath;
}

type ToolParameters = {
  path?: string;
  content?: string;
  mode?: "write" | "append";
  command?: string;
};

function runFileTool(tool: string, parameters: ToolParameters = {}) {
  switch (tool) {
    case "create_file": {
      const filePath = resolveWorkspacePath(parameters.path || "");
      const content = parameters.content ?? "";
      const mode = parameters.mode === "append" ? "append" : "write";

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (mode === "append") {
        fs.appendFileSync(filePath, String(content), "utf8");
      } else {
        fs.writeFileSync(filePath, String(content), "utf8");
      }

      return {
        success: true,
        tool,
        result: {
          path: path.relative(WORKSPACE_PATH, filePath),
          mode,
          bytes: Buffer.byteLength(String(content), "utf8"),
        },
      };
    }

    case "read_file": {
      const filePath = resolveWorkspacePath(parameters.path || "");
      const content = fs.readFileSync(filePath, "utf8");
      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, filePath), content },
      };
    }

    case "list_directory": {
      const dirPath = resolveWorkspacePath(parameters.path || ".");
      const entries = fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : "file",
      }));

      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, dirPath) || ".", entries },
      };
    }

    case "delete_file": {
      const filePath = resolveWorkspacePath(parameters.path || "");
      fs.unlinkSync(filePath);
      return {
        success: true,
        tool,
        result: { path: path.relative(WORKSPACE_PATH, filePath), deleted: true },
      };
    }

    case "execute_command": {
      const command = parameters.command;
      if (!command || typeof command !== "string") {
        throw new Error("Missing required parameter: command");
      }

      const output = execSync(command, {
        cwd: WORKSPACE_PATH,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      return {
        success: true,
        tool,
        result: { command, output },
      };
    }

    default:
      throw new Error(`Unsupported tool: ${tool}`);
  }
}

export async function POST(request: Request) {
  try {
    const { messages, model } = await request.json();
    const userMessage = messages[messages.length - 1].content;
    const activeModel = model || "qwen/qwen3.6-plus-preview:free";
    const apiKey = process.env.OPENROUTER_API_KEY || "";

    const trimmedMessage = typeof userMessage === "string" ? userMessage.trim() : "";
    if (trimmedMessage.startsWith("{") && trimmedMessage.endsWith("}")) {
      try {
        const parsedToolCall = JSON.parse(trimmedMessage);
        if (parsedToolCall.tool) {
          const toolResult = runFileTool(parsedToolCall.tool, parsedToolCall.parameters || {});
          return NextResponse.json({
            role: "assistant",
            type: "tool_result",
            ...toolResult,
          });
        }
      } catch {
        // Ignore malformed JSON and continue with normal assistant behavior.
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://nudgebot.app",
              "X-Title": "Nudgebot",
            },
            body: JSON.stringify({
              model: activeModel,
              messages: [
                {
                  role: "system",
                  content:
                    "You are NudgeBot, an expert security and code audit assistant. ALWAYS respond in English. You can execute tool calls by returning compact JSON like {\"tool\":\"read_file\",\"parameters\":{...}} when file system actions are required.",
                },
                { role: "user", content: userMessage },
              ],
              stream: true,
            }),
          });

          if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No response body");
          }

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.trim() || !line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`),
                  );
                }
              } catch {
                // Ignore parse errors.
              }
            }
          }

          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", model: activeModel })}\n\n`),
          );
          controller.close();
        } catch (error: any) {
          console.error("[API] Error:", error);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[API] Fatal error:", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
