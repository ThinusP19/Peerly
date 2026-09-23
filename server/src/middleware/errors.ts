import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/**
 * An error that is safe to show a user: the message is written for them, in
 * plain language (UI-06, UR-07). Anything else becomes a generic 500.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;

  // Assigned in the body rather than declared as constructor parameter
  // properties. Those are one of the few TypeScript constructs that emit code
  // rather than just annotate it, so `node --experimental-strip-types` - which
  // removes types without compiling - refuses the file outright. That is what
  // `npm start` runs, so the shorthand would cost us the production entry point.
  constructor(
    status: number,
    message: string,
    code: string = "error",
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, message, "bad_request", fields);

export const unauthorized = (message = "Please sign in to continue.") =>
  new AppError(401, message, "unauthorized");

/**
 * A role gate: the caller is who they say they are, but this portal is not
 * theirs. Distinct from notFoundOrForbidden() below, and safe to be distinct -
 * "students cannot use the lecturer portal" is a rule, not a fact about which
 * identifiers exist.
 */
export const forbidden = (message = "You don't have access to that.") =>
  new AppError(403, message, "forbidden");

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

  // A request body that is not valid JSON - from express.json(), or a JSON
  // field inside a multipart upload - is the caller's error, not the server's.
  if (
    error instanceof SyntaxError ||
    (error as { type?: string })?.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      error: {
        code: "malformed_request",
        message: "The request couldn't be read. Please try again.",
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
