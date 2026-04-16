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
  const availableTools = tools
    .map((toolDef: any) => `- ${toolDef.name}: ${toolDef.description}`)
    .join("\n");

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
        `You are NudgeBot, a capable general-purpose AI assistant.

Be concise by default to reduce token usage. Use short, direct answers unless the user asks for more detail.

### Available tools
${availableTools}

Tool rules:
- Use tools only when the user asks for an action that requires them.
- If no tool is needed, answer normally without tool calls.
- Never invent tools beyond the list above.

Language rule: always answer in English unless the user explicitly asks for another language.`
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
