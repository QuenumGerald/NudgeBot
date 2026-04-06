import { NextResponse } from "next/server";

export const maxDuration = 120;
export const runtime = "nodejs";

type AppSettings = Record<string, string>;

function getBaseURL(provider?: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
    case "openrouter":
    default:
      return "https://openrouter.ai/api/v1";
  }
}

function getModelCandidates(provider: string, model: string): string[] {
  const candidates = [model];

  if (provider === "deepseek") {
    if (model === "deepseek-chat") candidates.push("deepseek-v3");
    if (model === "deepseek-reasoner") candidates.push("deepseek-r1");
    if (model.endsWith(":free")) candidates.push(model.replace(":free", ""));
  }

  return [...new Set(candidates)];
}

function getNonOverlappingSuffix(current: string, incoming: string): string {
  if (!incoming) return "";
  if (!current) return incoming;

  if (incoming.startsWith(current)) {
    return incoming.slice(current.length);
  }

  const maxOverlap = Math.min(current.length, incoming.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (current.endsWith(incoming.slice(0, overlap))) {
      return incoming.slice(overlap);
    }
  }

  return incoming;
}

function normalizeWordToken(token: string): string {
  return token.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}

function collapseAdjacentDuplicateWords(
  text: string,
  previousWord: string | null
): { text: string; lastWord: string | null } {
  const parts = text.split(/(\s+)/);
  const out: string[] = [];
  let lastWord = previousWord;

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out.push(part);
      continue;
    }

    const normalized = normalizeWordToken(part);
    if (normalized && normalized === lastWord) {
      continue;
    }

    out.push(part);
    if (normalized) lastWord = normalized;
  }

  return { text: out.join(""), lastWord };
}

async function loadSettings(): Promise<AppSettings> {
  try {
    const db = await import("@/lib/db");
    await db.initDb();
    return await db.getSettings();
  } catch (error) {
    console.warn("[API/chat] Failed to load settings from DB, falling back to env:", error);
    return {};
  }
}

export async function POST(request: Request) {
  try {
    const { messages, sessionId, model } = await request.json();
    const userMessage = messages[messages.length - 1].content;
    const settings = await loadSettings();
    const provider = settings.llm_provider || "openrouter";
    const baseURL = getBaseURL(provider);
    const activeModel =
      settings.llm_model || model || process.env.DEFAULT_MODEL || "deepseek/deepseek-chat";
    const apiKey = settings.llm_api_key || process.env.OPENROUTER_API_KEY || "";

    if (!apiKey) {
      return NextResponse.json(
        { error: "LLM API key is missing. Configure it in /settings." },
        { status: 400 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let rawStreamText = "";
          let lastSentWord: string | null = null;
          const headers: Record<string, string> = {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          };
          if (provider === "openrouter") {
            headers["HTTP-Referer"] = "https://nudgebot.app";
            headers["X-Title"] = "Nudgebot";
          }

          const modelCandidates = getModelCandidates(provider, activeModel);
          let response: Response | null = null;
          let chosenModel = activeModel;
          let lastStatus = 0;
          let lastDetails = "";

          for (const candidate of modelCandidates) {
            response = await fetch(`${baseURL}/chat/completions`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                model: candidate,
                messages: [
                  { role: "system", content: "You are NudgeBot, an expert security and code audit assistant. ALWAYS respond in English." },
                  { role: "user", content: userMessage }
                ],
                stream: true,
              }),
            });

            if (response.ok) {
              chosenModel = candidate;
              break;
            }

            lastStatus = response.status;
            lastDetails = await response.text().catch(() => "");

            if (provider !== "deepseek") break;
            const isModelMissing = /Model Not Exist/i.test(lastDetails);
            if (!isModelMissing) break;
            console.warn(`[API/chat] Model "${candidate}" unavailable on DeepSeek, trying fallback...`);
          }

          if (!response || !response.ok) {
            throw new Error(
              `API Error: ${lastStatus}${lastDetails ? ` - ${lastDetails.slice(0, 300)}` : ""}`
            );
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
                  const freshRaw = getNonOverlappingSuffix(rawStreamText, String(content));
                  if (!freshRaw) continue;
                  rawStreamText += freshRaw;

                  let freshContent = freshRaw;
                  if (provider === "deepseek") {
                    const cleaned = collapseAdjacentDuplicateWords(freshRaw, lastSentWord);
                    freshContent = cleaned.text;
                    lastSentWord = cleaned.lastWord;
                  }
                  if (!freshContent) continue;

                  controller.enqueue(
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: "delta", content: freshContent })}\n\n`)
                  );
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }

          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", model: chosenModel })}\n\n`)
          );
          controller.close();
        } catch (error: any) {
          console.error("[API] Error:", error);
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`)
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
