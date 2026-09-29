import { StatusBadge } from "@/components/shared/StatusBadge";
import { useNow } from "@/hooks/use-now";
import { assessmentPhase } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import type { Assessment } from "@/mocks/types";

/**
 * An assessment's status as the lecturer needs to read it: what they last did,
 * and what the clock has done since (#14). "Open" alone hid that an assessment
 * opened early takes no work yet, and that one past its closing time takes no
 * more - it only still waits to be closed before marks can be calculated.
 */
export function AssessmentStatusBadge({
  assessment,
  className,
}: {
  assessment: Pick<Assessment, "status" | "opensAt" | "closesAt">;
  className?: string;
}) {
  // Refreshes at the next time that changes the phase, so a page left open
  // does not keep saying "Open" past the deadline.
  const nextBoundary =
    new Date(assessment.opensAt).getTime() > Date.now() ? assessment.opensAt : assessment.closesAt;
  const now = useNow(nextBoundary);
  const phase = assessmentPhase(assessment, now);

  if (phase === "scheduled") {
    return (
      <StatusBadge
        status="not-started"
        label={`Opens ${formatDate(assessment.opensAt)}`}
        className={className}
      />
    );
  }
  if (phase === "deadline-passed") {
    return <StatusBadge status="outstanding" label="Deadline passed" className={className} />;
  }
  return <StatusBadge status={assessment.status} className={className} />;
}
