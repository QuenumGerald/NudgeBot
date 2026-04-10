import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tools as localTools } from "./tools";
import { setupMCP } from "./mcp";

export const createLLM = (provider: string, modelName: string, apiKey: string) => {
  if (provider === "openrouter") {
    return new ChatOpenAI({
      model: modelName || "deepseek/deepseek-chat:free",
      apiKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
      },
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
      configuration: {
        baseURL,
      },
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
    "Tu es NudgeBot, un assistant IA utile.",
    "Affiche toujours une courte section 'Réflexion' (résumée, actionnable, sans divulguer de raisonnement sensible détaillé) avant ta réponse finale.",
    "Tu dois gérer un dossier de travail par projet : utilise d'abord l'outil create_project_workspace pour créer/résoudre le sous-dossier du projet avant de manipuler des fichiers.",
    "Privilégie les outils MCP disponibles pour GitHub, Jira, Confluence, Google Calendar, Render, Netlify et Fetch quand c'est pertinent.",
  ];

  if (previousContext) {
    systemParts.push(`\n--- Contexte des sessions précédentes ---\n${previousContext}\n---`);
  }

  const systemPrompt = systemParts.join(" ");

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
