import { NextResponse } from "next/server";
import { saveMessage, getMemories, getHistory } from "@/lib/memory";
import { runClineTask } from "@/lib/cline";
import { config } from "@/lib/config";

export const maxDuration = 120; // 120 seconds max duration
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { messages, sessionId, model } = await request.json();
    const userMessage = messages[messages.length - 1].content;
    const activeModel = model || config.defaultModel;

    await saveMessage(sessionId, "user", userMessage, activeModel);

    const memories = await getMemories(15);
    const history = await getHistory(sessionId, 30);

    const systemContext = `Tu es Nudgebot, un assistant personnel intelligent et direct.
Tu réponds en français par défaut.
Tu as accès à des outils via Cline : fichiers, shell, web, GitHub, et plus.
Utilise les outils proactivement sans demander confirmation (sauf actions destructrices).
Mémorise automatiquement les préférences et faits importants.
Date/heure: ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}

## Mémoire long terme
${memories.map((m) => `[${m.category}] ${m.content}`).join('\n') || 'Aucune mémoire'}

## Historique
${history.map((h) => `${h.role}: ${h.content.slice(0, 300)}`).join('\n') || 'Nouvelle conversation'}

## Tâche
${userMessage}`;

    const stream = new ReadableStream({
      async start(controller) {
        let assistantFullContent = "";

        await runClineTask(systemContext, activeModel, (event) => {
          if (event.type === "text") {
            assistantFullContent += event.content;
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "delta", content: event.content })}\n\n`)
            );
          } else if (event.type === "tool_start") {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "tool_start", name: event.name, input: event.input })}\n\n`
              )
            );
          } else if (event.type === "tool_result") {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({ type: "tool_result", name: event.name, output: event.output })}\n\n`
              )
            );
          } else if (event.type === "error") {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: event.message })}\n\n`)
            );
          } else if (event.type === "done") {
            saveMessage(sessionId, "assistant", assistantFullContent, activeModel)
              .then(() => {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify({ type: "done", model: activeModel })}\n\n`)
                );
                controller.close();
              })
              .catch((err) => {
                controller.error(err);
              });
          }
        });
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
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
