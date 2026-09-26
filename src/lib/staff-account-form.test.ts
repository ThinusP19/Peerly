import { describe, expect, it } from "vitest";

import { NAME_MAX, accountFormErrors, blankAccountForm } from "./staff-account-form";

describe("blankAccountForm", () => {
  it("starts as a lecturer by default", () => {
    expect(blankAccountForm().role).toBe("lecturer");
  });

  it("starts as an administrator when opened to create one", () => {
    // "Create an administrator" on the last-administrator dialog.
    expect(blankAccountForm("admin")).toEqual({ name: "", surname: "", email: "", role: "admin" });
  });
});

describe("accountFormErrors", () => {
  const valid = { name: "Anneke", surname: "van der Merwe", email: "anneke@nwu.ac.za" };

  it("accepts a valid form", () => {
    expect(accountFormErrors({ ...valid, role: "lecturer" })).toEqual({});
  });

  it("refuses a name longer than the server allows", () => {
    const long = "x".repeat(NAME_MAX + 1);
    const errors = accountFormErrors({ ...valid, name: long, surname: long, role: "lecturer" });
    expect(errors.name).toMatch(/100 characters/);
    expect(errors.surname).toMatch(/100 characters/);
  });

  it("accepts a name exactly at the limit", () => {
    expect(accountFormErrors({ ...valid, name: "x".repeat(NAME_MAX), role: "lecturer" })).toEqual(
      {},
    );
  });
});
