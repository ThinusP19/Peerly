import type pg from "pg";

import { pool, query } from "../db/pool.ts";
import type { Role } from "../domain/types.ts";

/**
 * The audit trail (FR-27, SR-15, OR-09).
 *
 * Append-only, and not as a convention: `audit_entries` carries triggers that
 * raise on UPDATE and on DELETE, so no user - System Administrator included -
 * can amend or remove an entry through this API or any other route into the
 * database.
 *
 * The table has no foreign keys on purpose. An entry has to outlive the thing
 * it describes: FR-28 keeps the record of a deletion, and a cascade that
 * tidied the log away as its class was removed would destroy exactly the
 * evidence the log exists to hold.
 *
 * `record` takes a transaction client so the entry lands in the same
 * transaction as the change it describes. That is the whole point - an audit
 * entry for a write that rolled back is a lie, and a write with no entry is an
 * unexplained change, which is what Objective 6 exists to prevent.
 */

export type AuditEventType =
  | "account.created"
  | "account.updated"
  | "account.activated"
  | "account.deactivated"
  | "class.imported"
  | "groups.confirmed"
  | "assessment.created"
  | "assessment.updated"
  | "assessment.opened"
  | "assessment.closed"
  | "assessment.reopened"
  | "marks.entered"
  | "marks.calculated"
  | "mark.overridden"
  | "results.exported"
  | "class.created"
  | "class.deleted"
  | "assessment.deleted"
  | "enrolment.resolved"
  | "password.changed"
  | "reminders.sent";

export interface Actor {
  id?: string | undefined;
  name: string;
  surname?: string | undefined;
  role?: Role | undefined;
}

export interface AuditEvent {
  actor: Actor;
  eventType: AuditEventType;
  /** What was acted on, in the words the log will show. */
  objectDescription: string;
  detail?: string;
  classId?: string | undefined;
  assessmentId?: string | undefined;
  /** OR-09: what a mark or a setting looked like either side of the change. */
  before?: unknown;
  after?: unknown;
}

type Executor = Pick<pg.PoolClient, "query">;

/**
 * Appends an entry.
 *
 * The actor's name is stored, not just their id, so the log still reads
 * correctly after an account is renamed or removed - the record is of what
 * happened at the time, not of what is true now.
 *
 * Never throws in a way that would fail the caller's transaction for its own
 * reasons: the insert is plain, and the only way it fails is if the database is
 * already failing the surrounding write too.
 */
export async function record(event: AuditEvent, sql: Executor = pool): Promise<void> {
  const actorName = [event.actor.name, event.actor.surname].filter(Boolean).join(" ").trim();

  await sql.query(
    `INSERT INTO audit_entries
       (actor_id, actor_name, actor_role, event_type, object_description, detail,
        class_id, assessment_id, before_state, after_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      event.actor.id ?? null,
      actorName || "System",
      event.actor.role ?? null,
      event.eventType,
      event.objectDescription,
      event.detail ?? "",
      event.classId ?? null,
      event.assessmentId ?? null,
      event.before === undefined ? null : JSON.stringify(event.before),
      event.after === undefined ? null : JSON.stringify(event.after),
    ],
  );
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: Role | null;
  eventType: AuditEventType;
  objectDescription: string;
  detail: string;
  classId?: string;
}

export interface AuditFilter {
  /** A lecturer sees their own classes; an administrator sees everything. */
  classIds?: string[] | undefined;
  eventType?: AuditEventType | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit?: number | undefined;
}

/**
 * Reads the log, newest first.
 *
 * A lecturer's view is scoped to the classes they own. Entries with no class -
 * an account activation, a password change - belong to the administrator's
 * view only, since they are not about anybody's teaching.
 */
export async function getAuditEntries(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  const { rows } = await query<{
    id: string;
    occurred_at: Date;
    actor_name: string;
    actor_role: Role | null;
    event_type: AuditEventType;
    object_description: string;
    detail: string;
    class_id: string | null;
  }>(
    `SELECT id, occurred_at, actor_name, actor_role, event_type,
            object_description, detail, class_id
       FROM audit_entries
      WHERE ($1::uuid[] IS NULL OR class_id = ANY($1::uuid[]))
        AND ($2::text IS NULL OR event_type = $2)
        AND ($3::timestamptz IS NULL OR occurred_at >= $3)
        AND ($4::timestamptz IS NULL OR occurred_at <= $4)
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5`,
    [
      filter.classIds ?? null,
      filter.eventType ?? null,
      filter.from ?? null,
      filter.to ?? null,
      Math.min(filter.limit ?? 500, 1000),
    ],
  );

  return rows.map((row) => ({
    id: String(row.id),
    timestamp: row.occurred_at.toISOString(),
    actorName: row.actor_name,
    actorRole: row.actor_role,
    eventType: row.event_type,
    objectDescription: row.object_description,
    detail: row.detail,
    ...(row.class_id ? { classId: row.class_id } : {}),
  }));
}
