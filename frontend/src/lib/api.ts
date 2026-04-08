export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SettingsPayload {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
}

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function streamChat(
  messages: Message[],
  onEvent: (type: string, payload: Record<string, unknown>) => void
): Promise<void> {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });

  if (!response.ok || !response.body) {
    throw new Error("Unable to start chat stream.");
  }

  const decoder = new TextDecoder("utf-8");
  const reader = response.body.getReader();
  let buffer = "";
  let eventType = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame.split("\n");
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
        if (line.startsWith("data:")) data += line.replace("data:", "").trim();
      }
      if (data) {
        onEvent(eventType, JSON.parse(data) as Record<string, unknown>);
      }
    }
  }
}
