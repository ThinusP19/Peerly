import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  LifeBuoy,
  Link2Off,
  Lock,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { studentAssessmentState, studentStateBadge } from "@/lib/domain";
import { useDraftSummaries } from "@/lib/evaluation-draft";
import { formatDate, formatDateTimeLong, formatDeadline, isOverdue } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Enrolment } from "@/mocks/types";
import {
  getStudentAssessments,
  getStudentEnrolment,
  type StudentAssessmentView,
} from "@/services/peerly";

export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

/** A deadline inside three days is worth shouting about; beyond that it isn't. */
const URGENT_DAYS = 3;
const isUrgent = (iso: string) =>
  new Date(iso).getTime() - Date.now() < URGENT_DAYS * 24 * 60 * 60 * 1000;

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

  // Drafts live in localStorage until they're submitted, so the dashboard has to
  // read them to show "In progress" rather than "Not started".
  const assessmentIds = useMemo(
    () => (views.data ?? []).map((view) => view.assessment.id),
    [views.data],
  );
  const draftSummaries = useDraftSummaries(studentId, assessmentIds);

  // Split by what the student can actually do about it. Three of four cards
  // being unactionable is the whole reason this page needs sections.
  const groups = useMemo(() => {
    const stateOf = (view: StudentAssessmentView) => {
      const draft = draftSummaries[view.assessment.id];
      const submission = draft
        ? draft.submittedAt
          ? { ...view.submission, status: "submitted" as const, submittedAt: draft.submittedAt }
          : draft.ratedCount > 0
            ? { ...view.submission, status: "draft" as const }
            : view.submission
        : view.submission;
      return studentAssessmentState(view.assessment, submission as typeof view.submission);
    };

    const all = views.data ?? [];
    return {
      stateOf,
      action: all.filter((v) => ["not-started", "in-progress"].includes(stateOf(v))),
      submitted: all.filter((v) => stateOf(v) === "submitted"),
      upcoming: all.filter((v) => stateOf(v) === "not-open"),
      closed: all.filter((v) => stateOf(v) === "closed-missed"),
      total: all.length,
    };
  }, [views.data, draftSummaries]);

  if (enrolment.isPending || views.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  // An unmatched or conflicting enrolment means we can't show any assessments -
  // explain what happened and what to do rather than showing an empty list.
  if (enrolment.data && enrolment.data.matchStatus !== "matched") {
    return <EnrolmentProblem enrolment={enrolment.data} />;
  }

  const todo = groups.action.length;

  return (
    <>
      {/* Answer the only question a student actually has: is anything waiting? */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Hi {user?.name}</h1>
        <p className="text-sm text-muted-foreground">
          {todo === 0
            ? "Nothing needs you right now."
            : `${todo} ${todo === 1 ? "evaluation needs" : "evaluations need"} you.`}{" "}
          Your lecturer sees your ratings; the people you rate never do.
        </p>
      </div>

      {groups.total === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No assessments yet"
          description="When your lecturer opens a peer assessment for one of your groups, it will appear here."
        />
      ) : null}

      {groups.action.length ? (
        <Section title="Needs you">
          {groups.action.map((view) => (
            <ActionCard key={view.assessment.id} view={view} state={groups.stateOf(view)} />
          ))}
        </Section>
      ) : null}

      {groups.submitted.length ? (
        <Section title="Submitted">
          {groups.submitted.map((view) => (
            <CompactRow
              key={view.assessment.id}
              view={view}
              icon={CheckCircle2}
              tone="success"
              meta={`Submitted · closes ${formatDate(view.assessment.closesAt)}`}
              action="View"
            />
          ))}
        </Section>
      ) : null}

      {groups.upcoming.length ? (
        <Section title="Coming up">
          {groups.upcoming.map((view) => (
            <CompactRow
              key={view.assessment.id}
              view={view}
              icon={CalendarClock}
              tone="muted"
              meta={`Opens ${formatDate(view.assessment.opensAt)} · ${formatDeadline(view.assessment.opensAt)}`}
            />
          ))}
        </Section>
      ) : null}

      {groups.closed.length ? (
        <Section title="Closed">
          {groups.closed.map((view) => (
            <CompactRow
              key={view.assessment.id}
              view={view}
              icon={Lock}
              tone="danger"
              meta={`Closed ${formatDate(view.assessment.closesAt)} · you didn't submit`}
            />
          ))}
        </Section>
      ) : null}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

/** The card for something the student can act on right now. Deliberately loud. */
function ActionCard({
  view,
  state,
}: {
  view: StudentAssessmentView;
  state: ReturnType<typeof studentAssessmentState>;
}) {
  const { assessment, klass, group, members } = view;
  const urgent = isUrgent(assessment.closesAt) && !isOverdue(assessment.closesAt);
  const badge = studentStateBadge[state];

  return (
    <Card className="overflow-hidden border-primary/30 shadow-raised">
      {/* Deadline sits above the fold, in the colour matching its urgency. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2.5 text-sm sm:px-5",
          urgent ? "bg-warning-muted text-warning" : "bg-accent text-accent-foreground",
        )}
      >
        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-semibold">Closes {formatDeadline(assessment.closesAt)}</span>
        <span className="opacity-80">- {formatDateTimeLong(assessment.closesAt)}</span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {klass.moduleCode} · Group {group.groupNumber}
            </p>
            <h3 className="mt-0.5 text-lg font-semibold text-foreground">{assessment.name}</h3>
          </div>
          <StatusBadge status={badge.status} label={badge.label} />
        </div>

        <p className="text-sm text-muted-foreground">{assessment.description}</p>

        <div className="flex items-center gap-2 text-sm text-foreground">
          <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-semibold">{members.length} people</span> to rate
          </span>
        </div>

        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link to="/student/evaluate/$assessmentId" params={{ assessmentId: assessment.id }}>
            {state === "in-progress" ? "Continue evaluation" : "Start evaluation"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

const rowTones = {
  success: "text-success",
  muted: "text-muted-foreground",
  danger: "text-danger",
} as const;

/** Everything the student cannot act on collapses to one quiet line. */
function CompactRow({
  view,
  icon: Icon,
  tone,
  meta,
  action,
}: {
  view: StudentAssessmentView;
  icon: LucideIcon;
  tone: keyof typeof rowTones;
  meta: string;
  action?: string;
}) {
  const { assessment, klass } = view;

  const body = (
    <>
      <Icon className={cn("size-4 shrink-0", rowTones[tone])} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {assessment.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {klass.moduleCode} · {meta}
        </span>
      </span>
      {action ? <span className="shrink-0 text-sm font-medium text-primary">{action}</span> : null}
    </>
  );

  if (!action) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-card">
        {body}
      </div>
    );
  }

  return (
    <Link
      to="/student/evaluate/$assessmentId"
      params={{ assessmentId: assessment.id }}
      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-card transition-colors hover:bg-muted/50"
    >
      {body}
    </Link>
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
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            isConflict ? "bg-danger-muted text-danger" : "bg-warning-muted text-warning",
          )}
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
            Your account is active, but it isn't linked to a class yet - so there's nothing for you
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
              Come back to this page afterwards - once you're matched, your assessments appear here
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
