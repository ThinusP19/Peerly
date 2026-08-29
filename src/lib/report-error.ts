/**
 * Central hook for client-side error reporting.
 *
 * Deliberately local-only: nothing is sent off the machine. When a real
 * monitoring service is chosen, wire it here — this is the single place the
 * application reports a caught error from.
 *
 * SR-14: never log a credential, session token or the content of a peer rating.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;

  const detail =
    error instanceof Error ? { message: error.message, stack: error.stack } : { error };
  console.error("[peerly]", { ...detail, ...context });
}
