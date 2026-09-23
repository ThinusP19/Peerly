import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getMyEvaluation, saveEvaluationDraft } from "@/services/peerly";

export interface DraftEntry {
  ratingOptionId?: string;
  comment?: string;
}

export interface EvaluationDraft {
  /** Keyed by the id of the student being evaluated. */
  entries: Record<string, DraftEntry>;
  submittedAt?: string;
  /** Bumped on every autosave so the "saved" indicator can react. */
  savedAt?: string;
  /**
   * Set when the student chose to change a submitted evaluation. Their edits
   * live on this device until they submit again - the server keeps the
   * submitted version, which is the one that counts, in the meantime.
   */
  reopenedAt?: string;
}

export const COMMENT_LIMIT = 500;

const storageKey = (assessmentId: string, studentId: string) =>
  `peerly.draft.${assessmentId}.${studentId}`;

const readLocal = (assessmentId: string, studentId: string): EvaluationDraft | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(assessmentId, studentId));
    return raw ? (JSON.parse(raw) as EvaluationDraft) : null;
  } catch {
    return null;
  }
};

/**
 * Chooses between what the server holds and what this browser holds.
 *
 * The server is the record: it is what follows the student to another device
 * and what the lecturer's monitor counts. This browser's copy wins only where
 * it holds something the server cannot - edits to a reopened submission, or
 * work typed while an autosave was failing (CI-10).
 */
function reconcile(
  server: Awaited<ReturnType<typeof getMyEvaluation>> | null,
  local: EvaluationDraft | null,
): EvaluationDraft {
  if (!server) return local ?? { entries: {} };

  const entries: Record<string, DraftEntry> = {};
  for (const entry of server.entries) {
    entries[entry.evaluatedStudentId] = {
      ratingOptionId: entry.ratingOptionId,
      ...(entry.comment ? { comment: entry.comment } : {}),
    };
  }
  const submittedAt =
    server.context.submission?.status === "submitted"
      ? server.context.submission.submittedAt
      : undefined;

  if (submittedAt) {
    // Reopened on this device after this submission: keep editing that.
    if (local?.reopenedAt && local.reopenedAt > submittedAt) return local;
    return { entries, submittedAt };
  }
  // Not submitted. This device's copy is at least as fresh as the server's
  // when it has one - every change is written here first, then sent.
  if (local && !local.submittedAt && Object.keys(local.entries).length > 0) return local;
  return { entries };
}

/**
 * A student's in-progress evaluation.
 *
 * Loads what the server holds, then autosaves every change twice: to this
 * browser at once, so a refresh or a dropped connection loses nothing, and to
 * the server shortly after, so the draft follows the student to another device
 * and the lecturer's monitor can see work in progress (CI-10).
 */
export function useEvaluationDraft(assessmentId: string, studentId: string | undefined) {
  const [draft, setDraft] = useState<EvaluationDraft>({ entries: {} });
  const [hydrated, setHydrated] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setHydrated(false);
    getMyEvaluation(assessmentId)
      .catch(() => null)
      .then((server) => {
        if (cancelled) return;
        setDraft(reconcile(server, readLocal(assessmentId, studentId)));
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId, studentId]);

  const persist = useCallback(
    (next: EvaluationDraft) => {
      setDraft(next);
      if (!studentId) return;
      try {
        window.localStorage.setItem(storageKey(assessmentId, studentId), JSON.stringify(next));
      } catch {
        /* prototype only - ignore unwritable storage */
      }
      setJustSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setJustSaved(false), 2200);

      // A submitted evaluation is not a draft - the server refuses to turn it
      // back into one, and a reopened one is sent whole on resubmission.
      if (next.submittedAt || next.reopenedAt) return;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        const entries = Object.entries(next.entries).flatMap(([evaluatedStudentId, entry]) =>
          entry.ratingOptionId
            ? [
                {
                  evaluatedStudentId,
                  ratingOptionId: entry.ratingOptionId,
                  ...(entry.comment ? { comment: entry.comment } : {}),
                },
              ]
            : [],
        );
        // Quiet on failure by design: the copy in this browser still holds it.
        void saveEvaluationDraft(assessmentId, entries);
      }, 600);
    },
    [assessmentId, studentId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const setRating = useCallback(
    (evaluatedStudentId: string, ratingOptionId: string) =>
      persist({
        ...draft,
        savedAt: new Date().toISOString(),
        entries: {
          ...draft.entries,
          [evaluatedStudentId]: { ...draft.entries[evaluatedStudentId], ratingOptionId },
        },
      }),
    [draft, persist],
  );

  const setComment = useCallback(
    (evaluatedStudentId: string, comment: string) =>
      persist({
        ...draft,
        savedAt: new Date().toISOString(),
        entries: {
          ...draft.entries,
          [evaluatedStudentId]: {
            ...draft.entries[evaluatedStudentId],
            comment: comment.slice(0, COMMENT_LIMIT),
          },
        },
      }),
    [draft, persist],
  );

  const markSubmitted = useCallback(
    (submittedAt: string) => persist({ ...draft, submittedAt, reopenedAt: undefined }),
    [draft, persist],
  );

  const reopen = useCallback(
    () => persist({ ...draft, submittedAt: undefined, reopenedAt: new Date().toISOString() }),
    [draft, persist],
  );

  return {
    draft,
    hydrated,
    justSaved,
    isSubmitted: Boolean(draft.submittedAt),
    setRating,
    setComment,
    markSubmitted,
    reopen,
  };
}

/** How many of `memberIds` have a rating yet. */
export function useDraftProgress(draft: EvaluationDraft, memberIds: string[]) {
  return useMemo(() => {
    const rated = memberIds.filter((id) => draft.entries[id]?.ratingOptionId);
    return {
      rated: rated.length,
      total: memberIds.length,
      missing: memberIds.filter((id) => !draft.entries[id]?.ratingOptionId),
      complete: rated.length === memberIds.length && memberIds.length > 0,
    };
  }, [draft, memberIds]);
}

/* ------------------------------------------------------------------ *
 * Reading drafts without opening one
 * ------------------------------------------------------------------ */

export interface DraftSummary {
  submittedAt?: string;
  ratedCount: number;
}

/** Peek at a stored draft without loading the whole editing hook. */
export function readDraftSummary(assessmentId: string, studentId: string): DraftSummary | null {
  try {
    const raw = window.localStorage.getItem(storageKey(assessmentId, studentId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as EvaluationDraft;
    return {
      submittedAt: draft.submittedAt,
      ratedCount: Object.values(draft.entries ?? {}).filter((entry) => entry.ratingOptionId).length,
    };
  } catch {
    return null;
  }
}

/**
 * Draft state for several assessments at once, so the dashboard can show
 * "In progress" for work saved on the evaluation form but not yet submitted.
 * Reads after mount, so the server and first client render still agree.
 */
export function useDraftSummaries(
  studentId: string | undefined,
  assessmentIds: string[],
): Record<string, DraftSummary> {
  const [summaries, setSummaries] = useState<Record<string, DraftSummary>>({});

  useEffect(() => {
    if (!studentId) return;
    const next: Record<string, DraftSummary> = {};
    assessmentIds.forEach((assessmentId) => {
      const summary = readDraftSummary(assessmentId, studentId);
      if (summary) next[assessmentId] = summary;
    });
    setSummaries(next);
  }, [studentId, assessmentIds]);

  return summaries;
}
