import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { peerRatings, submissions } from "@/mocks/data";

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
}

export const COMMENT_LIMIT = 500;

const storageKey = (assessmentId: string, studentId: string) =>
  `peerly.draft.${assessmentId}.${studentId}`;

/** Seed a first-time draft from the mock data, so the seeded personas look real. */
function seedFromMocks(assessmentId: string, studentId: string): EvaluationDraft {
  const submission = submissions.find(
    (s) => s.assessmentId === assessmentId && s.evaluatorStudentId === studentId,
  );
  if (!submission) return { entries: {} };

  const entries: Record<string, DraftEntry> = {};
  peerRatings
    .filter((rating) => rating.submissionId === submission.id)
    .forEach((rating) => {
      entries[rating.evaluatedStudentId] = {
        ratingOptionId: rating.ratingOptionId,
        comment: rating.comment,
      };
    });

  return {
    entries,
    submittedAt: submission.status === "submitted" ? submission.submittedAt : undefined,
  };
}

/**
 * A student's in-progress evaluation.
 *
 * Autosaves to localStorage on every change so the form, review screen and
 * confirmation all read the same draft, and so a half-finished evaluation
 * survives a refresh. A real backend would PATCH the draft instead.
 */
export function useEvaluationDraft(assessmentId: string, studentId: string | undefined) {
  const [draft, setDraft] = useState<EvaluationDraft>({ entries: {} });
  const [hydrated, setHydrated] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!studentId) return;
    setHydrated(false);
    let next: EvaluationDraft;
    try {
      const raw = window.localStorage.getItem(storageKey(assessmentId, studentId));
      next = raw ? (JSON.parse(raw) as EvaluationDraft) : seedFromMocks(assessmentId, studentId);
    } catch {
      next = seedFromMocks(assessmentId, studentId);
    }
    setDraft(next);
    setHydrated(true);
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
    },
    [assessmentId, studentId],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
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
    (submittedAt: string) => persist({ ...draft, submittedAt }),
    [draft, persist],
  );

  const reopen = useCallback(() => persist({ ...draft, submittedAt: undefined }), [draft, persist]);

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
