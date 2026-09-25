import { describe, expect, it } from "vitest";

import { parseSignInAudience } from "./sign-in-audience";

describe("parseSignInAudience", () => {
  it("accepts each sign-in form, including the administrators' own", () => {
    expect(parseSignInAudience("student")).toBe("student");
    expect(parseSignInAudience("lecturer")).toBe("lecturer");
    expect(parseSignInAudience("admin")).toBe("admin");
  });

  it("drops anything else, so a hand-edited URL falls back to role selection", () => {
    expect(parseSignInAudience("Admin")).toBeUndefined();
    expect(parseSignInAudience("superuser")).toBeUndefined();
    expect(parseSignInAudience(undefined)).toBeUndefined();
    expect(parseSignInAudience(["admin"])).toBeUndefined();
  });
});
