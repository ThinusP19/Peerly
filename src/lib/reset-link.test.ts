import { describe, expect, it } from "vitest";

import { resetLinkState } from "./reset-link";

describe("resetLinkState", () => {
  it("says a link with no token is incomplete before any password is typed", () => {
    expect(resetLinkState(undefined, false)).toBe("missing");
    expect(resetLinkState("", false)).toBe("missing");
    expect(resetLinkState("   ", false)).toBe("missing");
  });

  it("shows the expired state once the server refuses the token", () => {
    expect(resetLinkState("abc123", true)).toBe("expired");
    expect(resetLinkState("expired", false)).toBe("expired");
  });

  it("shows the form for a token worth trying", () => {
    expect(resetLinkState("abc123", false)).toBe("form");
  });
});
