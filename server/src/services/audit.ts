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
  | "reminders.sent"
  | "account.activation_resent"
  | "evaluation.submitted"
  | "evaluation.amended"
  | "enrolment.matched"
  | "enrolment.conflict";

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

/** The university's time zone. A "day" in the log is a day on a South African calendar. */
export const AUDIT_TIME_ZONE = "Africa/Johannesburg";

export interface AuditFilter {
  /** A lecturer sees their own classes; an administrator sees everything. */
  classIds?: string[] | undefined;
  eventType?: AuditEventType | undefined;
  /** Every event type starting with this, e.g. "account." for the dashboard. */
  eventPrefix?: string | undefined;
  /** Exact instants, inclusive. */
  from?: string | undefined;
  to?: string | undefined;
  /**
   * Calendar days, `YYYY-MM-DD`, inclusive, read in South African time (OR-11).
   * The log shows its times in SAST, so an entry at 01:30 on 26 September is
   * filed under the 26th - not under the 25th, which is its date in UTC.
   */
  fromDay?: string | undefined;
  toDay?: string | undefined;
  /** Continue after the last entry of a previous page (its `nextCursor`). */
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** How many entries match the filters in all, not only on this page. */
  total: number;
  /** Pass back as `cursor` for the next page; absent when there is none. */
  nextCursor?: string;
}

/**
 * A page boundary: the exact time and id of the last entry shown.
 *
 * Keyset rather than an offset. The log grows at the newest end, so an offset
 * would shift by however many entries were written between two pages and
 * repeat rows; a cursor never does. The time is kept to the microsecond, which
 * a JavaScript Date cannot hold, so it travels as text.
 */
const encodeCursor = (at: string, id: string) =>
  Buffer.from(`${at}|${id}`, "utf8").toString("base64url");

export function decodeCursor(cursor: string): { at: string; id: string } | null {
  const [at, id, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (rest.length || !at || !id || !/^\d+$/.test(id) || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}

/**
 * Reads the log, newest first, one page at a time, with the total that matches.
 *
 * A lecturer's view is scoped to the classes they own. Entries with no class -
 * an account activation, a password change - belong to the administrator's
 * view only, since they are not about anybody's teaching.
 *
 * Every filter runs here, over the whole trail. Filtering in the browser over
 * whatever had been sent used to hide everything older than the newest 500
 * entries while claiming to show all of them.
 */
export async function getAuditPage(filter: AuditFilter = {}): Promise<AuditPage> {
  const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
  const limit = Math.max(1, Math.min(filter.limit ?? 500, 1000));

  const conditions = `
        ($1::uuid[] IS NULL OR class_id = ANY($1::uuid[]))
    AND ($2::text IS NULL OR event_type = $2)
    AND ($3::text IS NULL OR starts_with(event_type, $3))
    AND ($4::timestamptz IS NULL OR occurred_at >= $4)
    AND ($5::timestamptz IS NULL OR occurred_at <= $5)
    AND ($6::date IS NULL OR occurred_at >= ($6::date)::timestamp AT TIME ZONE '${AUDIT_TIME_ZONE}')
    AND ($7::date IS NULL OR occurred_at < ($7::date + 1)::timestamp AT TIME ZONE '${AUDIT_TIME_ZONE}')`;
  const params = [
    filter.classIds ?? null,
    filter.eventType ?? null,
    filter.eventPrefix ?? null,
    filter.from ?? null,
    filter.to ?? null,
    filter.fromDay ?? null,
    filter.toDay ?? null,
  ];

  const [{ rows }, counted] = await Promise.all([
    query<{
      id: string;
      occurred_at: Date;
      cursor_at: string;
      actor_name: string;
      actor_role: Role | null;
      event_type: AuditEventType;
      object_description: string;
      detail: string;
      class_id: string | null;
    }>(
      `SELECT id, occurred_at,
              to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,
              actor_name, actor_role, event_type, object_description, detail, class_id
         FROM audit_entries
        WHERE ${conditions}
          AND ($8::timestamptz IS NULL OR (occurred_at, id) < ($8::timestamptz, $9::bigint))
        ORDER BY occurred_at DESC, id DESC
        LIMIT $10`,
      [...params, cursor?.at ?? null, cursor?.id ?? null, limit + 1],
    ),
    query<{ total: string }>(
      `SELECT count(*) AS total FROM audit_entries WHERE ${conditions}`,
      params,
    ),
  ]);

  // One row more than the page was asked for is how we know another page exists.
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    entries: page.map((row) => ({
      id: String(row.id),
      timestamp: row.occurred_at.toISOString(),
      actorName: row.actor_name,
      actorRole: row.actor_role,
      eventType: row.event_type,
      objectDescription: row.object_description,
      detail: row.detail,
      ...(row.class_id ? { classId: row.class_id } : {}),
    })),
    total: Number(counted.rows[0]!.total),
    ...(rows.length > limit && last
      ? { nextCursor: encodeCursor(last.cursor_at, String(last.id)) }
      : {}),
  };
}

/** The first page only - what most callers, and most tests, want. */
export async function getAuditEntries(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  return (await getAuditPage(filter)).entries;
}
