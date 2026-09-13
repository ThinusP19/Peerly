import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/**
 * An error that is safe to show a user: the message is written for them, in
 * plain language (UI-06, UR-07). Anything else becomes a generic 500.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    override readonly message: string,
    readonly code: string = "error",
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, message, "bad_request", fields);

export const unauthorized = (message = "Please sign in to continue.") =>
  new AppError(401, message, "unauthorized");

/**
 * SR-07: a resource the caller does not own is refused identically whether or
 * not it exists, so identifiers cannot be enumerated by probing.
 */
export const notFoundOrForbidden = () =>
  new AppError(404, "We couldn't find that, or you don't have access to it.", "not_found");

export const conflict = (message: string) => new AppError(409, message, "conflict");

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "No such endpoint." } });
}

/** Postgres error codes we can turn into a useful message instead of a 500. */
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";
const PG_CHECK_VIOLATION = "23514";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    // Field errors are returned per-field so the client can render them inline
    // beside the offending input rather than as one banner (UI-06).
    const fields: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    res.status(400).json({
      error: { code: "validation_failed", message: "Please check the highlighted fields.", fields },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields && { fields: error.fields }),
      },
    });
    return;
  }

  const pgCode = (error as { code?: string })?.code;
  const constraint = (error as { constraint?: string })?.constraint;

  if (
    pgCode === PG_UNIQUE_VIOLATION ||
    pgCode === PG_FOREIGN_KEY_VIOLATION ||
    pgCode === PG_CHECK_VIOLATION
  ) {
    // The database refused the write because a business rule forbids it. That is
    // a client error, not a server fault - but the constraint name is internal,
    // so it is logged rather than returned (OR-04).
    console.error(`[db] rule violation ${pgCode} on ${constraint ?? "unknown constraint"}`);
    res.status(409).json({
      error: {
        code: "rule_violation",
        message: "That change isn't allowed because it would break one of Peerly's rules.",
      },
    });
    return;
  }

  // OR-04: log full diagnostic context, return a generic page. No stack trace,
  // database message or internal path ever reaches the client. SR-14: the log
  // line carries no credentials or rating content.
  console.error("[error]", error instanceof Error ? error.stack : error);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong on our end. Please try again.",
    },
  });
}
