import { Router } from "express";

import { z } from "zod";

import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import {
  getEvaluationContext,
  getOwnEntries,
  saveDraft,
  submitEvaluation,
} from "../services/evaluations.ts";
import { getStudentAssessments, getStudentEnrolments } from "../services/student.ts";

/**
 * The student portal's own data.
 *
 * No route here takes a student id. The account is the one on the session, so
 * there is no parameter to tamper with and no ownership check to forget
 * (SR-07, SR-08).
 */
export const studentRoutes = Router();

studentRoutes.use(requireAuth, requireRole("student"));

/** Every class list the student's number is on, so each can be explained on its own. */
studentRoutes.get("/enrolments", async (req, res) => {
  res.json({ enrolments: await getStudentEnrolments(currentUser(req).user.id) });
});

studentRoutes.get("/assessments", async (req, res) => {
  res.json({ assessments: await getStudentAssessments(currentUser(req).user.id) });
});

/* ------------------------------------------------------------------ *
 * Capturing an evaluation - FR-15, FR-16, FR-17, CI-10
 * ------------------------------------------------------------------ */

const assessmentId = z.object({ assessmentId: z.uuid() });

const entries = z.object({
  entries: z
    .array(
      z.object({
        evaluatedStudentId: z.uuid(),
        ratingOptionId: z.uuid(),
        // FR-17: optional, and capped. The database caps it too.
        //
        // `nullish` rather than `optional`: a client with no comment for
        // somebody will naturally send null, and refusing that would make
        // "no comment" a validation error. Both null and a missing key mean
        // the same thing, and both become undefined here.
        comment: z
          .string()
          .trim()
          .max(500, "Comments are limited to 500 characters.")
          .nullish()
          .transform((value) => value ?? undefined),
      }),
    )
    // A whole group's worth of ratings and no more; anything larger is not a
    // student filling in a form.
    .max(50),
});

/** What the evaluation screen needs before it can draw anything. */
studentRoutes.get("/evaluations/:assessmentId", async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const studentId = currentUser(req).user.id;
  // The context first: it is what refuses an assessment that is not theirs.
  const context = await getEvaluationContext(studentId, id);
  res.json({ context, entries: await getOwnEntries(studentId, id) });
});

/**
 * Autosave (CI-10). Partial by design, so it is not checked for completeness -
 * only that every rating is one this student was allowed to make.
 */
studentRoutes.put("/evaluations/:assessmentId/draft", async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const body = entries.parse(req.body);

  await saveDraft(currentUser(req).user.id, id, body.entries);
  res.json({ ok: true });
});

studentRoutes.post("/evaluations/:assessmentId/submit", async (req, res) => {
  const { assessmentId: id } = assessmentId.parse(req.params);
  const body = entries.parse(req.body);

  res.json({ submission: await submitEvaluation(currentUser(req).user.id, id, body.entries) });
});
