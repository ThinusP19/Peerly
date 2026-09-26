import { describe, expect, it } from "vitest";

import {
  ignoredColumns,
  importFieldLabel,
  importResultMessage,
  mappingProblem,
  studentNamesById,
} from "./class-import";

const mapping = (
  overrides: Partial<Record<"studentNumber" | "name" | "surname" | "email", string>>,
) => ({
  studentNumber: "Student Number",
  name: "First Name",
  surname: "Surname",
  email: "",
  ...overrides,
});

describe("mappingProblem (FR-08)", () => {
  it("accepts every required field mapped, with no email", () => {
    expect(mappingProblem(mapping({}))).toBeNull();
  });

  it("refuses a required field left empty, naming it", () => {
    // This used to reach the preview, which then said "Every row passed
    // validation" over a request the server had refused.
    expect(mappingProblem(mapping({ surname: "" }))).toBe(
      "Choose the column that holds the surname.",
    );
  });

  it("names every missing field - two empty fields are not one duplicated column", () => {
    expect(mappingProblem(mapping({ studentNumber: "", surname: "" }))).toBe(
      "Choose the column that holds the student number and surname.",
    );
  });

  it("still refuses one column used for two fields", () => {
    expect(mappingProblem(mapping({ surname: "First Name" }))).toMatch(
      /"First Name" is mapped to more than one field/,
    );
  });
});

describe("ignoredColumns", () => {
  it("names only columns the file really has and no field uses", () => {
    expect(
      ignoredColumns(["Student Number", "First Name", "Surname", "Programme"], mapping({})),
    ).toEqual(["Programme"]);
  });

  it("is empty when every column is used, so no note about a missing Programme column", () => {
    expect(ignoredColumns(["Student Number", "First Name", "Surname"], mapping({}))).toEqual([]);
  });
});

describe("importFieldLabel", () => {
  it("turns the server's field keys into the labels on screen", () => {
    expect(importFieldLabel("studentNumber")).toBe("Student number");
    expect(importFieldLabel("name")).toBe("First name");
    expect(importFieldLabel("surname")).toBe("Surname");
  });
});

describe("importResultMessage", () => {
  it("names the conflicts, which need the lecturer", () => {
    const message = importResultMessage(
      { imported: 15, updated: 0, matched: 13, unmatched: 1, conflicts: 1 },
      "CMPG323",
    );
    expect(message).toBe(
      "15 new students added to CMPG323. The class list now has 13 matched to an account, 1 still unmatched and 1 conflict to resolve.",
    );
  });

  it("says a re-import updated rows rather than claiming nothing was imported", () => {
    const message = importResultMessage(
      { imported: 0, updated: 5, matched: 5, unmatched: 0, conflicts: 0 },
      "CMPG323",
    );
    expect(message).toContain("5 already on the list updated");
    expect(message).not.toContain("conflict");
  });
});

describe("studentNamesById", () => {
  it("names every matched student, grouped or not", () => {
    // The allocation preview used the group roster, which lists only grouped
    // students - on a first allocation every name came out blank.
    const names = studentNamesById([
      {
        userId: "u1",
        importedName: "Lerato",
        importedSurname: "Mokoena",
        account: { name: "Lerato", surname: "Mokoena" },
      },
      { userId: "u2", importedName: "Thandi", importedSurname: "Nkosi" },
      { importedName: "Nobody", importedSurname: "Registered" },
    ]);

    expect(names.get("u1")).toEqual({ name: "Lerato", surname: "Mokoena" });
    expect(names.get("u2")).toEqual({ name: "Thandi", surname: "Nkosi" });
    expect(names.size).toBe(2);
  });

  it("prefers the account's own name to the class list's", () => {
    const names = studentNamesById([
      {
        userId: "u1",
        importedName: "Werner",
        importedSurname: "Steyn",
        account: { name: "Werner Jan", surname: "Steyn" },
      },
    ]);
    expect(names.get("u1")?.name).toBe("Werner Jan");
  });
});
