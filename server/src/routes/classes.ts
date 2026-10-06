import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { getAssessmentRows } from "../services/assessments.ts";
import { getClass, getClassSummaries, getEnrolments, getGroups } from "../services/classes.ts";
import { getClassRoster } from "../services/monitoring.ts";
import { parseClassList } from "../services/class-list.ts";
import { commitImport, previewImport, suggestMapping } from "../services/import.ts";
import { createClass } from "../services/classes.ts";
import { badRequest } from "../middleware/errors.ts";
import { classListUpload } from "./uploads.ts";
import { confirmGroups, proposeGroups, regroupingBlockedReason } from "../services/groups.ts";
import { getConflictCandidates, resolveEnrolmentConflict } from "../services/enrolments.ts";
import { classImpact, deleteClass } from "../services/deletion.ts";

/**
 * Class data for the lecturer portal.
 *
 * Every route is behind requireAuth and requireRole, and every one that names a
 * class re-checks ownership in the service. The role gate says "lecturers only";
 * it does not say "this lecturer's class", and conflating the two is how one
 * lecturer ends up reading another's class list.
 */

export const classRoutes = Router();

classRoutes.use(requireAuth, requireRole("lecturer"));

/** Rejects a malformed id before it reaches a query that expects a uuid. */
const classId = z.object({ classId: z.uuid() });

classRoutes.get("/", async (req, res) => {
  res.json({ classes: await getClassSummaries(currentUser(req).user) });
});

classRoutes.get("/:classId", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ klass: await getClass(id, currentUser(req).user) });
});

classRoutes.get("/:classId/enrolments", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ enrolments: await getEnrolments(id, currentUser(req).user) });
});

classRoutes.get("/:classId/groups", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ groups: await getGroups(id, currentUser(req).user) });
});

classRoutes.get("/:classId/assessments", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ assessments: await getAssessmentRows(id, currentUser(req).user) });
});

classRoutes.get("/:classId/roster", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ students: await getClassRoster(id, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Creating a class and importing its list - FR-08, FR-09
 * ------------------------------------------------------------------ */

classRoutes.post("/", async (req, res) => {
  const body = z
    .object({
      moduleCode: z.string().trim().min(1, "Enter the module code."),
      name: z
        .string()
        .trim()
        .min(1, "Enter the module name.")
        .max(120, "Keep the class name to 120 characters or fewer."),
      academicPeriod: z.string().trim().min(1, "Enter the academic period."),
    })
    .parse(req.body);

  res.status(201).json({ klass: await createClass(body, currentUser(req).user) });
});

/**
 * Turns multer's own errors into the API's shape.
 *
 * Without this a file over the limit produces a raw MulterError and a 500,
 * which tells the lecturer nothing about what to do (CI-03, UI-06).
 */
const receiveFile = (req: Request, res: Response, next: NextFunction) =>
  classListUpload(req, res, (error: unknown) => {
    if (!error) return next();
    const code = (error as { code?: string }).code;
    next(
      badRequest(
        code === "LIMIT_FILE_SIZE"
          ? "That file is larger than 5 MB. Please upload a smaller class list."
          : "We couldn't read that upload. Please choose a .csv or .xlsx file.",
      ),
    );
  });

const mapping = z.object({
  studentNumber: z.string().min(1),
  name: z.string().min(1),
  surname: z.string().min(1),
  email: z.string().optional(),
  groupNumber: z.string().optional(),
  groupName: z.string().optional(),
  groupLeader: z.string().optional(),
});

/** Reads the file and reports what the columns look like, before any mapping. */
classRoutes.post("/:classId/import/inspect", receiveFile, async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  // Refused like every other route on a class the caller does not own (SR-07),
  // before any upload is parsed on its behalf.
  await getClass(id, currentUser(req).user);
  if (!req.file) throw badRequest("Choose a file to upload.");

  const sheet = await parseClassList(req.file);
  res.json({
    headers: sheet.headers,
    rowCount: sheet.rows.length,
    suggested: suggestMapping(sheet.headers),
    // A handful of rows so the lecturer can see the mapping is right.
    sample: sheet.rows.slice(0, 5),
  });
});

/** FR-09: the full validation preview the lecturer confirms against. */
classRoutes.post("/:classId/import/preview", receiveFile, async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  if (!req.file) throw badRequest("Choose a file to upload.");

  const sheet = await parseClassList(req.file);
  const columns = mapping.parse(JSON.parse(String(req.body.mapping ?? "{}")));
  res.json({ preview: await previewImport(id, sheet, columns, currentUser(req).user) });
});

classRoutes.post("/:classId/import/commit", receiveFile, async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  if (!req.file) throw badRequest("Choose a file to upload.");

  const sheet = await parseClassList(req.file);
  const columns = mapping.parse(JSON.parse(String(req.body.mapping ?? "{}")));
  const mode = z.enum(["extend", "replace"]).catch("extend").parse(req.body.mode);

  res.json({ result: await commitImport(id, sheet, columns, mode, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Groups - FR-10, FR-11
 * ------------------------------------------------------------------ */

/**
 * Proposes an allocation. Writes nothing, so the lecturer can re-draw freely
 * until they are happy (FR-10).
 */
classRoutes.post("/:classId/groups/propose", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  const { mode, value } = z
    .object({ mode: z.enum(["count", "size"]), value: z.number().int().positive().max(500) })
    .parse(req.body);

  res.json(await proposeGroups(id, mode, value, currentUser(req).user));
});

/** Whether the class's groups may still be changed, and why not if they may not. */
classRoutes.get("/:classId/groups/editable", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  await getClass(id, currentUser(req).user);

  const reason = await regroupingBlockedReason(id);
  res.json({ editable: reason === null, reason });
});

classRoutes.put("/:classId/groups", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  const { groups } = z
    .object({
      groups: z
        .array(
          z.object({
            groupNumber: z.number().int().positive().max(999),
            memberStudentIds: z.array(z.uuid()),
          }),
        )
        .min(1, "There are no groups to confirm."),
    })
    .parse(req.body);

  res.json({ result: await confirmGroups(id, groups, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Match conflicts - FR-04
 * ------------------------------------------------------------------ */

const enrolmentId = z.object({ enrolmentId: z.uuid() });

classRoutes.get("/enrolments/:enrolmentId/candidates", async (req, res) => {
  const { enrolmentId: id } = enrolmentId.parse(req.params);
  res.json({ candidates: await getConflictCandidates(id, currentUser(req).user) });
});

classRoutes.post("/enrolments/:enrolmentId/resolve", async (req, res) => {
  const { enrolmentId: id } = enrolmentId.parse(req.params);
  const decision = z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("link"), userId: z.uuid() }),
      z.object({ kind: z.literal("leave-unmatched") }),
    ])
    .parse(req.body);

  await resolveEnrolmentConflict(id, decision, currentUser(req).user);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Deletion - FR-28
 * ------------------------------------------------------------------ */

/** What would be lost, so the interface can ask before it happens. */
classRoutes.get("/:classId/impact", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  res.json({ impact: await classImpact(id, currentUser(req).user) });
});

classRoutes.delete("/:classId", async (req, res) => {
  const { classId: id } = classId.parse(req.params);
  await deleteClass(id, currentUser(req).user);
  res.json({ ok: true });
});
