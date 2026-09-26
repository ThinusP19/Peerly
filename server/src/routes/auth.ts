import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

import { env } from "../config/env.ts";
import type { SessionUser } from "../domain/types.ts";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  currentUser,
  requireAuth,
  sessionOrigin,
  setSessionCookie,
} from "../middleware/auth.ts";
import { AppError, badRequest, unauthorized } from "../middleware/errors.ts";
import { attemptSignIn } from "../services/authentication.ts";
import {
  STUDENT_NUMBER_PATTERN,
  registerStudent,
  resendVerificationCode,
  verifyEmailCode,
} from "../services/registration.ts";
import {
  activateWithToken,
  changePassword,
  describeActivationToken,
  requestPasswordReset,
  resetPassword,
} from "../services/recovery.ts";
import { createSession, resolveSession, revokeSession } from "../services/sessions.ts";

/**
 * The authentication surface (FR-01 to FR-07).
 *
 * Every route here is unauthenticated by definition except the last two, so
 * this is the part of the API most exposed to someone who is not a user at all.
 * That shapes two things: CI-07 rate limits on anything that sends an e-mail or
 * checks a password, and responses that give away as little as the requirement
 * allows.
 */

export const authRoutes = Router();

/**
 * CI-07. Tighter than the global ceiling in app.ts, because these are the
 * routes worth hammering: one checks passwords, the rest send e-mail to an
 * address the caller chooses.
 *
 * Keyed by source address. The per-account half of SR-04 lives in
 * `authentication.ts`, where it can count consecutive failures rather than
 * requests - a distinction that matters, since a rate limit alone would let
 * someone guess forever at a slow enough pace.
 */
const limit = (windowMinutes: number, max: number) =>
  rateLimit({
    windowMs: windowMinutes * 60_000,
    // Raised outside production rather than removed, so the middleware is still
    // mounted and still runs on every one of these routes. Switching it off
    // would stop the tests proving it is wired up at all.
    //
    // Development is included because a browser suite reseeds the database and
    // signs in afresh each run, and a few runs in a quarter of an hour exceed a
    // limit meant for the open internet. What this relaxes is CI-07's
    // per-source request ceiling, on a developer's own machine. It does NOT
    // relax SR-04: the per-account lock-out after five consecutive failures is
    // derived from `login_attempts` in authentication.ts and applies
    // everywhere, which is the control that actually protects an account.
    //
    // The production figures are the ones beside each call below.
    limit: env.isProduction ? max : 1_000_000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: {
        code: "rate_limited",
        message: "Too many attempts. Please wait a few minutes and try again.",
      },
    },
  });

const signInLimit = limit(15, 20);
const emailLimit = limit(60, 8);

/** Trimmed, and compared in lower case - users_email_lower_key is on lower(email). */
const email = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .pipe(z.email("This doesn't look like an email address."));

const password = z.string().min(1, "Enter a password.");

const studentEmail = email.refine(
  (value) => env.studentEmailDomains.includes(value.toLowerCase().split("@")[1] ?? ""),
  {
    message: `Use your student address ending in @${env.studentEmailDomains[0]}, not a personal one.`,
  },
);

/** What the browser is allowed to know about the signed-in account. */
const publicUser = (user: SessionUser) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  surname: user.surname,
  email: user.email,
  studentNumber: user.studentNumber ?? undefined,
  status: user.status,
  createdAt: user.createdAt,
});

/* ------------------------------ registration ----------------------------- */

const registerBody = z.object({
  name: z.string().trim().min(1, "Enter your first name."),
  surname: z.string().trim().min(1, "Enter your surname."),
  email: studentEmail,
  studentNumber: z
    .string()
    .trim()
    .regex(STUDENT_NUMBER_PATTERN, "A student number is 8 digits, for example 41200345."),
  password,
  /**
   * OR-13: the POPIA notice has to be acknowledged before anything is stored.
   * Checked here as well as in the form, because the form is not the only way
   * to reach this route.
   */
  noticeAccepted: z.literal(true, {
    message: "Please confirm you've read what data Peerly collects before continuing.",
  }),
});

authRoutes.post("/register", emailLimit, async (req, res) => {
  const input = registerBody.parse(req.body);
  await registerStudent(input);
  // No account id comes back: nothing may act on this registration until the
  // code proves the address belongs to whoever asked (SR-01).
  res.status(202).json({ ok: true });
});

authRoutes.post("/register/resend", emailLimit, async (req, res) => {
  const { email: address } = z.object({ email }).parse(req.body);
  await resendVerificationCode(address);
  res.status(202).json({ ok: true });
});

authRoutes.post("/verify", signInLimit, async (req, res) => {
  const body = z
    .object({
      email,
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter all 6 digits of the code."),
    })
    .parse(req.body);

  const user = await verifyEmailCode(body.email, body.code);
  if (!user) {
    throw badRequest("That code isn't right. Check the latest email we sent and try again.", {
      code: "That code isn't right. Check the latest email we sent and try again.",
    });
  }

  // Verifying proves the address is theirs, so they are signed in from here.
  const { token } = await createSession(user.id, sessionOrigin(req));
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

/* -------------------------------- sign-in -------------------------------- */

/** What an account that came through the wrong sign-in form is told. */
const wrongSignIn: Record<SessionUser["role"], string> = {
  student: "This is a student account. Use the student sign-in.",
  lecturer: "This is a lecturer account. Use the lecturer sign-in.",
  admin: "This is an administrator account. Use the administrator sign-in.",
};

authRoutes.post("/login", signInLimit, async (req, res) => {
  const body = z
    .object({
      email: z.string().trim().min(1, "Enter the email address you registered with."),
      password,
      // The sign-in form the person used. Each form admits only its own role.
      // Optional so a direct API client that names no form still signs in.
      as: z.enum(["student", "lecturer", "admin"]).optional(),
    })
    .parse(req.body);

  const user = await attemptSignIn(body.email, body.password, sessionOrigin(req));
  if (!user) {
    // FR-05, SR-06: one message for every cause. Which field was wrong, whether
    // the account exists, whether it is active and whether it is locked are all
    // the same answer here.
    throw unauthorized("We couldn't sign you in. Check your email address and password.");
  }

  // Only reached with the right password, so naming the role tells nobody
  // anything they could not already sign in and see. No session is created.
  if (body.as && body.as !== user.role) {
    throw new AppError(403, wrongSignIn[user.role], "wrong_sign_in", { as: user.role });
  }

  const { token } = await createSession(user.id, sessionOrigin(req));
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});

authRoutes.post("/logout", async (req, res) => {
  // Deliberately not behind requireAuth: signing out must work even when the
  // session has already expired, and must always end the same way.
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) {
    const auth = await resolveSession(token);
    if (auth) await revokeSession(auth.sessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRoutes.get("/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(currentUser(req).user) });
});

/* ------------------------------- recovery -------------------------------- */

authRoutes.post("/forgot-password", emailLimit, async (req, res) => {
  const { email: address } = z.object({ email }).parse(req.body);
  await requestPasswordReset(address);
  // SR-06: the same acknowledgement whether or not that address has an account.
  res.status(202).json({ ok: true });
});

authRoutes.post("/reset-password", signInLimit, async (req, res) => {
  const body = z.object({ token: z.string().min(1), password }).parse(req.body);

  if (!(await resetPassword(body.token, body.password))) {
    throw badRequest("This reset link has expired. Please request a new one.", {
      token: "This reset link has expired. Please request a new one.",
    });
  }
  res.json({ ok: true });
});

authRoutes.post("/change-password", requireAuth, async (req, res) => {
  const body = z
    .object({ current: z.string().min(1, "Enter your current password."), newPassword: password })
    .parse(req.body);

  const { user, sessionId } = currentUser(req);
  await changePassword(user.id, body.current, body.newPassword, sessionId);
  res.json({ ok: true });
});

/* ------------------------------ activation ------------------------------- */

authRoutes.get("/activation", async (req, res) => {
  const { token } = z.object({ token: z.string().min(1) }).parse(req.query);

  const account = await describeActivationToken(token);
  // Null is not an error: it is the expired-link state the page renders, with a
  // resend rather than a dead end.
  res.json({ account });
});

authRoutes.post("/activate", signInLimit, async (req, res) => {
  const body = z.object({ token: z.string().min(1), password }).parse(req.body);

  const user = await activateWithToken(body.token, body.password);
  if (!user) {
    throw badRequest("This activation link has expired. Please ask for a new one.", {
      token: "This activation link has expired. Please ask for a new one.",
    });
  }

  const { token } = await createSession(user.id, sessionOrigin(req));
  setSessionCookie(res, token);
  res.json({ user: publicUser(user) });
});
