import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export interface AgentConfig {
  provider: string;
  model: string;
  apiKey: string;
}

// Simple test tool
const calculatorTool = tool(
  async ({ operation, a, b }) => {
    switch (operation) {
      case "add": return `${a + b}`;
      case "subtract": return `${a - b}`;
      case "multiply": return `${a * b}`;
      case "divide": return `${a / b}`;
      default: return "Unknown operation";
    }
  },
  {
    name: "calculator",
    description: "Perform basic math operations",
    schema: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number(),
      b: z.number(),
    }),
  }
);

const tools = [calculatorTool];

export function createAgentGraph(config: AgentConfig) {
  let llm: ChatOpenAI;

  if (config.provider === 'openrouter') {
    llm = new ChatOpenAI({
      modelName: config.model || "deepseek/deepseek-chat",
      openAIApiKey: config.apiKey || process.env.OPENROUTER_API_KEY,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "NudgeBot",
        }
      },
      temperature: 0,
      streaming: true
    });
  } else {
    // Default OpenAI
    llm = new ChatOpenAI({
      modelName: config.model || "gpt-4o-mini",
      openAIApiKey: config.apiKey || process.env.OPENAI_API_KEY,
      temperature: 0,
      streaming: true
    });
  }

  const modelWithTools = llm.bindTools(tools);

  interface AgentState {
    messages: BaseMessage[];
  }

  const graphState = {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
  };

  const callModel = async (state: AgentState, config: any) => {
    const { messages } = state;
    const response = await modelWithTools.invoke(messages, config);
    return { messages: [response] };
  };

  const callTool = async (state: AgentState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return { messages: [] };
    }

    const toolCalls = lastMessage.tool_calls;
    const toolResults = [];

    for (const toolCall of toolCalls) {
      const selectedTool = tools.find((t) => t.name === toolCall.name);
      if (selectedTool) {
        try {
          const result = await selectedTool.invoke({ name: toolCall.name, args: toolCall.args, id: toolCall.id, type: "tool_call" });
          toolResults.push(new ToolMessage({
            tool_call_id: toolCall.id!,
            content: typeof result === 'string' ? result : JSON.stringify(result),
            name: toolCall.name
          }));
        } catch (e: any) {
          toolResults.push(new ToolMessage({
            tool_call_id: toolCall.id!,
            content: `Error: ${e.message}`,
            name: toolCall.name
          }));
        }
      }
    }

    return { messages: toolResults };
  };

  const shouldContinue = (state: AgentState) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    return END;
  };

  const workflow = new StateGraph<AgentState>({ channels: graphState })
    .addNode("agent", callModel)
    .addNode("tools", callTool)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addEdge("tools", "agent");

  return workflow.compile();
}
