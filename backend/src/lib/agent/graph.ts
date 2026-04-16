import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tools } from "./tools.js";

export const createLLM = (provider: string, modelName: string, apiKey: string) => {
  if (provider === 'openrouter') {
    return new ChatOpenAI({
      model: modelName || 'deepseek/deepseek-chat:free',
      apiKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1"
      },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
    });
  }

  if (provider === 'deepseek') {
    const rawBaseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").trim();
    const baseURL = rawBaseUrl.replace(/\/+$/, "");
    return new ChatOpenAI({
      model: modelName || 'deepseek-chat',
      apiKey,
      configuration: {
        baseURL
      },
      temperature: 0.7,
      streaming: false,
      timeout: 30000,
      useResponsesApi: false,
    });
  }

  return new ChatOpenAI({
    model: modelName || 'gpt-3.5-turbo',
    apiKey,
    temperature: 0.7,
    streaming: false,
    timeout: 30000,
  });
};

// In a real application, setupMCP would be awaited and tools appended,
// but for sync getAgent call we use the statically defined tools.
export const getAgent = (provider: string, modelName: string, apiKey: string) => {
  const graphBuilder = new StateGraph(MessagesAnnotation);

  const llm = createLLM(provider, modelName, apiKey);
  let toolsEnabled = false;

  let llmWithTools: any = llm;
  try {
    llmWithTools = llm.bindTools(tools);
    toolsEnabled = true;
  } catch (e) {
    console.error('Failed to bind tools to LLM, continuing without tools:', e);
  }

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await llmWithTools.invoke([
      new SystemMessage(
        `Tu es NudgeBot, un assistant IA personnel polyvalent et compétent.

Tu peux aider sur TOUS les sujets : questions générales, programmation, rédaction, analyse, brainstorming, math, science, conseil, et bien plus.

Tu disposes aussi d'outils spécialisés que tu peux utiliser quand c'est pertinent :
- Planifier des tâches (rappels, actions différées ou récurrentes)
- Lister et annuler des tâches planifiées

Mais ces outils sont un bonus — tu es avant tout un assistant conversationnel intelligent. Réponds aux questions de l'utilisateur de manière utile et complète, qu'elles concernent les outils ou non.

Réponds en français par défaut, sauf si l'utilisateur écrit dans une autre langue.`
      ),
      ...state.messages,
    ]);
    return { messages: [response] };
  };

  if (toolsEnabled) {
    const toolNode = new ToolNode(tools);

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
