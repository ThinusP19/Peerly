import { Router } from "express";
import { z } from "zod";

import { query } from "../db/pool.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { decodeCursor, getAuditPage } from "../services/audit.ts";

/**
 * The audit log, read-only (FR-27).
 *
 * There is no write route and never will be: entries are appended by the
 * operations they describe, inside their transactions. An endpoint that let
 * anyone add one by hand would make the log a place to plant evidence rather
 * than a record of what happened.
 *
 * There is no delete route either, and adding one would not help - the table's
 * triggers refuse UPDATE and DELETE outright.
 */
export const auditRoutes = Router();

auditRoutes.use(requireAuth, requireRole("lecturer", "admin"));

const filters = z.object({
  eventType: z.string().optional(),
  eventPrefix: z.string().max(40).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  // A calendar day in South African time, as the log displays it (OR-11).
  fromDate: z.iso.date().optional(),
  toDate: z.iso.date().optional(),
  classId: z.uuid().optional(),
  cursor: z
    .string()
    .max(200)
    .refine((value) => decodeCursor(value) !== null, "That page marker isn't valid.")
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

auditRoutes.get("/", async (req, res) => {
  const { user } = currentUser(req);
  const filter = filters.parse(req.query);

  // SR-16: an administrator sees the whole trail, which is their job. A
  // lecturer sees only what happened in classes they own - scoped here by
  // looking their classes up, never by trusting a class id from the query.
  let classIds: string[] | undefined;
  if (user.role === "lecturer") {
    const { rows } = await query<{ id: string }>("SELECT id FROM classes WHERE lecturer_id = $1", [
      user.id,
    ]);
    classIds = rows.map((row) => row.id);
  }
  // Narrowing to one class only ever narrows: for a lecturer it is intersected
  // with what they own, so naming somebody else's class returns nothing.
  if (filter.classId) {
    classIds = (classIds ?? [filter.classId]).filter((id) => id === filter.classId);
  }

  res.json(
    await getAuditPage({
      ...(classIds ? { classIds } : {}),
      ...(filter.eventType ? { eventType: filter.eventType as never } : {}),
      ...(filter.eventPrefix ? { eventPrefix: filter.eventPrefix } : {}),
      ...(filter.from ? { from: filter.from } : {}),
      ...(filter.to ? { to: filter.to } : {}),
      ...(filter.fromDate ? { fromDay: filter.fromDate } : {}),
      ...(filter.toDate ? { toDay: filter.toDate } : {}),
      ...(filter.cursor ? { cursor: filter.cursor } : {}),
      limit: filter.limit ?? 500,
    }),
  );
});
