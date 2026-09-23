import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { closePool, query, withTransaction } from "../db/pool.ts";
import { createUser, resetDatabase } from "../test/helpers.ts";
import { getAuditEntries, record } from "./audit.ts";
import { registerStudent, verifyEmailCode } from "./registration.ts";
import { changePassword } from "./recovery.ts";

vi.mock("../lib/mail.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/mail.ts")>()),
  queue: vi.fn(),
}));

import * as mail from "../lib/mail.ts";

const lastCodeFor = (email: string) => {
  const message = [...vi.mocked(mail.queue).mock.calls.map(([m]) => m)]
    .reverse()
    .find((m) => m.to.toLowerCase() === email.toLowerCase());
  return message?.subject.split(" ")[0] ?? "";
};

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(mail.queue).mockClear();
});
afterAll(closePool);

describe("the log is append-only (FR-27, SR-15)", () => {
  it("refuses an UPDATE, whoever attempts it", async () => {
    await record({
      actor: { name: "Someone" },
      eventType: "class.created",
      objectDescription: "X",
    });

    await expect(query("UPDATE audit_entries SET detail = 'rewritten'")).rejects.toThrow(
      /append-only/,
    );
  });

  it("refuses a DELETE", async () => {
    await record({
      actor: { name: "Someone" },
      eventType: "class.created",
      objectDescription: "X",
    });

    await expect(query("DELETE FROM audit_entries")).rejects.toThrow(/append-only/);
  });
});

describe("record", () => {
  it("keeps the actor's name, not only their id", async () => {
    // The log has to still read correctly after a rename or a deletion: it is a
    // record of what happened then, not of what is true now.
    const user = await createUser({ role: "lecturer", name: "Anneke", surname: "van der Merwe" });
    await record({
      actor: { id: user.id, name: "Anneke", surname: "van der Merwe", role: "lecturer" },
      eventType: "class.created",
      objectDescription: "CMPG323",
    });
    await query("UPDATE users SET name = 'Renamed' WHERE id = $1", [user.id]);

    const [entry] = await getAuditEntries();
    expect(entry!.actorName).toBe("Anneke van der Merwe");
  });

  it("survives the thing it describes being deleted (FR-28)", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
       VALUES ('CMPG323', 'Test', '2026 S2', $1) RETURNING id`,
      [lecturer.id],
    );
    await record({
      actor: { id: lecturer.id, name: "Anneke", role: "lecturer" },
      eventType: "class.deleted",
      objectDescription: "CMPG323",
      classId: rows[0]!.id,
    });

    await query("DELETE FROM classes WHERE id = $1", [rows[0]!.id]);

    // No foreign key, so no cascade took the evidence with it.
    expect(await getAuditEntries()).toHaveLength(1);
  });

  it("rolls back with the change it describes (OR-05)", async () => {
    // An entry for a write that did not happen is a lie.
    await expect(
      withTransaction(async (sql) => {
        await record(
          { actor: { name: "Someone" }, eventType: "class.created", objectDescription: "X" },
          sql,
        );
        throw new Error("the surrounding write failed");
      }),
    ).rejects.toThrow();

    expect(await getAuditEntries()).toHaveLength(0);
  });

  it("stores before and after state for a change that needs explaining (OR-09)", async () => {
    await record({
      actor: { name: "Anneke" },
      eventType: "mark.overridden",
      objectDescription: "Lerato Mokoena",
      before: { mark: 58 },
      after: { mark: 65 },
    });

    const { rows } = await query<{ before_state: unknown; after_state: unknown }>(
      "SELECT before_state, after_state FROM audit_entries",
    );
    expect(rows[0]!.before_state).toEqual({ mark: 58 });
    expect(rows[0]!.after_state).toEqual({ mark: 65 });
  });
});

describe("entries are written by the operations themselves", () => {
  const registration = {
    name: "Thandi",
    surname: "Nkosi",
    email: "41200345@mynwu.ac.za",
    studentNumber: "41200345",
    password: "a decent passphrase",
  };

  it("records a self-registration", async () => {
    await registerStudent(registration);

    const [entry] = await getAuditEntries();
    expect(entry).toMatchObject({ eventType: "account.created", actorName: "Thandi Nkosi" });
  });

  it("records an activation, and only once the code is right", async () => {
    await registerStudent(registration);
    await verifyEmailCode(registration.email, "000000").catch(() => undefined);

    expect((await getAuditEntries()).map((e) => e.eventType)).toEqual(["account.created"]);

    await verifyEmailCode(registration.email, lastCodeFor(registration.email));

    expect((await getAuditEntries()).map((e) => e.eventType)).toEqual([
      "account.activated",
      "account.created",
    ]);
  });

  it("records a password change without recording the password (SR-14)", async () => {
    const user = await createUser({ password: "a decent passphrase" });
    await changePassword(user.id, "a decent passphrase", "a brand new phrase");

    const [entry] = await getAuditEntries();
    expect(entry!.eventType).toBe("password.changed");
    expect(JSON.stringify(entry)).not.toContain("brand new phrase");
    expect(JSON.stringify(entry)).not.toContain("decent passphrase");
  });
});

describe("getAuditEntries", () => {
  it("returns newest first", async () => {
    for (const code of ["class.created", "class.deleted"] as const) {
      await record({ actor: { name: "Anneke" }, eventType: code, objectDescription: "CMPG323" });
    }

    expect((await getAuditEntries()).map((e) => e.eventType)).toEqual([
      "class.deleted",
      "class.created",
    ]);
  });

  it("filters by event type", async () => {
    await record({ actor: { name: "A" }, eventType: "class.created", objectDescription: "X" });
    await record({ actor: { name: "A" }, eventType: "class.deleted", objectDescription: "X" });

    const entries = await getAuditEntries({ eventType: "class.deleted" });
    expect(entries).toHaveLength(1);
  });

  it("scopes a lecturer to the classes they were given", async () => {
    const lecturer = await createUser({ role: "lecturer" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
       VALUES ('CMPG323', 'Mine', '2026 S2', $1), ('CMPG315', 'Theirs', '2026 S2', $1)
       RETURNING id`,
      [lecturer.id],
    );
    await record({
      actor: { name: "A" },
      eventType: "groups.confirmed",
      objectDescription: "Mine",
      classId: rows[0]!.id,
    });
    await record({
      actor: { name: "A" },
      eventType: "groups.confirmed",
      objectDescription: "Theirs",
      classId: rows[1]!.id,
    });

    const entries = await getAuditEntries({ classIds: [rows[0]!.id] });
    expect(entries.map((e) => e.objectDescription)).toEqual(["Mine"]);
  });

  it("hides entries with no class from a class-scoped view", async () => {
    // A password change belongs to the administrator's view, not a lecturer's.
    const lecturer = await createUser({ role: "lecturer" });
    const { rows } = await query<{ id: string }>(
      `INSERT INTO classes (module_code, name, academic_period, lecturer_id)
       VALUES ('CMPG323', 'Mine', '2026 S2', $1) RETURNING id`,
      [lecturer.id],
    );
    await record({ actor: { name: "A" }, eventType: "password.changed", objectDescription: "X" });

    expect(await getAuditEntries({ classIds: [rows[0]!.id] })).toHaveLength(0);
    expect(await getAuditEntries()).toHaveLength(1);
  });
});
