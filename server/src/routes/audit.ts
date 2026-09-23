import { Router } from "express";
import { z } from "zod";

import { query } from "../db/pool.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { getAuditEntries } from "../services/audit.ts";

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
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
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

  res.json({
    entries: await getAuditEntries({
      ...(classIds ? { classIds } : {}),
      ...(filter.eventType ? { eventType: filter.eventType as never } : {}),
      ...(filter.from ? { from: filter.from } : {}),
      ...(filter.to ? { to: filter.to } : {}),
    }),
  });
});
