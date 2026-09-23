import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from "express";

import { env } from "../config/env.ts";
import type { AuthContext, Role } from "../domain/types.ts";
import { resolveSession } from "../services/sessions.ts";
import { forbidden, unauthorized } from "./errors.ts";

/**
 * Who is asking, and may they (FR-07, SR-07, CI-08).
 *
 * FR-07 puts it plainly: hiding a control is never an access control. The web
 * app's RoleGuard decides what to render; this decides what may happen. Every
 * route that is not deliberately public goes through requireAuth, and every
 * route that belongs to one portal goes through requireRole as well.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Present only after requireAuth or attachSession has run. */
      auth?: AuthContext;
    }
  }
}

export const SESSION_COOKIE = "peerly_session";

/**
 * CI-08: HttpOnly so script cannot read it, Secure so it never crosses plain
 * HTTP in production, SameSite to blunt cross-site request forgery. The token
 * travels here and nowhere else - never in a URL, where it would land in
 * browser history, proxy logs and Referer headers.
 *
 * NOTE for local development: SameSite=Lax means the cookie is sent only on
 * same-site requests, and "site" ignores the port but not the host. The web app
 * on 127.0.0.1:7331 and this API on localhost:4000 are therefore NOT same-site,
 * and the browser will withhold the cookie. Reach both through `localhost`, or
 * proxy the API through Vite so the browser sees one origin. The second is
 * closer to how CI-09 describes production - one origin behind the university
 * proxy - and is what the front end should end up doing.
 */
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: env.session.absoluteMinutes * 60_000,
});

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res: Response): void {
  // maxAge must be absent here or the browser keeps the cookie alive.
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(SESSION_COOKIE, options);
}

/** What createSession needs to record about where a sign-in came from. */
export const sessionOrigin = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

/**
 * Resolves the session if there is one and moves on either way.
 *
 * For the handful of routes that behave differently when signed in but do not
 * require it. A stale cookie is cleared as it goes past, so a browser holding
 * an expired token stops sending it rather than retrying forever.
 */
export const attachSession: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    next();
    return;
  }

  const auth = await resolveSession(token);
  if (auth) {
    req.auth = auth;
  } else {
    clearSessionCookie(res);
  }
  next();
};

/** Refuses anyone without a live session. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length === 0) {
    next(unauthorized());
    return;
  }

  const auth = await resolveSession(token);
  if (!auth) {
    // Expired, revoked, unknown or deactivated - all the same answer, and the
    // dead cookie goes with it (SR-06).
    clearSessionCookie(res);
    next(unauthorized("Your session has ended. Please sign in again."));
    return;
  }

  req.auth = auth;
  next();
};

/**
 * Restricts a route to particular roles. Always mounted after requireAuth.
 *
 * SR-16 is the reason admin is never simply folded in as a superuser: a System
 * Administrator has no automatic access to responses or marks, so a route for
 * lecturers lists lecturers, and nothing else.
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      // requireAuth was not mounted ahead of this. Refuse rather than assume.
      next(unauthorized());
      return;
    }
    if (!roles.includes(auth.user.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/**
 * The authenticated account, for handlers that have already passed requireAuth.
 *
 * Throws rather than returning undefined: reaching here without a session means
 * the route was wired without requireAuth, which is a mistake in the code and
 * should surface as a 500 rather than quietly behaving as though nobody asked.
 */
export function currentUser(req: Request): AuthContext {
  if (!req.auth) {
    throw new Error("currentUser() called on a route that is not behind requireAuth");
  }
  return req.auth;
}
