import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Check, CircleDashed, Cloud, Lock } from "lucide-react";
import { useEffect, useMemo } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { PanelHeader } from "@/components/shared/PanelHeader";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { RatingScale } from "@/components/shared/RatingScale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_LIMIT, useDraftProgress, useEvaluationDraft } from "@/lib/evaluation-draft";
import { formatDateTimeLong, formatDeadline } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getStudentRatingOptions, getStudentAssessment } from "@/services/peerly";

export const Route = createFileRoute("/student/evaluate/$assessmentId/")({
  component: EvaluationForm,
});

// Long forms read badly at full width, so the evaluation flow is capped.
const FLOW = "mx-auto w-full max-w-3xl space-y-3";

function EvaluationForm() {
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

  const members = useMemo(() => view.data?.members ?? [], [view.data]);
  const memberIds = useMemo(() => members.map((m) => m.id), [members]);

  const { draft, hydrated, justSaved, isSubmitted, setRating, setComment } = useEvaluationDraft(
    assessmentId,
    studentId,
  );
  const progress = useDraftProgress(draft, memberIds);

  // A submitted evaluation belongs on the confirmation screen, where it can be
  // read back and - while the assessment is still open - amended.
  useEffect(() => {
    if (hydrated && isSubmitted) {
      navigate({
        to: "/student/evaluate/$assessmentId/submitted",
        params: { assessmentId },
        replace: true,
      });
    }
  }, [hydrated, isSubmitted, assessmentId, navigate]);

  if (view.isPending || options.isPending || !hydrated) {
    return (
      <div className={FLOW}>
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-14 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!view.data) {
    return (
      <div className={FLOW}>
        <EmptyState
          title="We couldn't find that assessment"
          description="It may have been removed, or it may belong to a group you're not in."
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

  if (assessment.status !== "open") {
    return (
      <div className={FLOW}>
        <PageHeader title={assessment.name} backTo="/student" backLabel="Your assessments" />
        <EmptyState
          icon={Lock}
          title={
            assessment.status === "draft"
              ? "This assessment isn't open yet"
              : "This assessment has closed"
          }
          description={
            assessment.status === "draft"
              ? `It opens on ${formatDateTimeLong(assessment.opensAt)}. You'll be able to rate your group then.`
              : `It closed on ${formatDateTimeLong(assessment.closesAt)}. Speak to your lecturer if you think this is a mistake.`
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

  return (
    <div className={FLOW}>
      <PageHeader
        title={assessment.name}
        backTo="/student"
        backLabel="Your assessments"
        description={
          <>
            {klass.moduleCode} · Group {group.groupNumber} · rate each of your {members.length}{" "}
            group members.
          </>
        }
      />

      <div className="flex items-start gap-3 rounded-2xl border-0 bg-card px-5 py-4 text-sm shadow-card sm:px-6">
        <CalendarClock
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="min-w-0 text-muted-foreground">
          Closes{" "}
          <span className="font-semibold text-foreground">
            {formatDateTimeLong(assessment.closesAt)}
          </span>{" "}
          ({formatDeadline(assessment.closesAt)}). Your answers save as you go - you can leave and
          come back.
        </p>
      </div>

      {/* Sticky progress: always visible while scrolling through the blocks. On
          phones it sits under the floating top bar; on desktop it pins to the gutter. */}
      <div className="sticky top-22 z-10 rounded-2xl bg-card/95 px-5 py-3 shadow-card backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:px-6 lg:top-3">
        <ProgressBar
          value={progress.rated}
          max={progress.total}
          label={`${progress.rated} of ${progress.total} rated`}
          valueLabel={
            justSaved ? "Saved" : progress.complete ? "All members rated" : "Not finished yet"
          }
          tone={progress.complete ? "success" : "primary"}
        />
        {justSaved ? (
          <p
            className="mt-1.5 flex items-center gap-1.5 text-xs text-success"
            role="status"
            aria-live="polite"
          >
            <Cloud className="size-3.5" aria-hidden="true" />
            Draft saved
          </p>
        ) : null}
      </div>

      {members.map((member, index) => {
        const entry = draft.entries[member.id] ?? {};
        const commentId = `comment-${member.id}`;
        const rated = Boolean(entry.ratingOptionId);

        return (
          <Card
            key={member.id}
            id={`member-${member.id}`}
            // Keeps a member jumped to from the review page clear of the sticky bars.
            className="scroll-mt-48 overflow-hidden rounded-2xl border-0 shadow-card lg:scroll-mt-28"
          >
            <PanelHeader
              eyebrow={`Member ${index + 1} of ${members.length}`}
              title={`${member.name} ${member.surname}`}
              actions={
                // Same tone strings as StatusBadge, with form-specific wording.
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                    rated
                      ? "border-success/30 bg-success-muted text-success"
                      : "border-border bg-neutral-status-muted text-neutral-status",
                  )}
                >
                  {rated ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="size-3.5" aria-hidden="true" />
                  )}
                  {rated ? "Rated" : "Not rated"}
                </span>
              }
            />

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-foreground">
                  How did {member.name} contribute to the group's work?
                </legend>
                <RatingScale
                  options={options.data ?? []}
                  name={`rating-${member.id}`}
                  value={entry.ratingOptionId}
                  onChange={(ratingOptionId) => setRating(member.id, ratingOptionId)}
                />
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor={commentId}>
                  Comment about {member.name}{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id={commentId}
                  rows={3}
                  maxLength={COMMENT_LIMIT}
                  value={entry.comment ?? ""}
                  onChange={(event) => setComment(member.id, event.target.value)}
                  placeholder="Anything your lecturer should know about how this person worked with the group."
                />
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  {(entry.comment ?? "").length} / {COMMENT_LIMIT}
                </p>
              </div>
            </div>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-2 rounded-2xl border-0 p-5 shadow-card sm:flex-row-reverse sm:items-center sm:px-6">
        <Button asChild className="h-10 w-full px-4 sm:w-auto">
          <Link to="/student/evaluate/$assessmentId/review" params={{ assessmentId }}>
            Review your ratings
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-10 w-full px-4 sm:w-auto">
          <Link to="/student">Save and finish later</Link>
        </Button>
      </Card>
    </div>
  );
}
