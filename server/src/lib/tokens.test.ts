import { describe, expect, it } from "vitest";

import {
  expiresInMinutes,
  hashSecret,
  issueNumericCode,
  issueToken,
  secretMatches,
} from "./tokens.ts";

describe("hashSecret", () => {
  it("is deterministic", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
  });

  it("differs for different input", () => {
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });

  it("produces a 64-character hex digest", () => {
    expect(hashSecret("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("secretMatches", () => {
  it("accepts the secret that produced the hash", () => {
    const { secret, hash } = issueToken();
    expect(secretMatches(secret, hash)).toBe(true);
  });

  it("rejects a different secret", () => {
    const { hash } = issueToken();
    expect(secretMatches(issueToken().secret, hash)).toBe(false);
  });

  it("rejects a hash of the wrong length rather than throwing", () => {
    expect(secretMatches("abc", "deadbeef")).toBe(false);
  });

  it("rejects a hash that is not hex rather than throwing", () => {
    expect(secretMatches("abc", "not a hash at all")).toBe(false);
  });

  it("rejects an empty stored hash", () => {
    expect(secretMatches("abc", "")).toBe(false);
  });
});

describe("issueToken", () => {
  it("returns a secret whose hash is the stored one", () => {
    const { secret, hash } = issueToken();
    expect(hashSecret(secret)).toBe(hash);
  });

  it("is base64url, so it survives a query string unescaped", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(issueToken().secret).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => issueToken().secret));
    expect(seen.size).toBe(500);
  });
});

describe("issueNumericCode", () => {
  it("returns a secret whose hash is the stored one", () => {
    const { secret, hash } = issueNumericCode();
    expect(hashSecret(secret)).toBe(hash);
  });

  it("is always exactly six digits", () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(issueNumericCode().secret).toMatch(/^\d{6}$/);
    }
  });

  it("covers the whole range rather than clustering", () => {
    // Not a distribution test - just enough to catch a code that can never
    // start with a zero, or one capped well below 999999.
    const codes = Array.from({ length: 2000 }, () => Number(issueNumericCode().secret));
    expect(Math.min(...codes)).toBeLessThan(100_000);
    expect(Math.max(...codes)).toBeGreaterThan(900_000);
  });

  it("keeps a leading zero, because the code is six digits and not a number", () => {
    const padded = Array.from({ length: 2000 }, () => issueNumericCode().secret).filter((code) =>
      code.startsWith("0"),
    );
    expect(padded.length).toBeGreaterThan(0);
    for (const code of padded) expect(code).toHaveLength(6);
  });
});

describe("expiresInMinutes", () => {
  it("returns a time in the future", () => {
    expect(expiresInMinutes(10).getTime()).toBeGreaterThan(Date.now());
  });

  it("is roughly the requested distance away", () => {
    const drift = Math.abs(expiresInMinutes(30).getTime() - (Date.now() + 30 * 60_000));
    expect(drift).toBeLessThan(1000);
  });
});
