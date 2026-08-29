import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { BusyButton } from "@/components/shared/BusyButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { RatingScale } from "@/components/shared/RatingScale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDraftProgress, useEvaluationDraft } from "@/lib/evaluation-draft";
import { formatDateTimeLong } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getStudentRatingOptions, getStudentAssessment, submitEvaluation } from "@/services/peerly";

export const Route = createFileRoute("/student/evaluate/$assessmentId/review")({
  component: ReviewPage,
});

function ReviewPage() {
  const { assessmentId } = Route.useParams();
  const { user } = useSession();
  const studentId = user!.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const view = useQuery({
    queryKey: ["student-assessment", studentId, assessmentId],
    queryFn: () => getStudentAssessment(studentId, assessmentId),
  });
  const options = useQuery({
    queryKey: ["student-rating-options"],
    queryFn: getStudentRatingOptions,
  });

  const members = useMemo(() => view.data?.members ?? [], [view.data]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);

  const { draft, hydrated, markSubmitted } = useEvaluationDraft(assessmentId, studentId);
  const progress = useDraftProgress(draft, memberIds);

  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  if (view.isPending || options.isPending || !hydrated) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-40 w-full rounded-lg" />
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
  const missingMembers = members.filter((member) => progress.missing.includes(member.id));

  const handleSubmit = async () => {
    if (!progress.complete) {
      setBlocked(true);
      return;
    }
    setBusy(true);
    const entries = memberIds.map((id) => ({
      evaluatedStudentId: id,
      ratingOptionId: draft.entries[id]!.ratingOptionId!,
      comment: draft.entries[id]?.comment || undefined,
    }));
    const { submittedAt } = await submitEvaluation(assessmentId, studentId, entries);
    markSubmitted(submittedAt);
    await queryClient.invalidateQueries();
    setBusy(false);
    navigate({
      to: "/student/evaluate/$assessmentId/submitted",
      params: { assessmentId },
      replace: true,
    });
  };

  return (
    <>
      <PageHeader
        title="Check before you submit"
        backTo="/student/evaluate/$assessmentId"
        backLabel="Back to the form"
        description={
          <>
            {klass.moduleCode} · {assessment.name} · Group {group.groupNumber}. Once you submit,
            your lecturer can see your ratings.
          </>
        }
      />

      <ProgressBar
        value={progress.rated}
        max={progress.total}
        label={`${progress.rated} of ${progress.total} rated`}
        valueLabel={progress.complete ? "Ready to submit" : "Something is still missing"}
        tone={progress.complete ? "success" : "warning"}
      />

      {blocked && !progress.complete ? (
        <div
          role="alert"
          className="flex gap-2.5 rounded-md border border-danger/30 bg-danger-muted p-3.5 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">
              You haven't rated{" "}
              {missingMembers.map((member) => `${member.name} ${member.surname}`).join(", ")} yet.
            </p>
            <p>Every group member needs a rating before you can submit.</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {members.map((member) => {
          const entry = draft.entries[member.id] ?? {};
          const missing = !entry.ratingOptionId;

          return (
            <Card
              key={member.id}
              className={`p-4 shadow-card sm:p-5 ${missing ? "border-warning/40" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <h2 className="text-base font-semibold text-foreground">
                  {member.name} {member.surname}
                </h2>
                <Button asChild variant="ghost" size="sm">
                  <Link
                    to="/student/evaluate/$assessmentId"
                    params={{ assessmentId }}
                    hash={`member-${member.id}`}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {missing ? (
                  <div className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <p>You haven't chosen a rating for {member.name} yet.</p>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Your rating
                    </p>
                    {/* Read-only restatement uses exactly the same wording as the form. */}
                    <RatingScale
                      options={options.data ?? []}
                      name={`review-${member.id}`}
                      value={entry.ratingOptionId}
                      readOnly
                    />
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Your comment
                  </p>
                  <p className="text-sm text-foreground">
                    {entry.comment?.trim() ? (
                      entry.comment
                    ) : (
                      <span className="text-muted-foreground">You didn't leave a comment.</span>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="space-y-3 p-4 shadow-card sm:p-5">
        <p className="text-sm text-muted-foreground">
          You can change your answers until this assessment closes on{" "}
          <span className="font-medium text-foreground">
            {formatDateTimeLong(assessment.closesAt)}
          </span>
          .
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <BusyButton
            className="w-full sm:w-auto"
            busy={busy}
            busyLabel="Submitting…"
            onClick={handleSubmit}
          >
            Submit evaluation
          </BusyButton>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/student/evaluate/$assessmentId" params={{ assessmentId }}>
              Keep editing
            </Link>
          </Button>
        </div>
      </Card>
    </>
  );
}
