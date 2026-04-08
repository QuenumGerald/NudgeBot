import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const createEchoTool = () =>
  tool(
    async ({ text }) => {
      return `Echo: ${text}`;
    },
    {
      name: "echo_tool",
      description: "Echoes text for diagnostics.",
      schema: z.object({ text: z.string() })
    }
  );

export const createTools = () => {
  return [createEchoTool()];
};
