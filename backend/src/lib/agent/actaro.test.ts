import { describe, it, expect } from "vitest";
import { z } from "zod";
import { runVerifiedAction } from "./actaro.js";

describe("Actaro Integration", () => {
  it("should run action and produce a verified receipt", async () => {
    let internalState = 0;

    const result = await runVerifiedAction({
      name: "test-action",
      description: "Increments state and verifies value",
      inputSchema: z.object({ amount: z.number() }),
      input: { amount: 5 },
      execute: async ({ amount }) => {
        internalState += amount;
        return { newAmount: internalState };
      },
      verify: async ({ amount }) => {
        if (internalState === amount) {
          return {
            status: "verified" as const,
            evidence: { state: internalState },
          };
        }
        return { status: "failed" as const, reason: "State did not match expected amount" };
      },
    });

    expect(result.receipt.status).toBe("verified");
    expect(result.agentResult.canClaimCompletion).toBe(true);
    expect(result.output).toContain("[Actaro Verification: status=verified, verified=true]");
  });

  it("should produce a failed receipt if verification fails", async () => {
    const result = await runVerifiedAction({
      name: "test-fail-action",
      inputSchema: z.object({ value: z.string() }),
      input: { value: "test" },
      execute: async () => {
        return "done";
      },
      verify: async () => {
        return { status: "failed" as const, reason: "Verification check intentionally failed" };
      },
    });

    expect(result.receipt.status).toBe("failed");
    expect(result.agentResult.canClaimCompletion).toBe(false);
    expect(result.output).toContain("[Actaro Verification: status=failed, verified=false]");
  });
});
