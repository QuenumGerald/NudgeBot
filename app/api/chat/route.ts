import { NextResponse } from "next/server";

export const maxDuration = 120;
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { messages, sessionId, model } = await request.json();
    const activeModel = model || "deepseek/deepseek-chat:free";
    const apiKey = process.env.OPENROUTER_API_KEY || "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://nudgebot.app",
              "X-Title": "Nudgebot",
            },
            body: JSON.stringify({
              model: activeModel,
              messages: [
                { role: "system", content: "You are NudgeBot, an expert security and code audit assistant. ALWAYS respond in English." },
                ...messages
              ],
              stream: true,
            }),
            signal: request.signal,
          });

          if (!response.ok) {
            let errorText = "";
            try { errorText = await response.text(); } catch (e) {}
            throw new Error(`API Error: ${response.status} ${errorText}`);
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
                    new TextEncoder().encode(`data: ${JSON.stringify({ type: "delta", content })}\n\n`)
                  );
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }

          try {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", model: activeModel })}\n\n`)
            );
            controller.close();
          } catch (e) {
            console.error("[API] Error closing stream:", e);
          }
        } catch (error: any) {
          console.error("[API] Error:", error);
          try {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`)
            );
            controller.close();
          } catch (e) {
            console.error("[API] Error sending error to stream:", e);
          }
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
