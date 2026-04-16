import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tools as localTools } from "./tools.js";
import { setupMCP } from "./mcp.js";

export const createLLM = (provider: string, modelName: string, apiKey: string) => {
  if (provider === "openrouter") {
    return new ChatOpenAI({
      model: modelName || "deepseek/deepseek-chat:free",
      apiKey,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
    });
  }

  if (provider === "deepseek") {
    const rawBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim();
    const baseURL = rawBaseUrl.replace(/\/+$/, "");
    return new ChatOpenAI({
      model: modelName || "deepseek-chat",
      apiKey,
      configuration: { baseURL },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
      useResponsesApi: false,
    });
  }

  return new ChatOpenAI({
    model: modelName || "gpt-3.5-turbo",
    apiKey,
    temperature: 0.7,
    streaming: false,
    timeout: 30000,
  });
};

export const getAgent = async (
  provider: string,
  modelName: string,
  apiKey: string,
  enabledIntegrations: string[] = [],
  userId: string = "",
  previousContext: string | null = null
) => {
  const graphBuilder = new StateGraph(MessagesAnnotation);

  const llm = createLLM(provider, modelName, apiKey);
  const mcpTools = await setupMCP(enabledIntegrations, userId);
  const allTools = [...localTools, ...mcpTools];

  let toolsEnabled = false;
  let llmWithTools: any = llm;

  try {
    llmWithTools = llm.bindTools(allTools);
    toolsEnabled = allTools.length > 0;
  } catch (e) {
    console.error("Failed to bind tools to LLM, continuing without tools:", e);
  }

  const systemParts = [
    `Tu es NudgeBot, un assistant IA personnel polyvalent et compétent.

Tu peux aider sur TOUS les sujets : questions générales, programmation, rédaction, analyse, brainstorming, math, science, conseil, et bien plus.

Tu disposes d'outils que tu peux utiliser quand c'est pertinent :
- Fichiers : créer, lire, lister, supprimer des fichiers dans l'espace de travail
- Shell : exécuter des commandes
- Scheduling : planifier des tâches uniques ou récurrentes
- Web : récupérer le contenu d'URLs
- Email : envoyer des emails via Resend
- Notes : sauvegarder et relire des notes persistées sur GitHub
- Date/Heure : obtenir la date et l'heure courante
- Google Jules : déléguer des tâches de développement
${mcpTools.length > 0 ? `- MCP : ${enabledIntegrations.join(", ")} (${mcpTools.length} outils MCP chargés)` : ""}

Utilise les outils quand c'est pertinent, mais tu es avant tout un assistant conversationnel intelligent.
Réponds en français par défaut, sauf si l'utilisateur écrit dans une autre langue.`,
  ];

  if (previousContext) {
    systemParts.push(`\n--- Contexte des sessions précédentes ---\n${previousContext}\n---`);
  }

  const systemPrompt = systemParts.join("\n");

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await llmWithTools.invoke([
      new SystemMessage(systemPrompt),
      ...state.messages,
    ]);
    return { messages: [response] };
  };

  if (toolsEnabled) {
    const toolNode = new ToolNode(allTools);

    const shouldContinue = (state: typeof MessagesAnnotation.State) => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];
      if ((lastMessage as any).tool_calls?.length) {
        return "tools";
      }
      return "__end__";
    };

    graphBuilder
      .addNode("agent", callModel)
      .addNode("tools", toolNode)
      .addEdge("__start__", "agent")
      .addConditionalEdges("agent", shouldContinue)
      .addEdge("tools", "agent");
  } else {
    graphBuilder
      .addNode("agent", callModel)
      .addEdge("__start__", "agent")
      .addEdge("agent", "__end__");
  }

  return graphBuilder.compile();
};
