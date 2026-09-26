import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { downloadResults, getResultRows, removeOverride, setGroupBaseMark } from "./peerly";

/** The API layer's reshaping, with fetch stubbed - no server involved. */

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const apiRow = {
  studentId: "s1",
  groupId: "g1",
  groupNumber: 1,
  student: { id: "s1", name: "Michael", surname: "Botha", studentNumber: "41200752" },
  ratingsReceived: 0,
  meanReceived: null,
  groupMean: null,
  rawFactor: null,
  adjustmentFactor: 1,
  baseMark: 70.3,
  finalMark: 70.3,
  flags: ["not-peer-assessed"],
  received: [],
};

describe("getResultRows", () => {
  it("keeps 'nobody rated them' as null rather than a mean of 0", async () => {
    vi.stubGlobal("fetch", reply(200, { results: [apiRow] }));

    const [row] = await getResultRows("a1");

    expect(row!.result.meanReceived).toBeNull();
    expect(row!.result.finalMark).toBe(70.3);
  });
});

describe("setGroupBaseMark", () => {
  it("passes on whether the change made the calculated marks out of date", async () => {
    vi.stubGlobal("fetch", reply(200, { ok: true, invalidatedCalculation: true }));

    await expect(setGroupBaseMark("a1", "g1", 65)).resolves.toMatchObject({
      invalidatedCalculation: true,
    });
  });

  it("rejects with the server's message for the field, so the row can show it", async () => {
    vi.stubGlobal(
      "fetch",
      reply(400, {
        error: {
          code: "bad_request",
          message: "Enter a mark between 0 and 30.",
          fields: { baseMark: "Enter a mark between 0 and 30." },
        },
      }),
    );

    const error = await setGroupBaseMark("a1", "g1", 45).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).field("baseMark")).toBe("Enter a mark between 0 and 30.");
  });
});

describe("removeOverride", () => {
  it("sends the reason with a DELETE for that one student", async () => {
    const fetch = reply(200, { ok: true });
    vi.stubGlobal("fetch", fetch);

    await removeOverride("a1", "s1", "Overrode the wrong student.");

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/assessments/a1/override/s1");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ reason: "Overrode the wrong student." });
  });
});

describe("downloadResults", () => {
  it("rejects with the server's reason when the export is refused", async () => {
    vi.stubGlobal(
      "fetch",
      reply(409, {
        error: {
          code: "conflict",
          message: "Calculate the marks before exporting, so there is something to export.",
        },
      }),
    );

    await expect(downloadResults("a1")).rejects.toThrow(/Calculate the marks/);
  });

  it("rejects with a plain sentence when Peerly can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(downloadResults("a1")).rejects.toThrow(/couldn't reach Peerly/);
  });
});
