import { Router } from "express";
import { z } from "zod";

import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { getDefaultScale, updateDefaultScale } from "../services/scale.ts";

/**
 * System-wide calculation settings: the hidden value behind each rating
 * option, and the factor limits (OR-19).
 *
 * Administrators only. A lecturer adjusts these for one assessment through
 * `/api/assessments/:id/scale`; the system defaults are not theirs to move,
 * because a change here reaches every lecturer's next calculation.
 */
export const settingsRoutes = Router();

settingsRoutes.use(requireAuth, requireRole("admin"));

/** Shared with the per-assessment route, so both refuse the same things. */
export const scaleBody = z.object({
  values: z.record(z.uuid(), z.number()),
  minFactor: z.number(),
  maxFactor: z.number(),
});

settingsRoutes.get("/scale", async (_req, res) => {
  res.json({ scale: await getDefaultScale() });
});

settingsRoutes.put("/scale", async (req, res) => {
  const body = scaleBody.parse(req.body);
  res.json({ scale: await updateDefaultScale(body, currentUser(req).user) });
});
