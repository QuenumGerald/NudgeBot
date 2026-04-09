import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { tools } from "./tools";
import { setupMCP } from "./mcp";

// In a real application, setupMCP would be awaited and tools appended,
// but for sync getAgent call we use the statically defined tools.
export const getAgent = (provider: string, modelName: string, apiKey: string) => {
  const graphBuilder = new StateGraph(MessagesAnnotation);

  let llm;

  if (provider === 'openrouter') {
    llm = new ChatOpenAI({
      modelName: modelName || 'deepseek/deepseek-chat:free',
      openAIApiKey: apiKey,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1"
      },
      temperature: 0.7,
      streaming: true,
    });
  } else {
    llm = new ChatOpenAI({
      modelName: modelName || 'gpt-3.5-turbo',
      openAIApiKey: apiKey,
      temperature: 0.7,
      streaming: true,
    });
  }

  const llmWithTools = llm.bindTools(tools);

  const callModel = async (state: typeof MessagesAnnotation.State) => {
    const response = await llmWithTools.invoke([
      new SystemMessage("You are NudgeBot, a helpful AI assistant. You have access to tools. If you need to use a tool, use it."),
      ...state.messages,
    ]);
    return { messages: [response] };
  };

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

  return graphBuilder.compile();
};
