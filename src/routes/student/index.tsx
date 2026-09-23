import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  LifeBuoy,
  Link2Off,
  Lock,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Hero } from "@/components/shared/Hero";
import { PanelHeader } from "@/components/shared/PanelHeader";
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

// The quiet panels sit side by side on xl, as many columns as there are panels.
const panelColumns: Record<number, string> = {
  1: "",
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
};

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
      <div className="space-y-3">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  // An unmatched or conflicting enrolment means we can't show any assessments -
  // explain what happened and what to do rather than showing an empty list.
  if (enrolment.data && enrolment.data.matchStatus !== "matched") {
    return <EnrolmentProblem enrolment={enrolment.data} />;
  }

  const todo = groups.action.length;
  const panelCount = [groups.submitted, groups.upcoming, groups.closed].filter(
    (list) => list.length > 0,
  ).length;

  return (
    <>
      {/* Answer the only question a student actually has: is anything waiting? */}
      <Hero
        eyebrow={format(new Date(), "EEEE d MMMM yyyy")}
        title={`Hi ${user?.name}`}
        subtitle={
          <>
            {todo === 0
              ? "Nothing needs you right now."
              : `${todo} ${todo === 1 ? "evaluation needs" : "evaluations need"} you.`}{" "}
            Your lecturer sees your ratings; the people you rate never do.
          </>
        }
        stats={
          groups.total === 0
            ? undefined
            : [
                { label: "To do", value: todo, detail: "Open for you now" },
                {
                  label: "Submitted",
                  value: groups.submitted.length,
                  detail: "Sent to your lecturer",
                },
                { label: "Coming up", value: groups.upcoming.length, detail: "Not open yet" },
              ]
        }
      />

      {groups.total === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No assessments yet"
          description="When your lecturer opens a peer assessment for one of your groups, it will appear here."
        />
      ) : null}

      {groups.action.length ? (
        <section aria-labelledby="needs-you" className="space-y-3">
          <h2 id="needs-you" className="sr-only">
            Needs you
          </h2>
          {groups.action.map((view) => (
            <ActionCard key={view.assessment.id} view={view} state={groups.stateOf(view)} />
          ))}
        </section>
      ) : null}

      {panelCount > 0 ? (
        <div className={cn("grid gap-3", panelColumns[panelCount])}>
          {groups.submitted.length ? (
            <ListPanel title="Submitted" count={groups.submitted.length}>
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
            </ListPanel>
          ) : null}

          {groups.upcoming.length ? (
            <ListPanel title="Coming up" count={groups.upcoming.length}>
              {groups.upcoming.map((view) => (
                <CompactRow
                  key={view.assessment.id}
                  view={view}
                  icon={CalendarClock}
                  tone="muted"
                  meta={`Opens ${formatDate(view.assessment.opensAt)} · ${formatDeadline(view.assessment.opensAt)}`}
                />
              ))}
            </ListPanel>
          ) : null}

          {groups.closed.length ? (
            <ListPanel title="Closed" count={groups.closed.length}>
              {groups.closed.map((view) => (
                <CompactRow
                  key={view.assessment.id}
                  view={view}
                  icon={Lock}
                  tone="danger"
                  meta={`Closed ${formatDate(view.assessment.closesAt)} · you didn't submit`}
                />
              ))}
            </ListPanel>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------ panels ------------------------------- */

function ListPanel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border-0 shadow-card">
      <PanelHeader title={title} count={count} />
      <ul className="divide-y">{children}</ul>
    </Card>
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
  const overdue = isOverdue(assessment.closesAt);
  const urgent = isUrgent(assessment.closesAt) && !overdue;
  const badge = studentStateBadge[state];

  return (
    <Card className="overflow-hidden rounded-2xl border border-primary/25 shadow-raised">
      {/* Deadline sits above the fold, in the colour matching its urgency. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-5 py-2.5 text-sm sm:px-6",
          urgent ? "bg-warning-muted text-warning" : "bg-accent text-accent-foreground",
        )}
      >
        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
        {/* Past the deadline it reads "Closed 19 days ago", not "Closes". The
            lecturer may not have closed it yet, so the card stays actionable -
            but the wording must not claim a deadline that has gone. */}
        <span className="font-semibold">
          {overdue ? "Closed" : "Closes"} {formatDeadline(assessment.closesAt)}
        </span>
        <span className="opacity-80">- {formatDateTimeLong(assessment.closesAt)}</span>
      </div>

      <div className="space-y-4 p-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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

        <Button asChild className="h-10 w-full px-4 sm:w-auto">
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
  success: "bg-success-muted text-success",
  muted: "bg-muted text-muted-foreground",
  danger: "bg-danger-muted text-danger",
} as const;

/** Everything the student cannot act on collapses to one quiet row. */
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
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
          rowTones[tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold break-words text-foreground">
          {assessment.name}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {klass.moduleCode} · {meta}
        </span>
      </span>
    </>
  );

  if (!action) {
    return <li className="flex items-start gap-3 px-5 py-3.5 sm:px-6">{body}</li>;
  }

  return (
    <li>
      <Link
        to="/student/evaluate/$assessmentId"
        params={{ assessmentId: assessment.id }}
        className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 sm:px-6"
      >
        {body}
        <span className="mt-1.5 flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
          {action}
          <ChevronRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}

/** Full-page explanation for a student we couldn't match to a class list. */
function EnrolmentProblem({ enrolment }: { enrolment: Enrolment }) {
  const { user } = useSession();
  const isConflict = enrolment.matchStatus === "conflict";

  const details = [
    { label: "Name on your account", value: `${user?.name ?? ""} ${user?.surname ?? ""}` },
    {
      label: "Name on the class list",
      value: `${enrolment.importedName} ${enrolment.importedSurname}`,
    },
    { label: "Student number", value: enrolment.studentNumber, numeric: true },
  ];

  return (
    <>
      <Card className="flex flex-col items-center gap-3 rounded-2xl border-0 px-5 py-8 text-center shadow-card sm:px-6">
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            isConflict ? "bg-danger-muted text-danger" : "bg-warning-muted text-warning",
          )}
        >
          {isConflict ? (
            <TriangleAlert className="size-6" aria-hidden="true" />
          ) : (
            <Link2Off className="size-6" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isConflict
              ? "We need to check your class list entry"
              : "We couldn't match your account to a class list yet"}
          </h1>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Your account is active, but it isn't linked to a class yet - so there's nothing for you
            to evaluate at the moment.
          </p>
        </div>
        <StatusBadge status={isConflict ? "conflict" : "unmatched"} />
      </Card>

      <Card className="divide-y overflow-hidden rounded-2xl border-0 shadow-card">
        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-sm font-semibold text-foreground">What happened</h2>
          <p className="mt-1 text-sm text-muted-foreground">{enrolment.matchNote}</p>
        </div>

        <div>
          <h2 className="px-5 pt-5 pb-1 text-sm font-semibold text-foreground sm:px-6">
            Your details
          </h2>
          <dl className="divide-y">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
              >
                <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {detail.label}
                </dt>
                <dd
                  className={cn(
                    "text-sm break-words text-foreground sm:text-right",
                    detail.numeric && "tabular-nums",
                  )}
                >
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <h2 className="text-sm font-semibold text-foreground">What to do next</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
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

        <div className="flex gap-2.5 bg-muted/40 px-5 py-3 text-xs text-muted-foreground sm:px-6">
          <LifeBuoy className="size-4 shrink-0" aria-hidden="true" />
          <p>
            Nothing is lost while you wait. If your lecturer fixes the match before the assessment
            closes, you'll still be able to submit.
          </p>
        </div>
      </Card>
    </>
  );
}
