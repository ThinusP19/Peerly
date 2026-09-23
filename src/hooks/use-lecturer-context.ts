import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSession } from "@/lib/session";
import { getAssessments, getClassRoster, getClassSummaries, getClasses } from "@/services/peerly";

/**
 * The lecturer's classes, their assessments, and which one is active.
 *
 * One hook rather than sixteen screens each doing their own lookup. It also
 * owns a problem none of them could solve alone: the active class and
 * assessment are remembered in local storage, and a remembered id can be
 * stale - a class that was deleted, a database that was reseeded, or the
 * placeholder the app starts with before anything has been chosen. Sending one
 * of those to the API produces a 400 on every screen at once, which is exactly
 * what happened when the mock ids survived the move to real data.
 *
 * So the hook validates what it was given against what the server actually
 * returned, and falls back to the first real class. The selection is a
 * preference; the server's list is the truth.
 */
export function useLecturerClasses() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["classes"],
    queryFn: () => getClasses(),
    enabled: user?.role === "lecturer",
  });
}

/** The lecturer's classes with their counts, including which assessment is live. */
export function useClassSummaries() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["class-summaries"],
    queryFn: () => getClassSummaries(user!.id),
    enabled: user?.role === "lecturer",
  });
}

export function useLecturerContext() {
  const { activeClassId, activeAssessmentId, setActiveClassId, setActiveAssessmentId } =
    useSession();

  const classesQuery = useClassSummaries();
  const summaries = classesQuery.data ?? [];
  const classes = summaries.map((summary) => summary.klass);

  // Only trust the remembered id if the server says it exists. Failing that,
  // open on a class that has something live rather than whichever sorts first -
  // landing a lecturer on an empty class when another has an assessment running
  // is technically correct and practically useless.
  const preferred =
    summaries.find((summary) => summary.activeAssessment?.status === "open") ??
    summaries.find((summary) => summary.assessmentCount > 0) ??
    summaries[0];

  const known = classes.find((c) => c.id === activeClassId);

  // While the list is being refetched it is not evidence that a class does not
  // exist. Correcting during a refetch threw away a deliberate choice: creating
  // a class selects it and then invalidates, and for the moment in between the
  // new class was absent from the cache - so this hook helpfully put the
  // lecturer back in their old class and imported the list into it.
  const settled = !classesQuery.isFetching;
  const klass = known ?? (settled ? preferred?.klass : undefined);
  const classId = klass?.id ?? activeClassId;

  const assessmentsQuery = useQuery({
    queryKey: ["assessments", classId],
    queryFn: () => getAssessments(classId),
    enabled: Boolean(classId),
  });
  const assessments = assessmentsQuery.data ?? [];

  const assessment =
    assessments.find((a) => a.id === activeAssessmentId) ??
    (assessmentsQuery.isFetching ? undefined : assessments[0]);

  // Write the corrected choice back, so the next render and the next visit
  // both start from something real.
  useEffect(() => {
    if (settled && klass && klass.id !== activeClassId) setActiveClassId(klass.id);
  }, [settled, klass, activeClassId, setActiveClassId]);

  useEffect(() => {
    if (!assessmentsQuery.isFetching && assessment && assessment.id !== activeAssessmentId) {
      setActiveAssessmentId(assessment.id);
    }
  }, [assessmentsQuery.isFetching, assessment, activeAssessmentId, setActiveAssessmentId]);

  return {
    classes,
    klass,
    /** Empty string until the classes have loaded - queries should stay disabled. */
    classId,
    assessments,
    assessment,
    assessmentId: assessment?.id ?? "",
    setActiveClassId,
    setActiveAssessmentId,
    isLoading: classesQuery.isLoading || assessmentsQuery.isLoading,
    /** True once we know the lecturer owns no classes at all. */
    hasNoClasses: settled && !classesQuery.isLoading && classes.length === 0,
  };
}

/**
 * Everyone in a class, by id, for the screens that need to put a name to a
 * student id - the matrix, the group lists, the allocation preview.
 */
export function useClassRoster(classId: string) {
  const query = useQuery({
    queryKey: ["roster", classId],
    queryFn: () => getClassRoster(classId),
    enabled: Boolean(classId),
  });

  const students = query.data ?? [];
  return {
    students,
    byId: new Map(students.map((student) => [student.id, student])),
    isLoading: query.isLoading,
  };
}
