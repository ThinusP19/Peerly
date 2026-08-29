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
import { useSession } from "@/lib/session";
import { getStudentRatingOptions, getStudentAssessment } from "@/services/peerly";

export const Route = createFileRoute("/student/evaluate/$assessmentId/submitted")({
  component: SubmittedPage,
});

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

  // Nothing to confirm if they haven't actually submitted — send them to the form.
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
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!view.data) {
    return (
      <EmptyState
        title="We couldn't find that assessment"
        action={
          <Button asChild variant="outline">
            <Link to="/student">Back to your assessments</Link>
          </Button>
        }
      />
    );
  }

  const { assessment, klass, group } = view.data;
  const canAmend = assessment.status === "open" && !isOverdue(assessment.closesAt);

  return (
    <>
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-muted text-success">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Your evaluation has been submitted
          </h1>
          <p className="text-sm text-muted-foreground">
            {klass.moduleCode} · {assessment.name} · Group {group.groupNumber}
          </p>
        </div>
      </div>

      <Card className="divide-y shadow-card">
        <div className="space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">What we recorded</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Submitted at</dt>
              <dd className="font-medium tabular-nums text-foreground">
                {draft.submittedAt ? formatDateTimeLong(draft.submittedAt) : "—"}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Group members rated</dt>
              <dd className="font-medium text-foreground">
                {members.length} of {members.length}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted-foreground">Comments left</dt>
              <dd className="font-medium text-foreground">
                {members.filter((m) => draft.entries[m.id]?.comment?.trim()).length}
              </dd>
            </div>
          </dl>
        </div>

        <ul className="divide-y">
          {members.map((member) => {
            const entry = draft.entries[member.id];
            const option = entry?.ratingOptionId ? optionById.get(entry.ratingOptionId) : undefined;
            return (
              <li key={member.id} className="space-y-1 p-4 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="font-medium text-foreground">
                    {member.name} {member.surname}
                  </p>
                  <p className="text-sm font-semibold text-accent-foreground">
                    {option?.label ?? "Not rated"}
                  </p>
                </div>
                {option ? (
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                ) : null}
                {entry?.comment?.trim() ? (
                  <p className="mt-1.5 rounded-md bg-muted p-2.5 text-sm text-foreground">
                    “{entry.comment}”
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="space-y-3 p-4 sm:p-5">
          {canAmend ? (
            <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
              <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                You can still change your answers until{" "}
                <span className="font-medium">{formatDateTimeLong(assessment.closesAt)}</span>.
                After that your submission is final.
              </p>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                This assessment closed on {formatDateTimeLong(assessment.closesAt)}, so your
                submission is final.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <Button asChild className="w-full sm:w-auto">
              <Link to="/student">Back to your assessments</Link>
            </Button>
            {canAmend ? (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
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
    </>
  );
}
