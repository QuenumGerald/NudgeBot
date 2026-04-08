import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export const buildMcpClient = () => {
  return new MultiServerMCPClient({
    mcpServers: {}
  });
};
