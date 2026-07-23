import { isPolyfilled } from "../../polyfill.js";
if (!isPolyfilled) console.log("[actaro] polyfill failed");
import path from "path";
import fs from "fs";

let actaroSdkModule: typeof import("actaro-sdk") | null = null;

export const getActaroModule = async () => {
  if (!actaroSdkModule) {
    actaroSdkModule = await import("actaro-sdk");
  }
  return actaroSdkModule;
};

let clientInstance: any = null;

export const getActaroClient = async () => {
  if (clientInstance) return clientInstance;

  const { createActaro, fileStore } = await getActaroModule();

  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const storePath = path.join(dataDir, "receipts.jsonl");

  clientInstance = createActaro({
    store: fileStore(storePath),
    redaction: {
      fields: [
        "password",
        "apiKey",
        "token",
        "secret",
        "jwtSecret",
        "adminPassword",
        /password/i,
        /token/i,
        /key/i,
        /secret/i,
      ],
    },
    verification: {
      retries: 2,
      delayMs: 300,
      timeoutMs: 5000,
    },
  });

  return clientInstance;
};

export type ActionVerificationResult =
  | { status: "verified"; evidence?: unknown }
  | { status: "pending"; reason?: string; evidence?: unknown }
  | { status: "failed"; reason: string; evidence?: unknown };

export type ActionVerifier<T = any, R = any> = (
  input: T,
  executeResult: R
) => Promise<ActionVerificationResult> | ActionVerificationResult;

export const runVerifiedAction = async <T extends Record<string, any>>(options: {
  name: string;
  description?: string;
  inputSchema: any;
  input: T;
  execute: (input: T) => Promise<any>;
  verify?: ActionVerifier<T>;
}) => {
  const { defineAction, toAgentResult } = await getActaroModule();
  const client = await getActaroClient();

  const verifyFn: ActionVerifier<T> = options.verify
    ? options.verify
    : async (_input: T, executeResult: any) => {
        if (executeResult !== undefined && executeResult !== null) {
          return {
            status: "verified" as const,
            evidence: {
              completed: true,
              resultType: typeof executeResult,
            },
          };
        }
        return {
          status: "failed" as const,
          reason: "Execution returned empty or undefined result.",
        };
      };

  const action = defineAction({
    name: options.name,
    description: options.description,
    input: options.inputSchema,
    execute: async (input: T) => {
      return await options.execute(input);
    },
    verify: async (input: T, execution: any) => {
      return await verifyFn(input, execution);
    },
  });

  const receipt = await client.run(action, options.input);
  const agentResult = toAgentResult(receipt);

  return {
    receipt,
    agentResult,
    output: `${agentResult.toolResult}\n[Actaro Verification: status=${receipt.status}, verified=${receipt.status === "verified"}]`,
  };
};
