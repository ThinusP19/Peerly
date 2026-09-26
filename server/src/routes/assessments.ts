import { Router } from "express";
import { z } from "zod";

import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { getAssessment, getRatingOptions } from "../services/assessments.ts";
import { assessmentImpact, deleteAssessment, markResultsExported } from "../services/deletion.ts";
import {
  getResults,
  listOverrides,
  overrideMark,
  removeOverride,
  runCalculation,
} from "../services/results.ts";
import { buildResultsWorkbook } from "../services/export.ts";
import {
  changeAssessmentStatus,
  createAssessment,
  setGroupBaseMark,
  updateAssessment,
} from "../services/assessment-writes.ts";
import {
  getGroupMarks,
  getGroupProgress,
  sendSubmissionReminders,
  getPeerRatings,
  getSubmissions,
} from "../services/monitoring.ts";

export const assessmentRoutes = Router();

assessmentRoutes.use(requireAuth);

/**
 * The rating scale.
 *
 * Open to any signed-in role, because the numbers are stripped for students in
 * the service rather than by withholding the route (SR-08). A student needs the
 * labels and descriptions to rate anyone at all.
 */
assessmentRoutes.get("/rating-options", async (req, res) => {
  res.json({ options: await getRatingOptions(currentUser(req).user.role) });
});

assessmentRoutes.get("/:assessmentId", requireRole("lecturer"), async (req, res) => {
  const { assessmentId } = z.object({ assessmentId: z.uuid() }).parse(req.params);
  res.json({ assessment: await getAssessment(assessmentId, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Monitoring and the matrix - lecturer only (FR-18, FR-19, OR-16)
 * ------------------------------------------------------------------ */

const assessmentId = z.object({ assessmentId: z.uuid() });

assessmentRoutes.get("/:assessmentId/progress", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ progress: await getGroupProgress(id, currentUser(req).user) });
});

/**
 * Reminds the outstanding students (FR-18).
 *
 * POST, because it sends e-mail and writes to the audit trail. The count comes
 * back so the screen can say how many were written to rather than guessing from
 * the list it happened to be showing.
 */
assessmentRoutes.post("/:assessmentId/reminders", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json(await sendSubmissionReminders(id, currentUser(req).user));
});

assessmentRoutes.get("/:assessmentId/submissions", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ submissions: await getSubmissions(id, currentUser(req).user) });
});

/**
 * The raw ratings behind the matrix. Lecturer-only: rating_option_id leads
 * straight to the hidden numeric value, so this must never reach a student.
 */
assessmentRoutes.get("/:assessmentId/ratings", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ ratings: await getPeerRatings(id, currentUser(req).user) });
});

assessmentRoutes.get("/:assessmentId/marks", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ marks: await getGroupMarks(id, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Setting up and running an assessment - FR-12, FR-13, FR-21
 * ------------------------------------------------------------------ */

const datetime = z.iso.datetime({ offset: true });

/**
 * Long enough for any real title, short enough that one name cannot push every
 * other column of a table off the screen. The form enforces the same limit.
 */
const ASSESSMENT_NAME_MAX = 120;

const assessmentBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the assessment a name.")
    .max(ASSESSMENT_NAME_MAX, `Keep the name to ${ASSESSMENT_NAME_MAX} characters or fewer.`),
  description: z.string().trim().max(2000).optional(),
  groupIds: z.array(z.uuid()).min(1, "Choose at least one group to take part."),
  opensAt: datetime,
  closesAt: datetime,
  // max_mark is numeric(6,2): a third decimal would be rounded away silently,
  // so it is refused instead.
  maxMark: z
    .number()
    .positive("The maximum mark has to be more than 0.")
    .max(1000, "The maximum mark can be at most 1000.")
    .refine((value) => Number(value.toFixed(2)) === value, "Use at most two decimal places.")
    .optional(),
});

assessmentRoutes.post("/", requireRole("lecturer"), async (req, res) => {
  const body = assessmentBody.extend({ classId: z.uuid() }).parse(req.body);
  res.status(201).json({ assessment: await createAssessment(body, currentUser(req).user) });
});

assessmentRoutes.patch("/:assessmentId", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const changes = assessmentBody.partial().parse(req.body);
  res.json({ assessment: await updateAssessment(id, changes, currentUser(req).user) });
});

/**
 * Activation, closure and re-opening (FR-13).
 *
 * A named transition rather than "set status to X": the server decides which
 * moves are legal, so a draft cannot be marked closed and an open assessment
 * cannot be opened again.
 */
assessmentRoutes.post("/:assessmentId/status", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  // closesAt is optional: opening or re-opening after the closing time has
  // passed needs a new one, chosen in the same step.
  const { transition, closesAt } = z
    .object({ transition: z.enum(["open", "close", "reopen"]), closesAt: datetime.optional() })
    .parse(req.body);

  res.json(await changeAssessmentStatus(id, transition, currentUser(req).user, { closesAt }));
});

assessmentRoutes.put("/:assessmentId/marks/:groupId", requireRole("lecturer"), async (req, res) => {
  const params = z.object({ assessmentId: z.uuid(), groupId: z.uuid() }).parse(req.params);
  // Null clears the mark, which is not the same as zero.
  const { baseMark } = z.object({ baseMark: z.number().nullable() }).parse(req.body);

  // invalidatedCalculation: the change made the calculated marks out of date,
  // so the screen can say so rather than leaving them looking current (FR-13).
  const outcome = await setGroupBaseMark(
    params.assessmentId,
    params.groupId,
    baseMark,
    currentUser(req).user,
  );
  res.json({ ok: true, ...outcome });
});

/* ------------------------------------------------------------------ *
 * Export and deletion - FR-25, FR-28
 * ------------------------------------------------------------------ */

assessmentRoutes.get("/:assessmentId/impact", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ impact: await assessmentImpact(id, currentUser(req).user) });
});

assessmentRoutes.delete("/:assessmentId", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  await deleteAssessment(id, currentUser(req).user);
  res.json({ ok: true });
});

assessmentRoutes.post("/:assessmentId/exported", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ exportedAt: await markResultsExported(id, currentUser(req).user) });
});

/* ------------------------------------------------------------------ *
 * Calculation and results - FR-22, FR-24, FR-26
 * ------------------------------------------------------------------ */

/** FR-24: required once overrides exist, so none is discarded silently. */
const calculateBody = z.object({ overrides: z.enum(["keep", "withdraw"]).optional() });

assessmentRoutes.post("/:assessmentId/calculate", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const { overrides } = calculateBody.parse(req.body ?? {});
  res.json({ run: await runCalculation(id, currentUser(req).user, overrides) });
});

/**
 * The results table and its drill-down.
 *
 * Lecturer-only, and there is deliberately no student-facing equivalent: OR-16
 * limits an individual rating to the responsible lecturer and its author, and
 * SR-08 keeps factors and marks out of a student's browser entirely.
 */
assessmentRoutes.get("/:assessmentId/results", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ results: await getResults(id, currentUser(req).user) });
});

assessmentRoutes.post("/:assessmentId/override", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const body = z
    .object({
      studentId: z.uuid(),
      mark: z.number(),
      // FR-24: mandatory, and mandatory in the database too.
      reason: z.string().trim().min(1, "Give a reason for the override."),
    })
    .parse(req.body);

  await overrideMark(id, body.studentId, body.mark, body.reason, currentUser(req).user);
  res.json({ ok: true });
});

/** Every override, current results or not - what a recalculation will ask about (FR-24). */
assessmentRoutes.get("/:assessmentId/overrides", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  res.json({ overrides: await listOverrides(id, currentUser(req).user) });
});

/** Withdraws one student's override, with a reason, so their calculated mark stands. */
assessmentRoutes.delete(
  "/:assessmentId/override/:studentId",
  requireRole("lecturer"),
  async (req, res) => {
    const params = z.object({ assessmentId: z.uuid(), studentId: z.uuid() }).parse(req.params);
    const { reason } = z
      .object({ reason: z.string().trim().min(1, "Give a reason for removing the override.") })
      .parse(req.body ?? {});

    await removeOverride(params.assessmentId, params.studentId, reason, currentUser(req).user);
    res.json({ ok: true });
  },
);

/**
 * The results workbook (FR-25, CI-04).
 *
 * A binary attachment, built server-side and sent only to the lecturer who owns
 * the class. Downloading it records the export, which is what FR-28 later
 * checks before letting the assessment be deleted without asking twice.
 */
assessmentRoutes.get("/:assessmentId/export", requireRole("lecturer"), async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const user = currentUser(req).user;

  const workbook = await buildResultsWorkbook(id, user);
  await markResultsExported(id, user);

  res.setHeader("content-type", workbook.contentType);
  // The quoted filename is what the browser saves it as.
  res.setHeader("content-disposition", `attachment; filename="${workbook.filename}"`);
  res.send(workbook.buffer);
});
