import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { assessments, classes, staffUsers, studentUsers, users } from "@/mocks/data";
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

const student = (index: number) => studentUsers[index];

/** Whether `assessmentId` belongs to `classId`. */
const assessmentBelongsToClass = (assessmentId: string, classId: string) =>
  assessments.find((a) => a.id === assessmentId)?.classId === classId;

/** The first assessment for a class, or "" if it has none yet. */
const firstAssessmentIdForClass = (classId: string) =>
  assessments.find((a) => a.classId === classId)?.id ?? "";

/**
 * Prototype personas the dev role switcher can jump between.
 *
 * The student personas are chosen so every dashboard state in the spec is
 * reachable without hunting: submitted, not started, draft in progress,
 * unmatched enrolment and conflicting enrolment.
 */
export const personas: Array<{
  role: Role;
  userId: string;
  label: string;
  hint: string;
}> = [
  {
    role: "admin",
    userId: "u-admin-1",
    label: "Riaan Botha",
    hint: "System Administrator",
  },
  {
    role: "lecturer",
    userId: "u-lec-1",
    label: "Anneke van der Merwe",
    hint: "Lecturer · owns CMPG323 + CMPG315",
  },
  {
    role: "student",
    userId: student(0).id,
    label: `${student(0).name} ${student(0).surname}`,
    hint: "Student · already submitted",
  },
  {
    role: "student",
    userId: student(4).id,
    label: `${student(4).name} ${student(4).surname}`,
    hint: "Student · not started",
  },
  {
    role: "student",
    userId: student(21).id,
    label: `${student(21).name} ${student(21).surname}`,
    hint: "Student · draft in progress",
  },
  {
    role: "student",
    userId: student(28).id,
    label: `${student(28).name} ${student(28).surname}`,
    hint: "Student · unmatched enrolment",
  },
  {
    role: "student",
    userId: student(29).id,
    label: `${student(29).name} ${student(29).surname}`,
    hint: "Student · conflicting enrolment",
  },
];

interface SessionContextValue extends SessionState {
  user: User | null;
  /**
   * False during the first render pass (server render + first client render),
   * true once the persisted session has been read from localStorage. Route
   * guards must wait for this or they will bounce a signed-in user to /login.
   */
  hydrated: boolean;
  signInAs: (userId: string) => void;
  signOut: () => void;
  setActiveClassId: (id: string) => void;
  setActiveAssessmentId: (id: string) => void;
  setActiveContext: (
  classId: string,
  assessmentId: string
) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...defaultState, ...(JSON.parse(raw) as SessionState) });
    } catch {
      /* prototype only - ignore unreadable storage */
    }
    setHydrated(true);
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
    const user = state.userId ? (users.find((u) => u.id === state.userId) ?? null) : null;
    return {
      ...state,
      user,
      hydrated,
      signInAs: (userId: string) => {
        const next = { ...state, userId };
        // Jumping into a lecturer persona should land on a class they own.
        const target = users.find((u) => u.id === userId);
        if (target?.role === "lecturer") {
          const owned = classes.filter((c) => c.lecturerId === userId);
          if (owned.length && !owned.some((c) => c.id === next.activeClassId)) {
            next.activeClassId = owned[0].id;
          }
        }
        // The persisted assessment might belong to a different class (e.g. a
        // previous persona's) - re-sync it so every tab, not just Dashboard,
        // opens on data that actually matches the active class (see #2).
        if (!assessmentBelongsToClass(next.activeAssessmentId, next.activeClassId)) {
          next.activeAssessmentId = firstAssessmentIdForClass(next.activeClassId);
        }
        persist(next);
      },
      signOut: () => persist({ ...state, userId: null }),
      setActiveClassId: (activeClassId: string) => {
        const activeAssessmentId = assessmentBelongsToClass(state.activeAssessmentId, activeClassId)
          ? state.activeAssessmentId
          : firstAssessmentIdForClass(activeClassId);
        persist({ ...state, activeClassId, activeAssessmentId });
      },
      setActiveAssessmentId: (activeAssessmentId: string) =>
        persist({ ...state, activeAssessmentId }),
      setActiveContext: (
  activeClassId: string,
  activeAssessmentId: string,
) => {
  if (!assessmentBelongsToClass(activeAssessmentId, activeClassId)) {
    throw new Error("The assessment does not belong to the selected class.");
  }

  persist({
    ...state,
    activeClassId,
    activeAssessmentId,
  });
},
    };

  }, [state, hydrated, persist]);


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

export const lecturerClasses = (lecturerId: string) =>
  classes.filter((c) => c.lecturerId === lecturerId);

export const staffDirectory = staffUsers;
