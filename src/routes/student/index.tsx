import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, LifeBuoy, Link2Off, TriangleAlert, Users } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { studentAssessmentState, studentStateBadge } from "@/lib/domain";
import { useDraftSummaries, type DraftSummary } from "@/lib/evaluation-draft";
import { formatDateTimeLong, formatDeadline, isOverdue } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Enrolment } from "@/mocks/types";
import {
  getStudentAssessments,
  getStudentEnrolment,
  type StudentAssessmentView,
} from "@/services/peerly";

export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

function StudentDashboard() {
  const { user } = useSession();
  const studentId = user!.id;

  const enrolment = useQuery({
    queryKey: ["student-enrolment", studentId],
    queryFn: () => getStudentEnrolment(studentId),
  });
  const views = useQuery({
    queryKey: ["student-assessments", studentId],
    queryFn: () => getStudentAssessments(studentId),
  });

  // Drafts live in localStorage until they're submitted, so the dashboard has
  // to read them to show "In progress" rather than "Not started".
  const assessmentIds = useMemo(
    () => (views.data ?? []).map((view) => view.assessment.id),
    [views.data],
  );
  const draftSummaries = useDraftSummaries(studentId, assessmentIds);

  if (enrolment.isPending || views.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-36 w-full rounded-lg" />
      </div>
    );
  }

  // An unmatched or conflicting enrolment means we can't show any assessments —
  // explain what happened and what to do rather than showing an empty list.
  if (enrolment.data && enrolment.data.matchStatus !== "matched") {
    return <EnrolmentProblem enrolment={enrolment.data} />;
  }

  const assessments = views.data ?? [];

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Your peer assessments
        </h1>
        <p className="text-sm text-muted-foreground">
          Rate each member of your group on how they contributed. Your lecturer sees your ratings;
          the people you rate never do.
        </p>
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No assessments yet"
          description="When your lecturer opens a peer assessment for one of your groups, it will appear here."
        />
      ) : (
        <div className="space-y-4">
          {assessments.map((view) => (
            <AssessmentCard
              key={view.assessment.id}
              view={view}
              draft={draftSummaries[view.assessment.id]}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AssessmentCard({ view, draft }: { view: StudentAssessmentView; draft?: DraftSummary }) {
  const { assessment, klass, group, members, submission } = view;

  // A locally saved draft is more recent than whatever the service returned.
  const effectiveSubmission = draft
    ? draft.submittedAt
      ? { ...submission, status: "submitted" as const, submittedAt: draft.submittedAt }
      : draft.ratedCount > 0
        ? { ...submission, status: "draft" as const }
        : submission
    : submission;

  const state = studentAssessmentState(assessment, effectiveSubmission as typeof submission);
  const badge = studentStateBadge[state];

  const closingSoon = state !== "submitted" && assessment.status === "open";
  const overdue = isOverdue(assessment.closesAt);

  const cta = {
    "not-open": null,
    "not-started": "Start evaluation",
    "in-progress": "Continue evaluation",
    submitted: "View your submission",
    "closed-missed": null,
  }[state];

  return (
    <Card className="overflow-hidden shadow-card">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {klass.moduleCode} · {klass.academicPeriod}
            </p>
            <h2 className="text-base font-semibold text-foreground">{assessment.name}</h2>
          </div>
          <StatusBadge status={badge.status} label={badge.label} />
        </div>

        <p className="text-sm text-muted-foreground">{assessment.description}</p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <dt className="text-muted-foreground">Your group</dt>
              <dd className="font-medium text-foreground">
                Group {group.groupNumber} · {members.length + 1} members
              </dd>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <CalendarClock
              className={`mt-0.5 size-4 shrink-0 ${overdue ? "text-danger" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <div>
              <dt className="text-muted-foreground">
                {assessment.status === "draft" ? "Opens" : "Closes"}
              </dt>
              <dd className="font-medium text-foreground">
                {formatDateTimeLong(
                  assessment.status === "draft" ? assessment.opensAt : assessment.closesAt,
                )}
                <span
                  className={`ml-1 font-normal ${overdue && closingSoon ? "text-danger" : "text-muted-foreground"}`}
                >
                  (
                  {formatDeadline(
                    assessment.status === "draft" ? assessment.opensAt : assessment.closesAt,
                  )}
                  )
                </span>
              </dd>
            </div>
          </div>
        </dl>

        {state === "closed-missed" ? (
          <div className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-muted p-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              This assessment closed before you submitted. Speak to your lecturer if you think this
              is a mistake.
            </p>
          </div>
        ) : null}

        {cta ? (
          <Button asChild className="w-full sm:w-auto">
            <Link to="/student/evaluate/$assessmentId" params={{ assessmentId: assessment.id }}>
              {cta}
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Full-page explanation for a student we couldn't match to a class list. */
function EnrolmentProblem({ enrolment }: { enrolment: Enrolment }) {
  const { user } = useSession();
  const isConflict = enrolment.matchStatus === "conflict";

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <span
          className={`flex size-12 items-center justify-center rounded-full ${
            isConflict ? "bg-danger-muted text-danger" : "bg-warning-muted text-warning"
          }`}
        >
          {isConflict ? (
            <TriangleAlert className="size-6" aria-hidden="true" />
          ) : (
            <Link2Off className="size-6" aria-hidden="true" />
          )}
        </span>
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {isConflict
              ? "We need to check your class list entry"
              : "We couldn't match your account to a class list yet"}
          </h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Your account is active, but it isn't linked to a class yet — so there's nothing for you
            to evaluate at the moment.
          </p>
        </div>
        <StatusBadge status={isConflict ? "conflict" : "unmatched"} />
      </div>

      <Card className="space-y-4 p-5 shadow-card">
        <div>
          <h2 className="text-sm font-semibold text-foreground">What happened</h2>
          <p className="mt-1 text-sm text-muted-foreground">{enrolment.matchNote}</p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground">Your details</h2>
          <dl className="mt-1.5 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Name on your account</dt>
              <dd className="text-right font-medium text-foreground">
                {user?.name} {user?.surname}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Name on the class list</dt>
              <dd className="text-right font-medium text-foreground">
                {enrolment.importedName} {enrolment.importedSurname}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Student number</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {enrolment.studentNumber}
              </dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground">What to do next</h2>
          <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              Check that the student number above is the one printed on your student card. If it
              isn't, that's the mismatch.
            </li>
            <li>
              Email your lecturer with your student number and the module code, and ask them to
              re-run the class list match.
            </li>
            <li>
              Come back to this page afterwards — once you're matched, your assessments appear here
              automatically.
            </li>
          </ol>
        </div>

        <div className="flex gap-2.5 rounded-md bg-muted p-3 text-sm text-muted-foreground">
          <LifeBuoy className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Nothing is lost while you wait. If your lecturer fixes the match before the assessment
            closes, you'll still be able to submit.
          </p>
        </div>
      </Card>
    </div>
  );
}
