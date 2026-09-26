import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { isUnauthorized, onUnauthorized } from "@/lib/api";
import { clearLocalDrafts, flushPendingDrafts } from "@/lib/evaluation-draft";
import type { Role } from "@/mocks/types";
import * as auth from "@/services/auth";
import type { AuthUser } from "@/services/auth";

/**
 * Who is signed in.
 *
 * The account comes from the API, which reads it from an HttpOnly session
 * cookie the browser cannot see. That is the point: this module holds a copy
 * for rendering, never the credential, and it cannot grant itself a session by
 * writing to storage. What it does keep locally is which class and assessment
 * you were last looking at - a convenience, not an identity.
 *
 * FR-07: none of this is an access control. It decides what to draw. The server
 * decides what may happen.
 */

const PREFERENCES_KEY = "peerly.preferences";

interface Preferences {
  activeClassId: string;
  activeAssessmentId: string;
}

/**
 * No class is selected until one has been loaded.
 *
 * These were once placeholder mock ids, which every lecturer screen then sent
 * to the API as though they were real - producing a 400 on each one. A
 * selection nobody has made is empty, and `useLecturerContext` fills it from
 * what the server actually returned.
 */
const defaultPreferences: Preferences = {
  activeClassId: "",
  activeAssessmentId: "",
};

const readPreferences = (): Preferences => {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return raw
      ? { ...defaultPreferences, ...(JSON.parse(raw) as Preferences) }
      : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
};

interface SessionContextValue extends Preferences {
  user: AuthUser | null;
  /**
   * False until the API has been asked who is signed in. Route guards must wait
   * for this or they will bounce a signed-in person to /login on first paint,
   * before the answer has come back.
   */
  hydrated: boolean;
  /** Records the account a sign-in returned. The cookie is already set. */
  signIn: (user: AuthUser) => void;
  /** Signs in by email and password, for the development role switcher. */
  signInAs: (email: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-asks the API, after something that may have changed the account. */
  refresh: () => Promise<void>;
  setActiveClassId: (id: string) => void;
  setActiveAssessmentId: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Runs on the client only. During the server render there is no cookie jar
    // to ask, so the first paint is always the signed-out shape.
    const controller = new AbortController();

    setPreferences(readPreferences());

    auth
      .me(controller.signal)
      .then(setUser)
      .catch((error: unknown) => {
        // 401 is the ordinary "nobody is signed in" answer, not a failure.
        if (!isUnauthorized(error) && !controller.signal.aborted) {
          console.error("[session] could not read the current session:", error);
        }
        setUser(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHydrated(true);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    /**
     * Drops the session the moment the API stops recognising it.
     *
     * Only when we believed somebody was signed in: a 401 from the bootstrap
     * `me()` above is the ordinary answer when nobody is, and treating that as a
     * lost session would fight the initial paint. Clearing `user` is enough -
     * the route guards send them to sign in - and the message says the session
     * ended rather than implying they did something wrong.
     */
    return onUnauthorized(() => {
      setUser((current) => {
        if (current) toast.info("Your session has ended. Please sign in again.");
        return null;
      });
    });
  }, []);

  /**
   * Changes one or more preferences, from whatever the current ones are.
   *
   * It takes a patch and applies it functionally rather than being handed a
   * whole object built from `preferences`. Two setters called in the same
   * handler both closed over the same render's `preferences`, so the second
   * overwrote the first: choosing a class ran
   * `setActiveClassId(id); setActiveAssessmentId("")`, and the second call
   * wrote the OLD class id straight back. The class switcher appeared to do
   * nothing at all, and there was no way to leave the class you were in.
   */
  const persist = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      } catch {
        // A browser with storage blocked still works; it just forgets the choice.
      }
      return next;
    });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...preferences,
      user,
      hydrated,

      signIn: (next: AuthUser) => setUser(next),

      signInAs: async (email: string, password = "peerly-dev-password") => {
        setUser(await auth.login(email, password));
      },

      signOut: async () => {
        try {
          // Anything typed in the last moment goes to the server while the
          // session still exists; then nothing about the student's ratings is
          // left in this browser for the next person on a shared computer.
          await flushPendingDrafts();
          clearLocalDrafts();
          await auth.logout();
        } finally {
          // Clear locally whatever the API said. A failed sign-out that leaves
          // the account on screen is worse than one that ends optimistically.
          setUser(null);
        }
      },

      refresh: async () => {
        try {
          setUser(await auth.me());
        } catch {
          setUser(null);
        }
      },

      setActiveClassId: (activeClassId: string) => persist({ activeClassId }),
      setActiveAssessmentId: (activeAssessmentId: string) => persist({ activeAssessmentId }),
    }),
    [preferences, user, hydrated, persist],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export const roleLabel = (role: Role) =>
  role === "admin" ? "System Administrator" : role === "lecturer" ? "Lecturer" : "Student";

/** Where a given role belongs after signing in. */
export const homePathForRole = (role: Role) =>
  role === "admin" ? "/admin" : role === "lecturer" ? "/lecturer" : "/student";

/**
 * Development sign-in shortcuts.
 *
 * These are real accounts now, created by `server/src/db/seed.ts`, and the
 * switcher signs in through the API like anyone else - so what you see is what
 * the session actually permits, not a pretend one.
 */
export const personas: Array<{ role: Role; email: string; label: string; hint: string }> = [
  {
    role: "admin",
    email: "riaan.botha@nwu.ac.za",
    label: "Riaan Botha",
    hint: "System Administrator",
  },
  {
    role: "lecturer",
    email: "anneke.vdmerwe@nwu.ac.za",
    label: "Anneke van der Merwe",
    hint: "Lecturer · owns CMPG323 + CMPG315",
  },
  {
    role: "student",
    email: "41200345@mynwu.ac.za",
    label: "Lerato Mokoena",
    hint: "Student · matched, in a group",
  },
];
