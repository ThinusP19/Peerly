import { afterEach, describe, expect, it, vi } from "vitest";

import type { User } from "@/mocks/types";
import { activateAssessment, mergePreviewRows, resolveEnrolmentConflict } from "./peerly";

/**
 * What the lecturer's screens actually put on the wire. The API refuses a body
 * it doesn't recognise, so a name that drifts here fails every time in use.
 */

const lecturer = { id: "l1", role: "lecturer", name: "Anneke", surname: "vd Merwe" } as User;

function captureFetch() {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
    return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveEnrolmentConflict (FR-04)", () => {
  it("sends Leave unmatched under the name the API expects", async () => {
    const lastCall = captureFetch();

    await resolveEnrolmentConflict("e1", { kind: "leave-unmatched" }, lecturer);

    expect(lastCall()).toEqual({
      url: "/api/classes/enrolments/e1/resolve",
      body: { kind: "leave-unmatched" },
    });
  });
});

describe("activateAssessment", () => {
  it("sends a new closing time with the transition when one is chosen", async () => {
    const lastCall = captureFetch();

    await activateAssessment("a1", "2026-10-01T20:00:00.000Z");

    expect(lastCall().body).toEqual({ transition: "open", closesAt: "2026-10-01T20:00:00.000Z" });
  });

  it("sends only the transition otherwise", async () => {
    const lastCall = captureFetch();

    await activateAssessment("a1");

    expect(lastCall().body).toEqual({ transition: "open" });
  });
});

describe("mergePreviewRows (FR-09)", () => {
  it("keeps what a broken row held, so the lecturer can tell who it is", () => {
    const rows = mergePreviewRows(
      [{ row: 2, studentNumber: "41200345", name: "Lerato", surname: "Mokoena" }],
      [
        {
          row: 3,
          field: "name",
          message: "No first name in this row.",
          values: { studentNumber: "41200382", name: "", surname: "Nkosi", email: "" },
        },
      ],
    );

    expect(rows.map((row) => row.rowNumber)).toEqual([2, 3]);
    expect(rows[1]).toMatchObject({
      studentNumber: "41200382",
      surname: "Nkosi",
      errors: [{ field: "name", reason: "No first name in this row." }],
    });
  });

  it("shows a row with two problems once, with both reasons", () => {
    const values = { studentNumber: "4120", name: "", surname: "Nkosi", email: "" };
    const rows = mergePreviewRows(
      [],
      [
        { row: 4, field: "studentNumber", message: "Not 8 digits.", values },
        { row: 4, field: "name", message: "No first name in this row.", values },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.errors).toHaveLength(2);
  });
});
