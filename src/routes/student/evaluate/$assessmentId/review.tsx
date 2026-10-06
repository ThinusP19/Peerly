import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, Pencil, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BusyButton } from "@/components/shared/BusyButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { GroupLabel } from "@/components/shared/GroupLabel";
import { GroupLeaderBadge } from "@/components/shared/GroupLeaderBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { RatingScale } from "@/components/shared/RatingScale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks/use-now";
import { ApiError } from "@/lib/api";
import { useDraftProgress, useEvaluationDraft } from "@/lib/evaluation-draft";
import { formatDateTimeLong } from "@/lib/format";
import { useSession } from "@/lib/session";
import { assessmentPhase } from "@/lib/domain";
import { acceptsWork } from "@/lib/student-dashboard";
import { cn } from "@/lib/utils";
import { getStudentRatingOptions, getStudentAssessment, submitEvaluation } from "@/services/peerly";
import { titleHead } from "@/lib/page-title";

export const Route = createFileRoute("/student/evaluate/$assessmentId/review")({
  head: () => titleHead("Check before you submit"),
  component: ReviewPage,
});

// Long forms read badly at full width, so the evaluation flow is capped.
const FLOW = "mx-auto w-full max-w-3xl space-y-3";

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
  const now = useNow(view.data?.assessment.closesAt);

  if (view.isPending || options.isPending || !hydrated) {
    return (
      <div className={FLOW}>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
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

  // BR-05: past the closing time nothing can be submitted, whatever the status
  // says. Offering the button anyway only leads to a refusal.
  if (!acceptsWork(assessment, now)) {
    // Opened early, it is still before the opening time: say when it opens.
    const notOpenYet = ["draft", "scheduled"].includes(assessmentPhase(assessment, now));
    return (
      <div className={FLOW}>
        <PageHeader title={assessment.name} backTo="/student" backLabel="Your assessments" />
        <EmptyState
          icon={Lock}
          title={notOpenYet ? "This assessment isn't open yet" : "This assessment has closed"}
          description={
            notOpenYet
              ? `It opens on ${formatDateTimeLong(assessment.opensAt)}. You'll be able to rate your group then.`
              : `It closed on ${formatDateTimeLong(assessment.closesAt)}, so it can't be submitted any more. Speak to your lecturer if you think this is a mistake.`
          }
          action={
            <Button asChild variant="outline">
              <Link to="/student">Back to your assessments</Link>
            </Button>
          }
        />
      </div>
    );
  }

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
    try {
      const { submittedAt } = await submitEvaluation(assessmentId, studentId, entries);
      markSubmitted(submittedAt);
      await queryClient.invalidateQueries();
    } catch (error) {
      // A refusal the server gave a reason for - the closing time passed, it
      // was already submitted - is not fixed by trying again, so say what it
      // was and refresh, which shows the closed state if that is what it is.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        toast.error(error.message);
        await queryClient.invalidateQueries();
        return;
      }
      // Anything else may well pass next time. The draft is kept, so nothing is lost.
      toast.error("We couldn't submit your evaluation. Your ratings are saved - please try again.");
      return;
    } finally {
      setBusy(false);
    }
    navigate({
      to: "/student/evaluate/$assessmentId/submitted",
      params: { assessmentId },
      replace: true,
    });
  };

  return (
    <div className={FLOW}>
      <PageHeader
        title="Check before you submit"
        backTo="/student/evaluate/$assessmentId"
        backLabel="Back to the form"
        description={
          <>
            {klass.moduleCode} · {assessment.name} · <GroupLabel group={group} />. Once you submit,
            your lecturer can see your ratings.
          </>
        }
      />

      <Card className="rounded-2xl border-0 px-5 py-4 shadow-card sm:px-6">
        <ProgressBar
          value={progress.rated}
          max={progress.total}
          label={`${progress.rated} of ${progress.total} rated`}
          valueLabel={progress.complete ? "Ready to submit" : "Something is still missing"}
          tone={progress.complete ? "success" : "warning"}
        />
      </Card>

      {blocked && !progress.complete ? (
        <div
          role="alert"
          className="flex gap-3 rounded-2xl border border-danger/25 bg-card p-5 shadow-card sm:px-6"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger-muted text-danger">
            <TriangleAlert className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">
              You haven't rated{" "}
              {missingMembers.map((member, index) => (
                <span key={member.id}>
                  {index ? ", " : ""}
                  {member.name} {member.surname}
                  <GroupLeaderBadge leader={group.leaderStudentId === member.id} className="ml-2" />
                </span>
              ))}{" "}
              yet.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Every group member needs a rating before you can submit.
            </p>
          </div>
        </div>
      ) : null}

      {members.map((member, index) => {
        const entry = draft.entries[member.id] ?? {};
        const missing = !entry.ratingOptionId;

        return (
          <Card
            key={member.id}
            className={cn(
              "overflow-hidden rounded-2xl border-0 shadow-card",
              missing && "border border-warning/25",
            )}
          >
            <PanelHeader
              eyebrow={`Member ${index + 1} of ${members.length}`}
              title={
                <>
                  {member.name} {member.surname}
                  <GroupLeaderBadge leader={group.leaderStudentId === member.id} className="ml-2" />
                </>
              }
              actions={
                <Button asChild variant="ghost" size="sm">
                  <Link
                    to="/student/evaluate/$assessmentId"
                    params={{ assessmentId }}
                    hash={`member-${member.id}`}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                    <span className="sr-only">
                      {" "}
                      your rating for {member.name} {member.surname}
                    </span>
                  </Link>
                </Button>
              }
            />

            <div className="space-y-4 px-5 py-5 sm:px-6">
              {missing ? (
                <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>You haven't chosen a rating for {member.name} yet.</p>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
                <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Your comment
                </p>
                <p className="text-sm break-words text-foreground">
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

      <Card className="flex flex-col gap-4 rounded-2xl border-0 p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="min-w-0 text-sm text-muted-foreground">
          You can change your answers until this assessment closes on{" "}
          <span className="font-semibold text-foreground">
            {formatDateTimeLong(assessment.closesAt)}
          </span>
          .
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row-reverse">
          <BusyButton
            className="h-10 w-full px-4 sm:w-auto"
            busy={busy}
            busyLabel="Submitting…"
            onClick={handleSubmit}
          >
            Submit evaluation
          </BusyButton>
          <Button asChild variant="outline" className="h-10 w-full px-4 sm:w-auto">
            <Link to="/student/evaluate/$assessmentId" params={{ assessmentId }}>
              Keep editing
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
