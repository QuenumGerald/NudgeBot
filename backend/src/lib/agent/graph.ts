import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import type { ChatMessage, StreamEvent } from "../../types/index.js";
import { createTools } from "./tools.js";

interface AgentConfig {
  provider: string;
  model: string;
  apiKey?: string;
}

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (_, right) => right,
    default: () => []
  })
});

const providerBaseUrl = (provider: string): string | undefined => {
  switch (provider) {
    case "openrouter":
      return "https://openrouter.ai/api/v1";
    case "deepseek":
      return "https://api.deepseek.com/v1";
    default:
      return undefined;
  }
};

const toLangChainMessages = (messages: ChatMessage[]): BaseMessage[] =>
  messages.map((message) => {
    if (message.role === "system") return new SystemMessage(message.content);
    if (message.role === "assistant") return new AIMessage(message.content);
    return new HumanMessage(message.content);
  });

export const streamChatGraph = async function* (
  rawMessages: ChatMessage[],
  config: AgentConfig
): AsyncGenerator<StreamEvent> {
  const tools = createTools();
  const llm = new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    configuration: {
      baseURL: providerBaseUrl(config.provider)
    }
  }).bindTools(tools);

  const callModel = async (state: typeof AgentState.State) => {
    const response = await llm.invoke(state.messages);
    return { messages: [...state.messages, response] };
  };

  const callTool = async (state: typeof AgentState.State) => {
    const latest = state.messages[state.messages.length - 1];
    if (!(latest instanceof AIMessage) || !latest.tool_calls?.length) {
      return { messages: state.messages };
    }

    const toolCall = latest.tool_calls[0];
    const tool = tools.find((candidate) => candidate.name === toolCall.name);
    if (!tool) {
      return { messages: state.messages };
    }

    const toolResult = await tool.invoke({ name: toolCall.name, args: toolCall.args as Record<string, unknown> });
    const toolMessage = new ToolMessage({
      tool_call_id: toolCall.id ?? "tool-call",
      content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult)
    });

    return { messages: [...state.messages, toolMessage] };
  };

  const shouldContinue = (state: typeof AgentState.State): typeof END | "tool" => {
    const latest = state.messages[state.messages.length - 1];
    if (latest instanceof AIMessage && latest.tool_calls?.length) {
      return "tool";
    }
    return END;
  };

  const graph = new StateGraph(AgentState)
    .addNode("model", callModel)
    .addNode("tool", callTool)
    .addEdge(START, "model")
    .addConditionalEdges("model", shouldContinue)
    .addEdge("tool", "model")
    .compile();

  yield { type: "thinking", payload: { message: "NudgeBot is thinking..." } };
  const result = await graph.invoke({ messages: toLangChainMessages(rawMessages) });
  const output = result.messages[result.messages.length - 1];

  if (output instanceof AIMessage) {
    if (output.tool_calls?.length) {
      for (const call of output.tool_calls) {
        yield { type: "tool_start", payload: { name: call.name, input: call.args } };
        yield { type: "tool_result", payload: { name: call.name, result: "Tool call completed." } };
      }
    }

    const content = typeof output.content === "string" ? output.content : JSON.stringify(output.content);
    for (const chunk of content.split(/(\s+)/).filter(Boolean)) {
      yield { type: "delta", payload: { text: chunk } };
    }
  }

  yield { type: "done", payload: {} };
};
