import { config } from "./config";

export type ClineEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; name: string; input?: string }
  | { type: "tool_result"; name: string; output: string }
  | { type: "done" }
  | { type: "error"; message: string };

export async function runClineTask(
  prompt: string,
  model: string,
  onEvent: (event: ClineEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  console.log("[API] Starting task with model:", model);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nudgebot.app",
        "X-Title": "Nudgebot",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[API] Error:", error);
      onEvent({ type: "error", message: `API Error: ${error}` });
      onEvent({ type: "done" });
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onEvent({ type: "error", message: "No response body" });
      onEvent({ type: "done" });
      return;
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
            onEvent({ type: "text", content });
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }

    console.log("[API] Task completed");
    onEvent({ type: "done" });
  } catch (error: any) {
    console.error("[API] Fatal error:", error);
    if (error.name !== "AbortError") {
      onEvent({ type: "error", message: error.message || "Unknown error" });
    }
    onEvent({ type: "done" });
  }
}
