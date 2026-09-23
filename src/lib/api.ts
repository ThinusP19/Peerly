/**
 * The one place the browser talks to the API.
 *
 * Every call carries the session cookie and turns a failure into an `ApiError`
 * carrying the per-field messages the server produced, so a screen can render
 * them beside the offending input rather than as a banner (UI-06, UR-07).
 */

/**
 * Empty in development and in production, where /api is proxied to the API on
 * the same origin. See `.env.example` - pointing this at another origin drops
 * the session cookie.
 */
const BASE = import.meta.env["VITE_API_URL"] ?? "";

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.fields = body.fields ?? {};
  }

  /** The message for one field, if the server had something to say about it. */
  field(name: string): string | undefined {
    return this.fields[name];
  }
}

/** True when the API said "not signed in", which callers usually treat as a state. */
export const isUnauthorized = (error: unknown) => error instanceof ApiError && error.status === 401;

/**
 * Notified whenever a request comes back 401.
 *
 * A session can die mid-visit: it idles out after thirty minutes (SR-05), an
 * administrator deactivates the account, the password is changed elsewhere, or
 * the database is rebuilt underneath it. Without this, every panel on the page
 * quietly renders empty - each query failing on its own, none of them able to
 * say why - and the person is left looking at a screen that appears broken
 * rather than at a sign-in form. The session layer subscribes and signs them out.
 */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  // Returns void, not Set.delete's boolean, so it can be a useEffect cleanup.
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      // CI-08: the session travels in a cookie, so it has to be sent.
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : {},
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (cause) {
    // The request never arrived: offline, server down, DNS. Distinct from a
    // request that arrived and was refused, and worth saying so plainly.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError(0, {
      code: "network_error",
      message: "We couldn't reach Peerly. Check your connection and try again.",
    });
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | null)?.error;
    // Announced before the throw, so it happens whether or not the caller
    // handles the rejection. Listeners decide what it means: a 401 while nobody
    // was signed in is just the answer to "who am I", not a lost session.
    if (response.status === 401) {
      for (const listener of unauthorizedListeners) listener();
    }
    throw new ApiError(
      response.status,
      error ?? { code: "error", message: "Something went wrong. Please try again." },
    );
  }

  return payload as T;
}

export const get = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, signal ? { signal } : {});

export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, body !== undefined ? { method: "POST", body } : { method: "POST" });
