/**
 * Core domain types, mirroring `src/mocks/types.ts` in the web app.
 *
 * The two are kept in step by hand. They describe the same contract from
 * opposite ends, and the API is the end that decides: a field the browser
 * believes in but this file does not will simply never arrive.
 */

export type Role = "admin" | "lecturer" | "student";
export type UserStatus = "active" | "inactive" | "unverified";

/**
 * The account behind a request.
 *
 * Deliberately narrow: no password hash, and nothing about classes, groups or
 * marks. Middleware needs to know who is asking and what they are allowed to
 * ask, and carrying more than that on every request invites it into a response
 * by accident (SR-08).
 */
export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  surname: string;
  email: string;
  studentNumber: string | null;
  status: UserStatus;
  /** ISO-8601. The account's own creation date, which it may always see. */
  createdAt: string;
}

export interface AuthContext {
  user: SessionUser;
  /** The session row this request authenticated against, so it can be revoked. */
  sessionId: string;
}
