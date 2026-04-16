declare module "@google/jules-sdk" {
  interface JulesSession {
    id: string;
    stream(): AsyncIterable<{ type: string; title?: string }>;
    result(): Promise<{ state?: string; pullRequest?: { url: string } }>;
  }

  export const jules: {
    session(options: {
      prompt: string;
      source: { github: string; baseBranch: string };
      autoPr: boolean;
    }): Promise<JulesSession>;
  };
}
