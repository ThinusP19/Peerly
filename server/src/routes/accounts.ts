import { Router } from "express";
import { z } from "zod";

import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import {
  activeAdminCount,
  resendActivationLink,
  createStaffAccount,
  listStaffAccounts,
  setStaffAccountStatus,
  updateStaffAccount,
} from "../services/accounts.ts";

/**
 * Staff account administration (FR-01).
 *
 * Administrators only, and staff accounts only. There is no route here that
 * reaches a student, a rating or a mark - SR-16 says the role carries no
 * automatic access to any of them, and the simplest way to honour that is to
 * build no door.
 */
export const accountRoutes = Router();

accountRoutes.use(requireAuth, requireRole("admin"));

const userId = z.object({ userId: z.uuid() });

/**
 * Generous for any real name, and short enough that a name cannot swamp the
 * account list, the page header or every audit entry that carries it.
 */
const NAME_MAX = 100;
const personName = (blank: string) =>
  z.string().trim().min(1, blank).max(NAME_MAX, `Keep this to ${NAME_MAX} characters or fewer.`);

accountRoutes.get("/", async (_req, res) => {
  res.json({ accounts: await listStaffAccounts(), activeAdmins: await activeAdminCount() });
});

accountRoutes.post("/", async (req, res) => {
  const body = z
    .object({
      role: z.enum(["admin", "lecturer"]),
      name: personName("Enter a first name."),
      surname: personName("Enter a surname."),
      email: z.string().trim().pipe(z.email("This doesn't look like an email address.")),
    })
    .parse(req.body);

  res.status(201).json({ account: await createStaffAccount(body, currentUser(req).user) });
});

accountRoutes.patch("/:userId", async (req, res) => {
  const { userId: id } = userId.parse(req.params);
  const changes = z
    .object({
      name: personName("Enter a first name.").optional(),
      surname: personName("Enter a surname.").optional(),
      email: z.string().trim().pipe(z.email()).optional(),
      role: z.enum(["admin", "lecturer"]).optional(),
    })
    .parse(req.body);

  res.json({ account: await updateStaffAccount(id, changes, currentUser(req).user) });
});

/** Sends the activation link again, for an account that has never used one. */
accountRoutes.post("/:userId/activation", async (req, res) => {
  const { userId: id } = userId.parse(req.params);
  res.json({ account: await resendActivationLink(id, currentUser(req).user) });
});

accountRoutes.post("/:userId/status", async (req, res) => {
  const { userId: id } = userId.parse(req.params);
  const { status } = z.object({ status: z.enum(["active", "inactive"]) }).parse(req.body);

  res.json({ account: await setStaffAccountStatus(id, status, currentUser(req).user) });
});
