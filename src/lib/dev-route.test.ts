import { isNotFound } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Route } from "@/routes/dev";

// The /dev page hands out any identity, so outside development it must be a
// real not-found (HTTP 404 from the server render), not a page that only
// looks like one while answering 200.
describe("/dev", () => {
  const beforeLoad = () => (Route.options.beforeLoad as () => void)();

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is not found in a production build", () => {
    vi.stubEnv("DEV", false);
    let thrown: unknown;
    try {
      beforeLoad();
    } catch (error) {
      thrown = error;
    }
    expect(isNotFound(thrown)).toBe(true);
  });

  it("still loads in development", () => {
    vi.stubEnv("DEV", true);
    expect(() => beforeLoad()).not.toThrow();
  });
});
