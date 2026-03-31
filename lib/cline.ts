import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { config, clineStateDir, workspaceDir } from "./config";

export type ClineEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; name: string; input?: string }
  | { type: "tool_result"; name: string; output: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function setupCline(): Promise<void> {
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.mkdir(clineStateDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  const globalStateFile = path.join(clineStateDir, "globalState.json");
  const secretsFile = path.join(clineStateDir, "secrets.json");

  try {
    let globalState = {};
    try {
      const globalStateContent = await fs.readFile(globalStateFile, "utf-8");
      globalState = JSON.parse(globalStateContent);
    } catch {
      // Ignored if file doesn't exist
    }

    let secrets = {};
    try {
      const secretsContent = await fs.readFile(secretsFile, "utf-8");
      secrets = JSON.parse(secretsContent);
    } catch {
      // Ignored if file doesn't exist
    }

    const newGlobalState = {
      ...globalState,
      apiProvider: "openrouter",
      openRouterModelId: config.defaultModel,
    };

    const newSecrets = {
      ...secrets,
      openRouterApiKey: config.openrouterKey,
    };

    await fs.writeFile(globalStateFile, JSON.stringify(newGlobalState, null, 2));
    await fs.writeFile(secretsFile, JSON.stringify(newSecrets, null, 2));
  } catch (error) {
    console.error("Error setting up Cline state files:", error);
  }
}

function parseClineEvent(raw: any): ClineEvent {
  if (!raw || typeof raw !== "object") {
    return { type: "text", content: JSON.stringify(raw) };
  }

  if (raw.type === "say" && raw.say === "text") {
    return { type: "text", content: raw.text || "" };
  }

  if (raw.type === "say" && raw.say === "tool") {
    return { type: "tool_start", name: raw.tool, input: raw.text || "" };
  }

  if (raw.type === "say" && raw.say === "completion_result") {
    return { type: "text", content: raw.text || "" };
  }

  if (raw.type === "completion_result") {
      return { type: "text", content: raw.text || "" };
  }

  // Not handled yet, just send text
  return { type: "text", content: raw.text || JSON.stringify(raw) };
}

export async function runClineTask(
  prompt: string,
  model: string,
  onEvent: (event: ClineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  await setupCline();

  const child = spawn(
    "cline",
    [
      "-y",
      "--json",
      "--model",
      model,
      "--api-key",
      config.openrouterKey,
      "--api-provider",
      "openrouter",
      "--state-dir",
      clineStateDir,
      prompt,
    ],
    {
      cwd: workspaceDir,
      signal,
    }
  );

  child.on("error", (error: any) => {
    if (error.code === "ENOENT") {
      onEvent({ type: "error", message: "Cline CLI not found. Run: npm install -g cline" });
    } else {
      onEvent({ type: "error", message: error.message });
    }
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        onEvent(parseClineEvent(parsed));
      } catch {
        // Not a JSON line, assume raw text
        onEvent({ type: "text", content: line });
      }
    }
  });

  child.stderr.on("data", (data) => {
    const message = data.toString().trim();
    if (message) {
      // Just print it out, but some of it is useful for the client
      console.warn("Cline stderr:", message);
    }
  });

  return new Promise<void>((resolve) => {
    child.on("close", (code) => {
      onEvent({ type: "done" });
      resolve();
    });
  });
}
