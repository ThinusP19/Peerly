import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { CalendarClock, Check, CircleDashed, Cloud, Lock } from "lucide-react";
import { useEffect, useMemo } from "react";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
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
import { getStudentRatingOptions, getStudentAssessment } from "@/services/peerly";

export const Route = createFileRoute("/student/evaluate/$assessmentId/")({
  component: EvaluationForm,
});

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
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }

  if (!view.data) {
    return (
      <EmptyState
        title="We couldn't find that assessment"
        description="It may have been removed, or it may belong to a group you're not in."
        action={
          <Button asChild variant="outline">
            <Link to="/student">Back to your assessments</Link>
          </Button>
        }
      />
    );
  }

  const { assessment, klass, group } = view.data;

  if (assessment.status !== "open") {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
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

      <div className="flex items-start gap-2.5 rounded-lg border bg-card p-3.5 text-sm shadow-card">
        <CalendarClock
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-muted-foreground">
          Closes{" "}
          <span className="font-medium text-foreground">
            {formatDateTimeLong(assessment.closesAt)}
          </span>{" "}
          ({formatDeadline(assessment.closesAt)}). Your answers save as you go - you can leave and
          come back.
        </p>
      </div>

      {/* Sticky progress: always visible while scrolling through the blocks. */}
      <div className="sticky top-14 z-10 -mx-4 border-y bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/85">
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

      <div className="space-y-4">
        {members.map((member, index) => {
          const entry = draft.entries[member.id] ?? {};
          const commentId = `comment-${member.id}`;
          const rated = Boolean(entry.ratingOptionId);

          return (
            <Card key={member.id} id={`member-${member.id}`} className="p-4 shadow-card sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Member {index + 1} of {members.length}
                  </p>
                  <h2 className="text-base font-semibold text-foreground">
                    {member.name} {member.surname}
                  </h2>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                    rated
                      ? "border-success/30 bg-success-muted text-success"
                      : "border-border bg-neutral-status-muted text-neutral-status"
                  }`}
                >
                  {rated ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="size-3.5" aria-hidden="true" />
                  )}
                  {rated ? "Rated" : "Not rated"}
                </span>
              </div>

              <fieldset className="mt-4">
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

              <div className="mt-4 space-y-1.5">
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
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row-reverse sm:items-center sm:justify-start">
        <Button asChild className="w-full sm:w-auto">
          <Link to="/student/evaluate/$assessmentId/review" params={{ assessmentId }}>
            Review your ratings
          </Link>
        </Button>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link to="/student">Save and finish later</Link>
        </Button>
      </div>
    </>
  );
}
