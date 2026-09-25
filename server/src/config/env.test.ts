import { afterEach, describe, expect, it, vi } from "vitest";

/** `env.ts` reads the environment once, at import, so each case imports it fresh. */
async function loadEnv(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("./env.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("listen address", () => {
  it("is unset by default, so development listens on every interface", async () => {
    const { env } = await loadEnv({ NODE_ENV: "test", MAIL_TRANSPORT: "log", HOST: "" });
    expect(env.host).toBeUndefined();
  });

  it("takes HOST when set, so production can bind to loopback only", async () => {
    const { env } = await loadEnv({ NODE_ENV: "test", MAIL_TRANSPORT: "log", HOST: "127.0.0.1" });
    expect(env.host).toBe("127.0.0.1");
  });
});
