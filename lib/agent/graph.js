const { StateGraph, Annotation } = require("@langchain/langgraph");
const { ToolNode, toolsCondition } = require("@langchain/langgraph/prebuilt");
const { ChatOpenAI } = require("@langchain/openai");
const { TOOLS } = require("./tools");

const GraphState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

function buildAgentGraph(model) {
  const llm = new ChatOpenAI({
    modelName: model,
    openAIApiKey: process.env.OPENROUTER_API_KEY || "",
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://nudgebot.app",
        "X-Title": "Nudgebot",
      },
    },
    streaming: true,
  }).bindTools(TOOLS);

  const toolNode = new ToolNode(TOOLS);

  async function callAgent(state) {
    const response = await llm.invoke(state.messages);
    return { messages: [response] };
  }

  return new StateGraph(GraphState)
    .addNode("agent", callAgent)
    .addNode("tools", toolNode)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", toolsCondition)
    .addEdge("tools", "agent")
    .compile();
}

module.exports = { buildAgentGraph };
