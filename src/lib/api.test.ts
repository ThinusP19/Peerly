import { describe, expect, it } from "vitest";

import { getRouter } from "@/router";

import { ApiError, shouldRetryQuery } from "./api";

const refused = (status: number) => new ApiError(status, { code: "x", message: "x" });

describe("shouldRetryQuery", () => {
  it("never retries a request the server refused as wrong", () => {
    // A malformed id is a 400; a missing or foreign one a 404. Asking again
    // gets the same answer, and only delays the "not found" state.
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(shouldRetryQuery(0, refused(status)), String(status)).toBe(false);
    }
  });

  it("retries failures that may pass on a later try, three times", () => {
    for (const error of [refused(0), refused(500), refused(503), refused(408), refused(429)]) {
      expect(shouldRetryQuery(0, error)).toBe(true);
      expect(shouldRetryQuery(2, error)).toBe(true);
      expect(shouldRetryQuery(3, error)).toBe(false);
    }
    expect(shouldRetryQuery(0, new TypeError("boom"))).toBe(true);
  });

  it("is the app's default for every query", () => {
    const { queryClient } = getRouter().options.context as {
      queryClient: { getDefaultOptions(): { queries?: { retry?: unknown } } };
    };
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(shouldRetryQuery);
  });
});
