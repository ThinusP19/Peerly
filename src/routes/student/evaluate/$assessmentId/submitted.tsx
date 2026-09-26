import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, Lock } from "lucide-react";
import { useEffect, useMemo } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvaluationDraft } from "@/lib/evaluation-draft";
import { formatDateTimeLong, isOverdue } from "@/lib/format";
import { closedAtOf } from "@/lib/assessment-form";
import { useSession } from "@/lib/session";
import { getStudentRatingOptions, getStudentAssessment } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/student/evaluate/$assessmentId/submitted")({
  head: () => titleHead("Evaluation submitted"),
  component: SubmittedPage,
});

// Long forms read badly at full width, so the evaluation flow is capped.
const FLOW = "mx-auto w-full max-w-3xl space-y-3";

function SubmittedPage() {
  const { assessmentId } = Route.useParams();
  const { user } = useSession();
  const studentId = user!.id;
  const navigate = useNavigate();

  const view = useQuery({
    queryKey: ["student-assessment", studentId, assessmentId],
    queryFn: () => getStudentAssessment(studentId, assessmentId),
  });
  const options = useQuery({
    queryKey: ["student-rating-options"],
    queryFn: getStudentRatingOptions,
  });

  const { draft, hydrated, isSubmitted, reopen } = useEvaluationDraft(assessmentId, studentId);

  const members = useMemo(() => view.data?.members ?? [], [view.data]);
  const optionById = useMemo(
    () => new Map((options.data ?? []).map((option) => [option.id, option])),
    [options.data],
  );

  // Nothing to confirm if they haven't actually submitted - send them to the form.
  useEffect(() => {
    if (hydrated && !isSubmitted) {
      navigate({
        to: "/student/evaluate/$assessmentId",
        params: { assessmentId },
        replace: true,
      });
    }
  }, [hydrated, isSubmitted, assessmentId, navigate]);

  if (view.isPending || options.isPending || !hydrated) {
    return (
      <div className={FLOW}>
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  if (!view.data) {
    return (
      <div className={FLOW}>
        <EmptyState
          title="We couldn't find that assessment"
          action={
            <Button asChild variant="outline">
              <Link to="/student">Back to your assessments</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { assessment, klass, group } = view.data;
  const canAmend = assessment.status === "open" && !isOverdue(assessment.closesAt);

  return (
    <div className={FLOW}>
      <Card className="flex flex-col items-center gap-3 rounded-2xl border-0 px-5 py-8 text-center shadow-card sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-xl bg-success-muted text-success">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Your evaluation has been submitted
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {klass.moduleCode} · {assessment.name} · Group {group.groupNumber}
          </p>
        </div>
      </Card>

      <Card className="divide-y overflow-hidden rounded-2xl border-0 shadow-card">
        <div className="px-5 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-foreground">What we recorded</h2>
        </div>

        <dl className="divide-y">
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Submitted at
            </dt>
            <dd className="text-sm break-words text-foreground tabular-nums sm:text-right">
              {draft.submittedAt ? formatDateTimeLong(draft.submittedAt) : "-"}
            </dd>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Group members rated
            </dt>
            <dd className="text-sm break-words text-foreground tabular-nums sm:text-right">
              {members.length} of {members.length}
            </dd>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
            <dt className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Comments left
            </dt>
            <dd className="text-sm break-words text-foreground tabular-nums sm:text-right">
              {members.filter((m) => draft.entries[m.id]?.comment?.trim()).length}
            </dd>
          </div>
        </dl>

        <ul className="divide-y">
          {members.map((member) => {
            const entry = draft.entries[member.id];
            const option = entry?.ratingOptionId ? optionById.get(entry.ratingOptionId) : undefined;
            return (
              <li key={member.id} className="px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-sm font-semibold text-foreground">
                    {member.name} {member.surname}
                  </p>
                  <p className="text-sm font-semibold text-accent-foreground">
                    {option?.label ?? "Not rated"}
                  </p>
                </div>
                {option ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{option.description}</p>
                ) : null}
                {entry?.comment?.trim() ? (
                  <p className="mt-2 rounded-lg bg-muted p-3.5 text-sm break-words text-foreground">
                    “{entry.comment}”
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          {canAmend ? (
            <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                You can still change your answers until{" "}
                <span className="font-semibold">{formatDateTimeLong(assessment.closesAt)}</span>.
                After that your submission is final.
              </p>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-lg bg-muted p-3.5 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                This assessment closed on {formatDateTimeLong(closedAtOf(assessment))}, so your
                submission is final.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button asChild className="h-10 w-full px-4 sm:w-auto">
              <Link to="/student">Back to your assessments</Link>
            </Button>
            {canAmend ? (
              <Button
                variant="outline"
                className="h-10 w-full px-4 sm:w-auto"
                onClick={() => {
                  reopen();
                  navigate({
                    to: "/student/evaluate/$assessmentId",
                    params: { assessmentId },
                  });
                }}
              >
                Amend your evaluation
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
