import path from "path";

export const config = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Nudgebot",
  appPassword: process.env.APP_PASSWORD || "",
  appSecret: process.env.APP_SECRET || "dev-secret",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  defaultModel: process.env.DEFAULT_MODEL || "deepseek/deepseek-chat-v3-0324:free",
  githubToken: process.env.GITHUB_TOKEN || "",
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), "data"),
  isRender: !!process.env.RENDER,
  isDocker: !!process.env.DOCKER,
};

export const clineStateDir = path.join(config.dataDir, ".cline");
export const workspaceDir = path.join(config.dataDir, "workspace");
