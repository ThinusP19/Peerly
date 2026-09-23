/**
 * The authentication half of the API, typed.
 *
 * These are real HTTP calls. `src/services/peerly.ts` is still the mock layer
 * for everything else, and will be replaced the same way, endpoint by endpoint.
 */
import { get, post } from "@/lib/api";
import type { Role, User } from "@/mocks/types";

/**
 * The account as the API describes it - the same shape the mock layer returns,
 * so screens do not care which one they were handed during the migration.
 */
export type AuthUser = User;

interface UserReply {
  user: AuthUser;
}

export interface RegisterInput {
  name: string;
  surname: string;
  email: string;
  studentNumber: string;
  password: string;
  noticeAccepted: boolean;
}

/**
 * Creates the account, unverified, and sends a six-digit code.
 *
 * Nobody is signed in by this: the code has to be entered first, which is the
 * control that stops anyone registering under a classmate's student number.
 */
export const register = (input: RegisterInput) => post<{ ok: true }>("/api/auth/register", input);

export const resendCode = (email: string) =>
  post<{ ok: true }>("/api/auth/register/resend", { email });

/** Confirms the address and signs the student in. */
export const verifyCode = (email: string, code: string) =>
  post<UserReply>("/api/auth/verify", { email, code }).then((reply) => reply.user);

export const login = (email: string, password: string) =>
  post<UserReply>("/api/auth/login", { email, password }).then((reply) => reply.user);

export const logout = () => post<{ ok: true }>("/api/auth/logout");

/** The signed-in account, or a 401 that callers read as "nobody". */
export const me = (signal?: AbortSignal) =>
  get<UserReply>("/api/auth/me", signal).then((reply) => reply.user);

export const forgotPassword = (email: string) =>
  post<{ ok: true }>("/api/auth/forgot-password", { email });

export const resetPassword = (token: string, password: string) =>
  post<{ ok: true }>("/api/auth/reset-password", { token, password });

export const changePassword = (current: string, newPassword: string) =>
  post<{ ok: true }>("/api/auth/change-password", { current, newPassword });

export interface ActivationAccount {
  name: string;
  email: string;
  role: Role;
}

/**
 * Describes an activation link. A null account is not an error - it is the
 * expired-link state the page renders, with a resend rather than a dead end.
 */
export const getActivation = (token: string) =>
  get<{ account: ActivationAccount | null }>(
    `/api/auth/activation?token=${encodeURIComponent(token)}`,
  ).then((reply) => reply.account);

/** Sets a staff member's first password and signs them in. */
export const activate = (token: string, password: string) =>
  post<UserReply>("/api/auth/activate", { token, password }).then((reply) => reply.user);
