import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { classes, staffUsers, studentUsers, users } from "@/mocks/data";
import type { Role, User } from "@/mocks/types";

const STORAGE_KEY = "peerly.session";

export interface SessionState {
  userId: string | null;
  activeClassId: string;
  activeAssessmentId: string;
}

const defaultState: SessionState = {
  userId: null,
  activeClassId: "cls-1",
  activeAssessmentId: "asm-1",
};

/** Prototype personas the dev role switcher can jump between. */
export const personas: Array<{ role: Role; userId: string; label: string }> = [
  { role: "admin", userId: "u-admin-1", label: "System Administrator — Riaan Botha" },
  { role: "lecturer", userId: "u-lec-1", label: "Lecturer — Anneke van der Merwe" },
  { role: "student", userId: studentUsers[0].id, label: `Student — ${studentUsers[0].name} ${studentUsers[0].surname}` },
  {
    role: "student",
    userId: studentUsers[28].id,
    label: `Student (unmatched) — ${studentUsers[28].name} ${studentUsers[28].surname}`,
  },
  {
    role: "student",
    userId: studentUsers[29].id,
    label: `Student (conflict) — ${studentUsers[29].name} ${studentUsers[29].surname}`,
  },
];

interface SessionContextValue extends SessionState {
  user: User | null;
  signInAs: (userId: string) => void;
  signOut: () => void;
  setActiveClassId: (id: string) => void;
  setActiveAssessmentId: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...defaultState, ...(JSON.parse(raw) as SessionState) });
    } catch {
      /* prototype only — ignore unreadable storage */
    }
  }, []);

  const persist = useCallback((next: SessionState) => {
    setState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const user = state.userId ? users.find((u) => u.id === state.userId) ?? null : null;
    return {
      ...state,
      user,
      signInAs: (userId: string) => persist({ ...state, userId }),
      signOut: () => persist({ ...state, userId: null }),
      setActiveClassId: (activeClassId: string) => persist({ ...state, activeClassId }),
      setActiveAssessmentId: (activeAssessmentId: string) =>
        persist({ ...state, activeAssessmentId }),
    };
  }, [state, persist]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export const roleLabel = (role: Role) =>
  role === "admin" ? "System Administrator" : role === "lecturer" ? "Lecturer" : "Student";

export const lecturerClasses = (lecturerId: string) =>
  classes.filter((c) => c.lecturerId === lecturerId);

export const staffDirectory = staffUsers;
